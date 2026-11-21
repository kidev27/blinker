import { describe, expect, it } from 'vitest'
import { buildIndex, distance, match, normalize } from '../server/match.ts'

const idx = (answers: [string, ...string[]][]) =>
  buildIndex(answers.map(([name, ...aliases]) => ({ name, aliases })))

describe('normalize', () => {
  it('folds case, accents, punctuation and a leading article', () => {
    expect(normalize("  The Côte d’Ivoire!! ")).toBe('cote d ivoire')
    expect(normalize('Trinidad & Tobago')).toBe('trinidad and tobago')
  })
})

describe('match', () => {
  const africa = idx([['Mozambique'], ["Côte d'Ivoire", 'Ivory Coast'], ['Chad'], ['Niger'], ['Nigeria']])

  it('matches names and aliases exactly', () => {
    expect(match(africa, "cote d'ivoire")).toBe(1)
    expect(match(africa, 'IVORY COAST')).toBe(1)
  })

  it('forgives small typos on longer words', () => {
    expect(match(africa, 'Mozambiqe')).toBe(0)
    expect(match(africa, 'Mozmabique')).toBe(0) // swapped letters
  })

  it('never fuzzes short inputs', () => {
    expect(match(africa, 'Chda')).toBe(null)
  })

  it('refuses ambiguous typos', () => {
    expect(match(africa, 'Nigeri')).toBe(null) // one edit from Niger and from Nigeria
  })

  it('never fuzzy-matches aliases', () => {
    const fish = idx([['Threebanded Sheephead', 'sea donkey']])
    expect(match(fish, 'sea donkey')).toBe(0)
    expect(match(fish, 'sea monkey')).toBe(null)
  })

  it('rejects empty input', () => {
    expect(match(africa, ' ?! ')).toBe(null)
  })
})

describe('buildIndex', () => {
  it('throws when two answers share a name or alias', () => {
    expect(() => idx([['Congo', 'Congo-Brazzaville'], ['DR Congo', 'Congo']])).toThrow(/matches both/)
  })
})

describe('distance', () => {
  it('counts an adjacent swap as one edit and caps at max+1', () => {
    expect(distance('abcd', 'abdc', 2)).toBe(1)
    expect(distance('kitten', 'sitting', 3)).toBe(3)
    expect(distance('kitten', 'sitting', 1)).toBe(2)
  })
})
