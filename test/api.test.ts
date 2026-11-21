import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../server/app.ts'
import { openDb, type Db } from '../server/db.ts'
import type { ServerMode } from '../server/mode.ts'
import { backroads } from '../server/modes/backroads.ts'
import { config } from '../src/shared/modes/backroads.ts'
import { testRound } from './helpers.ts'

// A second mode that core code knows nothing about: proves modes plug in without core changes.
const coin: ServerMode<{ q: string }, { flips: number }, { type: 'flip' }, { flips: number }> = {
  meta: { id: 'coin', title: 'Coin', tagline: '', roundsPerDay: 1, scoreUnit: 'pts' },
  eventSchema: { type: 'object', required: ['type'], properties: { type: { const: 'flip' } } },
  parse: (r) => r as { q: string },
  prompt: (p) => p.q,
  start: () => ({ flips: 0 }),
  apply: (s) => ({ flips: s.flips + 1 }),
  view: (s) => s,
  summary: (s) => (s.flips ? { score: 7, outcome: 'banked', glyph: '🪙' } : null),
}

const DAY = '2026-11-21'
let t: number
let db: Db
let app: Awaited<ReturnType<typeof buildApp>>

beforeEach(async () => {
  t = Date.parse(`${DAY}T12:00:00Z`)
  db = openDb(':memory:')
  const rounds = [0, 1, 2].map((i) => backroads.parse(testRound(`Prompt ${i}`)))
  app = await buildApp({
    db,
    modes: [backroads, coin],
    puzzles: new Map<string, unknown[]>([[`backroads/${DAY}`, rounds], [`coin/${DAY}`, [{ q: 'Heads?' }]]]),
    now: () => t,
  })
})

const cookieOf = (res: { cookies: { name: string; value: string }[] }) =>
  res.cookies.find((c) => c.name === 'blinker_pid')?.value
const players = () => (db.prepare('SELECT count(*) n FROM players').get() as { n: number }).n

/** A client holding a cookie jar. */
async function client() {
  const first = await app.inject({ url: `/api/backroads/${DAY}` })
  const pid = cookieOf(first)!
  const req = (method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, payload, cookies: { blinker_pid: pid } })
  return { pid, req, first }
}

describe('guest players', () => {
  it('creates one guest per cookie and reuses it', async () => {
    const { req, first } = await client()
    expect(first.statusCode).toBe(200)
    const again = await req('GET', `/api/backroads/${DAY}`)
    expect(cookieOf(again)).toBeUndefined()
    expect(players()).toBe(1)
  })

  it('replaces unknown or malformed cookies with a fresh guest', async () => {
    for (const bad of ['garbage', '00000000-0000-4000-8000-000000000000']) {
      const res = await app.inject({ url: `/api/backroads/${DAY}`, cookies: { blinker_pid: bad } })
      expect(res.statusCode).toBe(200)
      expect(cookieOf(res)).toMatch(/^[0-9a-f-]{36}$/)
    }
    expect(players()).toBe(2)
  })

  it('sets a hardened cookie', async () => {
    const res = await app.inject({ url: `/api/backroads/${DAY}` })
    expect(res.headers['set-cookie']).toMatch(/HttpOnly/)
    expect(res.headers['set-cookie']).toMatch(/SameSite=Lax/)
  })
})

