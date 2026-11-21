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

  it('starts with a full clock and an open bar', () => {
    expect(m.view(s0, T0)).toMatchObject({ status: 'playing', msLeft: config.answerMs, pot: 0, need: 0 })
  })

  it('accepts an answer, adds miles, resets the clock', () => {
    const s = m.apply(s0, answer('answer 4'), p, T0 + 5_000)
    expect(m.view(s, T0 + 5_000)).toMatchObject({
      pot: config.miles(10),
      msLeft: config.answerMs,
      last: { result: 'accepted', pick: { name: 'Answer 4', obscurity: 10 } },
    })
  })

  it('ignores unknown answers and repeats without resetting the clock', () => {
    const miss = m.apply(s0, answer('nope'), p, T0 + 5_000)
    expect(m.view(miss, T0 + 5_000)).toMatchObject({ status: 'playing', msLeft: 15_000, last: { result: 'not-found' } })
    const once = m.apply(s0, answer('Answer 4'), p, T0)
    const twice = m.apply(once, answer('answer 4'), p, T0 + 1)
    expect(twice.picks).toHaveLength(1)
    expect(twice.last?.result).toBe('repeat')
  })

  it('crashes on an answer below the bar and scores 0', () => {
    let s = m.apply(s0, answer('Answer 0'), p, T0)
    s = m.apply(s, answer('Answer 1'), p, T0) // bar for the 3rd answer is Main Road (25+)
    s = m.apply(s, answer('Answer 2'), p, T0) // obscurity 5
    expect(s.status).toBe('crashed')
    expect(m.summary(s)).toEqual({ score: 0, outcome: 'crashed', glyph: '⬜⬜💥' })
  })

  it('banks the pot', () => {
    let s = m.apply(s0, answer('Answer 39'), p, T0) // 98 -> Dirt Track
    s = m.apply(s, answer('tpz'), p, T0)
    s = m.apply(s, { type: 'bank' }, p, T0)
    expect(m.summary(s)).toEqual({ score: config.miles(98) + config.miles(92), outcome: 'banked', glyph: '🟪🟪↗' })
    expect(m.apply(s, answer('Answer 30'), p, T0)).toBe(s) // finished rounds are frozen
  })

  it('times out only after the deadline, with grace for late answers', () => {
    expect(m.apply(s0, { type: 'timeout' }, p, T0 + config.answerMs - 1)).toBe(s0)
    expect(m.apply(s0, { type: 'timeout' }, p, T0 + config.answerMs).crash).toBe('timeout')
    expect(m.apply(s0, answer('Answer 39'), p, T0 + config.answerMs + config.graceMs).status).toBe('playing')
    expect(m.apply(s0, answer('Answer 39'), p, T0 + config.answerMs + config.graceMs + 1).crash).toBe('timeout')
  })

  it('never exposes the answer list in the view', () => {
    const s = m.apply(s0, answer('Answer 39'), p, T0)
    const json = JSON.stringify(m.view(s, T0))
    expect(json).toContain('Answer 39')
    expect(json).not.toContain('Answer 38')
    expect(json).not.toContain('Topaz')
  })
})
