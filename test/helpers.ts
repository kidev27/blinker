import { tiers } from '../src/shared/modes/backroads.ts'

/** A valid Backroads round: "Answer 0".."Answer 39", obscurity rising 0..97. */
export function testRound(prompt = 'Name a test thing') {
  const answers: Record<string, number> = {}
  for (let i = 0; i < 40; i++) answers[`Answer ${i}`] = Math.round(i * 2.5)
  answers['Topaz|tpz'] = 92
  return { prompt, answers }
}

export const tierMin = (name: string) => tiers.find((t) => t.name === name)!.min
