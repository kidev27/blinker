import {
  barAt, config, fuelBonus, meta, tierIndex, tiers,
  type BackroadsEvent, type BackroadsView, type LastAnswer, type Pick,
} from '../../src/shared/modes/backroads.ts'
import { fileURLToPath } from 'node:url'
import { loadCatalogs, type CatalogEntry, type Catalogs } from '../catalogs.ts'
import { buildIndex, match, normalize, type AnswerIndex } from '../match.ts'
import type { ServerMode } from '../mode.ts'

interface Answer { name: string; aliases: string[]; obscurity: number; fuzzy?: boolean }

/**
 * Obscurity of a catalog answer from its fame (Wikipedias with an article): 100 for 1, about 50 for
 * 30, never below 30, so an answer the hand list didn't think of is at least a Main Road.
 */
export const catalogObscurity = (fame: number) => Math.round(Math.min(100, Math.max(30, 100 - 33 * Math.log10(Math.max(1, fame)))))
/** Catalog answers this well known (Wikipedias with an article) also match with a small typo. */
export const FUZZY_FAME = 20

/**
 * Catalog entries to add under the hand-written answers. An entry sharing a name or alias with a
 * hand answer is the same thing and is skipped; an alias clashing with a better-known entry is dropped.
 */
function fromCatalog(entries: CatalogEntry[], hand: Answer[]): Answer[] {
  const same = new Set(hand.flatMap((a) => [a.name, ...a.aliases].map(normalize)))
  const taken = new Set(same)
  const out: Answer[] = []
  for (const [name, , fame, aliases] of entries) {
    const k = normalize(name)
    if (!k || taken.has(k) || aliases.some((s) => same.has(normalize(s)))) continue
    const own = [...new Set(aliases.map((a) => a.trim()))].filter((a) => normalize(a) && normalize(a) !== k && !taken.has(normalize(a)))
    ;[k, ...own.map(normalize)].forEach((x) => taken.add(x))
    out.push({ name, aliases: own, obscurity: catalogObscurity(fame), fuzzy: fame >= FUZZY_FAME })
  }
  return out
}
interface Puzzle { prompt: string; index: AnswerIndex<Answer> }

interface State {
  status: BackroadsView['status']
  end?: BackroadsView['end']
  /** When the tank runs dry (server clock). */
  deadline: number
  picks: Pick[]
  miles: number
  bonus: number
  last?: LastAnswer
}

/**
 * Content format: { "prompt": "...", "answers": { "Name|alias|alias": obscurity 0-100 }, "catalog"?: id }.
 * A catalog (content/catalogs/<id>.json, built from Wikidata) adds its entries under the hand list.
 * Validated at boot, so a bad content file stops the server instead of breaking a round.
 */
const parse = (catalogs: Catalogs) => (raw: unknown): Puzzle => {
  const r = raw as { prompt?: unknown; answers?: unknown; catalog?: unknown }
  if (typeof r?.prompt !== 'string' || !r.prompt.trim()) throw new Error('missing prompt')
  if (!r.answers || typeof r.answers !== 'object') throw new Error(`"${r.prompt}": missing answers`)
  const answers = Object.entries(r.answers).map(([names, obscurity]): Answer => {
    if (!Number.isInteger(obscurity) || obscurity < 0 || obscurity > 100)
      throw new Error(`"${r.prompt}": obscurity of "${names}" must be an integer 0-100`)
    const [name, ...aliases] = names.split('|').map((s) => s.trim())
    return { name, aliases, obscurity }
  })
  if (answers.length < config.minAnswers)
    throw new Error(`"${r.prompt}": ${answers.length} answers, need ${config.minAnswers}`)
  const used = new Set(answers.map((a) => tierIndex(a.obscurity))).size
  if (used < config.minTiers) throw new Error(`"${r.prompt}": answers span ${used} tiers, need ${config.minTiers}`)
  if (!answers.some((a) => tierIndex(a.obscurity) === tiers.length - 1))
    throw new Error(`"${r.prompt}": needs at least one ${tiers.at(-1)!.name} answer`)
  try {
    buildIndex(answers) // hand-written answers must not clash with each other
    if (r.catalog !== undefined) {
      const cat = catalogs.get(String(r.catalog))
      if (!cat) throw new Error(`no catalog "${r.catalog}"`)
      answers.push(...fromCatalog(cat.entries, answers))
    }
    return { prompt: r.prompt, index: buildIndex(answers) }
  } catch (e) {
    throw new Error(`"${r.prompt}": ${(e as Error).message}`)
  }
}

