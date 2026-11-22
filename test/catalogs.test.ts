import { expect, it } from 'vitest'
import type { Catalogs } from '../server/catalogs.ts'
import { makeBackroads } from '../server/modes/backroads.ts'
import { testRound } from './helpers.ts'

// Best known first, as the builder writes them.
const catalogs: Catalogs = new Map([['things', { id: 'things', unit: 'name', source: 'test', entries: [
  ['Famous extra', 0, 90, ['celebrity']],
  ['Topaz gem', 0, 80, ['tpz']], // shares an alias with the hand answer "Topaz": same thing, its name joins Topaz
  ['Middling', 0, 30, ['famous extra']], // alias clashes with a better-known entry: alias dropped
  ['Obscure', 0, 3, []],
] }]])

const m = makeBackroads(catalogs)
const p = m.parse({ ...testRound(), catalog: 'things' })
const say = (text: string) => m.view(m.apply(m.start(p, 0), { type: 'answer', text }, p, 0), 0).last

it('adds catalog names under the hand list, more obscure the less known they are', () => {
  expect(say('Famous extra')).toMatchObject({ result: 'scored', pick: { name: 'Famous extra', obscurity: 36 } })
  expect(say('Middling')).toMatchObject({ pick: { obscurity: 51 } })
  expect(say('Obscure')).toMatchObject({ pick: { obscurity: 84 } })
  expect(say('tpz')).toMatchObject({ pick: { name: 'Topaz', obscurity: 92 } }) // the hand answer wins
  expect(say('Topaz gem')).toMatchObject({ pick: { name: 'Topaz', obscurity: 92 } })
})

it('matches typos only on well-known catalog names', () => {
  expect(say('Famous extro')).toMatchObject({ pick: { name: 'Famous extra' } })
  expect(say('Obscur')).toMatchObject({ result: 'not-found' })
})

it('rejects a missing catalog', () => {
  expect(() => m.parse({ ...testRound(), catalog: 'nope' })).toThrow(/no catalog "nope"/)
})
