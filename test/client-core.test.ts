import { expect, it } from 'vitest'
import { shareText } from '../src/client/core/share.ts'
import { liveCount, nextStreak } from '../src/client/core/streaks.ts'

it('builds a streak day by day', () => {
  let s = nextStreak(null, '2026-11-21')
  expect(s).toEqual({ last: '2026-11-21', count: 1, best: 1 })
  s = nextStreak(s, '2026-11-21')
  expect(s.count).toBe(1)
  s = nextStreak(s, '2026-11-22')
  expect(s).toEqual({ last: '2026-11-22', count: 2, best: 2 })
  s = nextStreak(s, '2026-11-25')
  expect(s).toEqual({ last: '2026-11-25', count: 1, best: 2 })
})

it('shows a streak only while it is alive', () => {
  const s = { last: '2026-11-22', count: 4, best: 4 }
  expect(liveCount(s, '2026-11-22')).toBe(4)
  expect(liveCount(s, '2026-11-23')).toBe(4)
  expect(liveCount(s, '2026-11-24')).toBe(0)
  expect(liveCount(null, '2026-11-24')).toBe(0)
})

it('share text works for any mode and spoils nothing', () => {
  const meta = { id: 'coin', title: 'Coin', tagline: '', roundsPerDay: 2, scoreUnit: 'pts' }
  const text = shareText(meta, 12, [{ score: 5, outcome: 'banked', glyph: '🪙↗' }, { score: 0, outcome: 'crashed', glyph: '💥' }], 'https://x.test')
  expect(text).toBe('Blinker · Coin #12\n🪙↗\n💥\n5 pts\nhttps://x.test')
})
