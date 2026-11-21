import { addDays } from '../../shared/day.ts'
import { load, save } from './storage.ts'

export interface Streak {
  last: string
  count: number
  best: number
}

const key = (modeId: string) => `blinker:streak:${modeId}`

/** Streak after finishing `day`. Same day twice changes nothing; a missed day restarts at 1. */
export function nextStreak(prev: Streak | null, day: string): Streak {
  if (prev?.last === day) return prev
  const count = prev && addDays(prev.last, 1) === day ? prev.count + 1 : 1
  return { last: day, count, best: Math.max(count, prev?.best ?? 0) }
}

/** Current streak as of `today`: still alive if the last finished day was today or yesterday. */
export const liveCount = (s: Streak | null, today: string) =>
  s && (s.last === today || addDays(s.last, 1) === today) ? s.count : 0

export const getStreak = (modeId: string) => load<Streak | null>(key(modeId), null)

export function recordDay(modeId: string, day: string): Streak {
  const s = nextStreak(getStreak(modeId), day)
  save(key(modeId), s)
  return s
}