const finish = (s: State, end: State['end'], bonus = 0): State => ({ ...s, status: 'finished', end, bonus })

function apply(s: State, e: BackroadsEvent, p: Puzzle, now: number): State {
  if (s.status !== 'playing') return s
  if (now > s.deadline + config.graceMs) return finish(s, 'out-of-gas')
  if (e.type === 'timeout') return now >= s.deadline ? finish(s, 'out-of-gas') : s
  if (e.type === 'stop') return finish(s, 'pulled-over', fuelBonus(s.deadline - now))

  const input = e.text.trim()
  const i = match(p.index, input)
  if (i === null) return { ...s, last: { input, result: 'not-found' } }
  const { name, obscurity } = p.index.answers[i]
  if (s.picks.some((x) => x.name === name)) {
    const pick = s.picks.find((x) => x.name === name)
    return { ...s, last: { input, result: 'repeat', pick } }
  }
  const tier = tierIndex(obscurity)
  const scored = s.picks.filter((x) => x.miles > 0).length
  // Below the sign: accepted and used up, but no miles and no fuel. The round goes on.
  if (tier < barAt(scored)) {
    const pick = { name, obscurity, miles: 0 }
    return { ...s, picks: [...s.picks, pick], last: { input, result: 'below-sign', pick } }
  }
  const pick = { name, obscurity, miles: config.miles(obscurity) }
  const refuelMs = config.refuelMs[tier]
  const fuel = Math.min(config.tankMs, s.deadline - now + refuelMs)
  return {
    ...s,
    picks: [...s.picks, pick],
    miles: s.miles + pick.miles,
    deadline: now + Math.max(0, fuel),
    last: { input, result: 'scored', pick, refuelMs },
  }
}

const END_GLYPH = { 'pulled-over': '🅿️', 'out-of-gas': '⛽' }

/** The mode with a given set of catalogs (tests pass their own). */
export const makeBackroads = (catalogs: Catalogs): ServerMode<Puzzle, State, BackroadsEvent, BackroadsView> => ({
  meta,
  // One object schema, not oneOf: Fastify's validator strips properties per branch, which would
  // drop `text` while trying the bank/timeout branch.
  eventSchema: {
    type: 'object',
    required: ['type'],
    additionalProperties: false,
    properties: {
      type: { enum: ['answer', 'stop', 'timeout'] },
      text: { type: 'string', minLength: 1, maxLength: 80 },
    },
    if: { properties: { type: { const: 'answer' } } },
    then: { required: ['text'] },
  },
  parse: parse(catalogs),
  prompt: (p) => p.prompt,
  start: (_p, now) => ({ status: 'playing', deadline: now + config.tankMs, picks: [], miles: 0, bonus: 0 }),
  apply,
  view: (s, now) => ({
    status: s.status,
    end: s.end,
    msLeft: s.status === 'playing' ? Math.max(0, s.deadline - now) : 0,
    picks: s.picks,
    miles: s.miles,
    bonus: s.bonus,
    need: barAt(s.picks.filter((x) => x.miles > 0).length),
    last: s.last,
  }),
  summary: (s) =>
    s.status === 'playing' || !s.end
      ? null
      : {
          score: s.miles + s.bonus,
          outcome: s.end,
          glyph: s.picks.map((x) => (x.miles ? tiers[tierIndex(x.obscurity)].glyph : '⬛')).join('') + END_GLYPH[s.end],
        },
})

export const backroads = makeBackroads(loadCatalogs(fileURLToPath(new URL('../../content/catalogs', import.meta.url))))
