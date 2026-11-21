import { describe, expect, it } from 'vitest'
import { config } from '../src/shared/modes/backroads.ts'
import { backroads as m } from '../server/modes/backroads.ts'
import { testRound } from './helpers.ts'

const p = m.parse(testRound())
const T0 = 1_000_000
const answer = (text: string) => ({ type: 'answer' as const, text })

describe('parse', () => {
  it('rejects bad content', () => {
    expect(() => m.parse({ prompt: 'x', answers: { a: 1 } })).toThrow(/need 40/)
    expect(() => m.parse({ ...testRound(), answers: { ...testRound().answers, Bad: 101 } })).toThrow(/0-100/)
    const flat = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`A${i}`, 10]))
    expect(() => m.parse({ prompt: 'flat', answers: flat })).toThrow(/tiers/)
    expect(() => m.parse({ prompt: '', answers: {} })).toThrow(/prompt/)
  })
})

describe('round', () => {
  const s0 = m.start(p, T0)
  const { tankMs, refuelMs } = config

  it('starts with a full tank and an open sign', () => {
    expect(m.view(s0, T0)).toMatchObject({ status: 'playing', msLeft: tankMs, miles: 0, bonus: 0, need: 0 })
  })

  it('scores an answer and refuels by tier', () => {
    const s = m.apply(s0, answer('answer 4'), p, T0 + 5_000) // obscurity 10: Highway
    expect(m.view(s, T0 + 5_000)).toMatchObject({
      miles: config.miles(10),
      msLeft: tankMs - 5_000 + refuelMs[0],
      last: { result: 'scored', pick: { name: 'Answer 4', obscurity: 10, miles: config.miles(10) }, refuelMs: refuelMs[0] },
    })
  })

  it('never fills past the tank', () => {
    const s = m.apply(s0, answer('Topaz'), p, T0) // Dirt Track on a full tank
    expect(m.view(s, T0).msLeft).toBe(tankMs)
  })

  it('accepts answers below the sign for no miles and no fuel, and keeps going', () => {
    let s = m.apply(s0, answer('Answer 0'), p, T0)
    s = m.apply(s, answer('Answer 1'), p, T0) // the sign now needs Main Road (25+)
    const before = m.view(s, T0 + 1_000)
    s = m.apply(s, answer('Answer 2'), p, T0 + 1_000) // obscurity 5
    expect(m.view(s, T0 + 1_000)).toMatchObject({
      status: 'playing',
      miles: before.miles,
      msLeft: before.msLeft,
      need: 1,
      last: { result: 'below-sign', pick: { name: 'Answer 2', miles: 0 } },
    })
    expect(m.apply(s, answer('answer 2'), p, T0 + 2_000).last?.result).toBe('repeat')
  })

  it('ignores unknown answers without refuelling', () => {
    const miss = m.apply(s0, answer('nope'), p, T0 + 5_000)
    expect(m.view(miss, T0 + 5_000)).toMatchObject({ status: 'playing', msLeft: tankMs - 5_000, last: { result: 'not-found' } })
  })

  it('pulls over and turns whole seconds of fuel left into miles', () => {
    let s = m.apply(s0, answer('Answer 39'), p, T0) // 98, Dirt Track
    s = m.apply(s, { type: 'stop' }, p, T0 + 10_500) // 19.5 s left: 19 whole seconds
    const bonus = 19 * config.pullOverMilesPerSec
    expect(m.view(s, T0 + 10_500)).toMatchObject({ status: 'finished', end: 'pulled-over', bonus })
    expect(m.summary(s)).toEqual({ score: config.miles(98) + bonus, outcome: 'pulled-over', glyph: '🟪🅿️' })
    expect(m.apply(s, answer('Answer 30'), p, T0 + 11_000)).toBe(s) // finished rounds are frozen
  })

  it('runs out of gas at the deadline and keeps every mile', () => {
    const s = m.apply(s0, answer('Answer 39'), p, T0) // tank stays full
    expect(m.apply(s, { type: 'timeout' }, p, T0 + tankMs - 1)).toBe(s)
    const out = m.apply(s, { type: 'timeout' }, p, T0 + tankMs)
    expect(m.summary(out)).toEqual({ score: config.miles(98), outcome: 'out-of-gas', glyph: '🟪⛽' })
  })

  it('allows latency grace, then ends the round', () => {
    expect(m.apply(s0, answer('Answer 39'), p, T0 + tankMs + config.graceMs).status).toBe('playing')
    const late = m.apply(s0, answer('Answer 39'), p, T0 + tankMs + config.graceMs + 1)
    expect(late).toMatchObject({ status: 'finished', end: 'out-of-gas', miles: 0 })
  })

  it('marks below-sign answers in the share glyph', () => {
    let s = m.apply(s0, answer('Answer 0'), p, T0)
    s = m.apply(s, answer('Answer 1'), p, T0)
    s = m.apply(s, answer('Answer 2'), p, T0)
    s = m.apply(s, { type: 'stop' }, p, T0)
    expect(m.summary(s)?.glyph).toBe('⬜⬜⬛🅿️')
  })

  it('never exposes the answer list in the view', () => {
    const s = m.apply(s0, answer('Answer 39'), p, T0)
    const json = JSON.stringify(m.view(s, T0))
    expect(json).toContain('Answer 39')
    expect(json).not.toContain('Answer 38')
    expect(json).not.toContain('Topaz')
  })
})
