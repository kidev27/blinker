// Contract every game mode fulfils. Core code (home, streaks, share, API routes) only sees these.
export interface ModeMeta {
  id: string
  title: string
  tagline: string
  roundsPerDay: number
  scoreUnit: string
}

export interface RoundSummary {
  score: number
  outcome: 'banked' | 'crashed'
  /** Spoiler-free glyph line for share text. */
  glyph: string
}
