// Backroads: name things in a category against a fuel tank. Answers that clear the road sign
// score miles and refuel the tank (rarer refuels more); answers below the sign score nothing.
// The round ends when the tank runs dry, or when you pull over and cash in the fuel that's left.
import type { ModeMeta } from '../mode.ts'

export const config = {
  roundsPerDay: 3,
  /** Tank size: the starting fuel and the most it can ever hold. */
  tankMs: 30_000,
  /** Fuel added by an answer that clears the sign, by tier (Highway to Dirt Track). */
  refuelMs: [2_000, 3_000, 4_000, 6_000, 8_000],
  /** Miles per whole second of fuel left when you pull over. */
  pullOverMilesPerSec: 2,
  /** Network latency allowance on the server-side deadline. */
  graceMs: 2_000,
  /** Minimum tier index for scoring answer N (0-based); the last value repeats. */
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
  tagline: 'Name it. The rarer, the farther, and rare answers refuel the tank.',
  roundsPerDay: config.roundsPerDay,
  scoreUnit: 'mi',
}

export type BackroadsEvent = { type: 'answer'; text: string } | { type: 'stop' } | { type: 'timeout' }

export interface Pick {
  name: string
  obscurity: number
  /** 0 when the answer was below the road sign. */
  miles: number
}

export interface LastAnswer {
  input: string
  result: 'scored' | 'below-sign' | 'not-found' | 'repeat'
  pick?: Pick
  /** Fuel added, for a scored answer. */
  refuelMs?: number
}

/** What the player sees. Never contains the answer list. */
export interface BackroadsView {
  status: 'playing' | 'finished'
  end?: 'pulled-over' | 'out-of-gas'
  msLeft: number
  picks: Pick[]
  /** Miles from answers (not counting the pull-over bonus). */
  miles: number
  /** Miles from fuel left when pulling over. */
  bonus: number
  /** Tier index the next answer must reach to score. */
  need: number
  last?: LastAnswer
}

/** Pull-over bonus for a given amount of fuel left. */
export const fuelBonus = (msLeft: number) => Math.floor(Math.max(0, msLeft) / 1000) * config.pullOverMilesPerSec