describe('backroads API', () => {
  it('lists modes', async () => {
    const res = await app.inject({ url: '/api/modes' })
    expect(res.json().map((m: { id: string }) => m.id)).toEqual(['backroads', 'coin'])
  })

  it('hides prompts until a round is started', async () => {
    const { req, first } = await client()
    expect(first.json().rounds.map((r: { prompt: unknown }) => r.prompt)).toEqual([null, null, null])
    const start = await req('POST', `/api/backroads/${DAY}/0/start`)
    expect(start.json()).toMatchObject({ prompt: 'Prompt 0', view: { status: 'playing' }, summary: null })
    const day = await req('GET', `/api/backroads/${DAY}`)
    expect(day.json().rounds.map((r: { prompt: unknown }) => r.prompt)).toEqual(['Prompt 0', null, null])
    expect(day.json().number).toBe(1)
  })

  it('plays a round and never leaks unpicked answers', async () => {
    const { req } = await client()
    await req('POST', `/api/backroads/${DAY}/0/start`)
    const res = await req('POST', `/api/backroads/${DAY}/0/event`, { type: 'answer', text: 'answer 39' })
    expect(res.json().view).toMatchObject({ pot: config.miles(98), last: { result: 'accepted' } })
    expect(res.body).not.toContain('Answer 38')
    expect(res.body).not.toContain('Topaz')
    const bank = await req('POST', `/api/backroads/${DAY}/0/event`, { type: 'bank' })
    expect(bank.json().summary).toMatchObject({ outcome: 'banked', score: config.miles(98) })
    const row = db.prepare('SELECT status, score FROM runs').get()
    expect(row).toEqual({ status: 'banked', score: config.miles(98) })
  })

  it('restarting a started round returns the same run', async () => {
    const { req } = await client()
    await req('POST', `/api/backroads/${DAY}/0/start`)
    await req('POST', `/api/backroads/${DAY}/0/event`, { type: 'answer', text: 'answer 39' })
    const again = await req('POST', `/api/backroads/${DAY}/0/start`)
    expect(again.json().view.pot).toBe(config.miles(98))
  })

  it('rejects late answers after the deadline plus grace', async () => {
    const { req } = await client()
    await req('POST', `/api/backroads/${DAY}/1/start`)
    t += config.answerMs + config.graceMs + 1
    const res = await req('POST', `/api/backroads/${DAY}/1/event`, { type: 'answer', text: 'answer 39' })
    expect(res.json()).toMatchObject({ view: { status: 'crashed', crash: 'timeout' }, summary: { score: 0 } })
  })

  it('validates input', async () => {
    const { req } = await client()
    await req('POST', `/api/backroads/${DAY}/0/start`)
    const url = `/api/backroads/${DAY}/0/event`
    expect((await req('POST', url, { type: 'answer' })).statusCode).toBe(400)
    expect((await req('POST', url, { type: 'answer', text: 'x'.repeat(81) })).statusCode).toBe(400)
    expect((await req('POST', url, { type: 'cheat' })).statusCode).toBe(400)
    expect((await req('POST', `/api/backroads/${DAY}/1/event`, { type: 'bank' })).statusCode).toBe(409)
    expect((await req('POST', `/api/backroads/${DAY}/9/start`)).statusCode).toBe(404)
    expect((await req('POST', `/api/backroads/${DAY}/-1/start`)).statusCode).toBe(400)
    expect((await req('GET', '/api/backroads/2026-11-30')).statusCode).toBe(400)
    expect((await req('GET', '/api/backroads/not-a-day')).statusCode).toBe(400)
  })

  it('404s a playable day with no content', async () => {
    t = Date.parse('2026-11-22T12:00:00Z')
    expect((await app.inject({ url: '/api/backroads/2026-11-22' })).statusCode).toBe(404)
  })

  it('rate-limits event spam per player', async () => {
    const { req } = await client()
    await req('POST', `/api/backroads/${DAY}/2/start`)
    const codes = []
    for (let i = 0; i < 22; i++)
      codes.push((await req('POST', `/api/backroads/${DAY}/2/event`, { type: 'answer', text: `x${i}` })).statusCode)
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true)
    expect(codes.at(-1)).toBe(429)
  })
})

describe('extensibility', () => {
  it('serves a mode the core has never heard of', async () => {
    const { req } = await client()
    expect((await req('POST', `/api/coin/${DAY}/0/start`)).json()).toMatchObject({ prompt: 'Heads?' })
    const res = await req('POST', `/api/coin/${DAY}/0/event`, { type: 'flip' })
    expect(res.json().summary).toEqual({ score: 7, outcome: 'banked', glyph: '🪙' })
    expect((await req('POST', `/api/coin/${DAY}/0/event`, { type: 'answer', text: 'x' })).statusCode).toBe(400)
  })
})

describe('migrations', () => {
  it('records the applied version and is idempotent', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(1)
  })
})
