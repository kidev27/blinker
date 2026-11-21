// Backroads: name things in a category; each answer must clear a rising obscurity bar.
// Bank ("take the exit") any time. An answer below the bar, or running out of time, crashes the round.
import type { ModeMeta } from '../mode.ts'

export const config = {
  roundsPerDay: 3,
  answerMs: 20_000,
  /** Network latency allowance on the server-side deadline. */
  graceMs: 2_000,
  /** Minimum tier index for answer N (0-based); the last value repeats. */
  bar: [0, 0, 1, 1, 2, 2, 3, 3, 4],
  miles: (obscurity: number) => 10 + obscurity,
  minAnswers: 40,
  minTiers: 4,
}

export const tiers = [
  { name: 'Highway', min: 0, glyph: '⬜' },
  { name: 'Main Road', min: 25, glyph: '🟨' },
  { name: 'Side Street', min: 50, glyph: '🟧' },
  { name: 'Backroad', min: 75, glyph: '🟥' },
  { name: 'Dirt Track', min: 90, glyph: '🟪' },
]

export const tierIndex = (obscurity: number) => tiers.findLastIndex((t) => obscurity >= t.min)
export const barAt = (answerIndex: number) => config.bar[Math.min(answerIndex, config.bar.length - 1)]

export const meta: ModeMeta = {
  id: 'backroads',
  title: 'Backroads',
  tagline: 'Name it. The rarer, the farther. Take the exit before you crash.',
  roundsPerDay: config.roundsPerDay,
  scoreUnit: 'mi',
}

export type BackroadsEvent = { type: 'answer'; text: string } | { type: 'bank' } | { type: 'timeout' }

export interface Pick {
  name: string
  obscurity: number
}

export interface LastAnswer {
  input: string
  result: 'accepted' | 'not-found' | 'repeat' | 'too-obvious'
  pick?: Pick
}

/** What the player sees. Never contains the answer list. */
export interface BackroadsView {
  status: 'playing' | 'banked' | 'crashed'
  crash?: 'too-obvious' | 'timeout'
  msLeft: number
  picks: Pick[]
  pot: number
  /** Tier index the next answer must reach. */
  need: number
  last?: LastAnswer
}
