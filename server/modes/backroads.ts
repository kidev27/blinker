import {
  barAt, config, meta, tierIndex, tiers,
  type BackroadsEvent, type BackroadsView, type LastAnswer, type Pick,
} from '../../src/shared/modes/backroads.ts'
import { buildIndex, match, type AnswerIndex } from '../match.ts'
import type { ServerMode } from '../mode.ts'

interface Answer { name: string; aliases: string[]; obscurity: number }
interface Puzzle { prompt: string; index: AnswerIndex<Answer> }

interface State {
  status: BackroadsView['status']
  crash?: BackroadsView['crash']
  deadline: number
  picks: Pick[]
  pot: number
  last?: LastAnswer
}

/**
 * Content format: { "prompt": "...", "answers": { "Name|alias|alias": obscurity 0-100 } }.
 * Validated at boot, so a bad content file stops the server instead of breaking a round.
 */
function parse(raw: unknown): Puzzle {
  const r = raw as { prompt?: unknown; answers?: unknown }
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
    return { prompt: r.prompt, index: buildIndex(answers) }
  } catch (e) {
    throw new Error(`"${r.prompt}": ${(e as Error).message}`)
  }
}

const crash = (s: State, why: State['crash'], last = s.last): State => ({ ...s, status: 'crashed', crash: why, last })

function apply(s: State, e: BackroadsEvent, p: Puzzle, now: number): State {
  if (s.status !== 'playing') return s
  if (now > s.deadline + config.graceMs) return crash(s, 'timeout')
  if (e.type === 'timeout') return now >= s.deadline ? crash(s, 'timeout') : s
  if (e.type === 'bank') return { ...s, status: 'banked', last: undefined }

  const input = e.text.trim()
  const i = match(p.index, input)
  if (i === null) return { ...s, last: { input, result: 'not-found' } }
  const { name, obscurity } = p.index.answers[i]
  const pick = { name, obscurity }
  if (s.picks.some((x) => x.name === name)) return { ...s, last: { input, result: 'repeat', pick } }
  if (tierIndex(obscurity) < barAt(s.picks.length)) return crash(s, 'too-obvious', { input, result: 'too-obvious', pick })
  return {
    ...s,
    picks: [...s.picks, pick],
    pot: s.pot + config.miles(obscurity),
    deadline: now + config.answerMs,
    last: { input, result: 'accepted', pick },
  }
}

export const backroads: ServerMode<Puzzle, State, BackroadsEvent, BackroadsView> = {
  meta,
  // One object schema, not oneOf: Fastify's validator strips properties per branch, which would
  // drop `text` while trying the bank/timeout branch.
  eventSchema: {
    type: 'object',
    required: ['type'],
    additionalProperties: false,
    properties: {
      type: { enum: ['answer', 'bank', 'timeout'] },
      text: { type: 'string', minLength: 1, maxLength: 80 },
    },
    if: { properties: { type: { const: 'answer' } } },
    then: { required: ['text'] },
  },
  parse,
  prompt: (p) => p.prompt,
  start: (_p, now) => ({ status: 'playing', deadline: now + config.answerMs, picks: [], pot: 0 }),
  apply,
  view: (s, now) => ({
    status: s.status,
    crash: s.crash,
    msLeft: s.status === 'playing' ? Math.max(0, s.deadline - now) : 0,
    picks: s.picks,
    pot: s.pot,
    need: barAt(s.picks.length),
    last: s.last,
  }),
  summary: (s) =>
    s.status === 'playing'
      ? null
      : {
          score: s.status === 'banked' ? s.pot : 0,
          outcome: s.status,
          glyph: s.picks.map((x) => tiers[tierIndex(x.obscurity)].glyph).join('') + (s.status === 'banked' ? '↗' : '💥'),
        },
}
