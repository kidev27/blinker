import { useEffect, useRef, useState } from 'preact/hooks'
import type { RoundSummary } from '../../../shared/mode.ts'
import { config, meta, tierIndex, tiers, type BackroadsEvent, type BackroadsView } from '../../../shared/modes/backroads.ts'
import { get, post } from '../../core/api.ts'
import { Share as ShareIcon } from '../../core/icons.tsx'
import { setScene } from '../../core/scene.tsx'
import { share, shareText } from '../../core/share.ts'
import { Sheet } from '../../core/Sheet.tsx'
import { load, save } from '../../core/storage.ts'
import { recordResult, stats } from '../../core/streaks.ts'
import { TopBar } from '../../core/TopBar.tsx'
import { Rules } from './Rules.tsx'
import { Signal } from './Signal.tsx'
import * as sound from './sound.ts'

interface RoundState { prompt: string | null; view: BackroadsView | null; summary: RoundSummary | null }
interface Round extends RoundState { slot: number }
interface Day { day: string; number: number; rounds: Round[] }

const SEEN_RULES = `blinker:seen-rules:${meta.id}`
const tierOf = (obscurity: number) => tiers[tierIndex(obscurity)]

export function Play({ day }: { day: string }) {
  const [data, setData] = useState<Day | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const [rulesOpen, setRulesOpen] = useState(() => !load(SEEN_RULES, false))
  const help = () => setRulesOpen(true)
  const closeRules = () => {
    save(SEEN_RULES, true)
    setRulesOpen(false)
  }

  const fetchDay = () => {
    setError(null)
    get<Day>(`${meta.id}/${day}`).then(
      (d) => {
        setData(d)
        setActive(d.rounds.find((r) => r.view && !r.summary)?.slot ?? null)
      },
      (e: Error) => setError(e.message),
    )
  }
  useEffect(fetchDay, [day])

  const update = (slot: number, r: RoundState) =>
    setData((d) => d && { ...d, rounds: d.rounds.map((x) => (x.slot === slot ? { slot, ...r } : x)) })

  const next = data?.rounds.find((r) => !r.summary)
  const round = active === null ? null : data?.rounds[active]
  let screen: preact.JSX.Element
  if (error || !data)
    screen = (
      <main class="scroll center">
        <p class="note">{error ?? 'Warming up the engine…'}</p>
        {error && <button class="button primary" onClick={fetchDay}>Try again</button>}
      </main>
    )
  else if (round?.view)
    screen = <Drive key={round.slot} day={data} round={round} onUpdate={(r) => update(round.slot, r)} onNext={() => setActive(null)} />
  else if (next)
    screen = (
      <Intro
        day={data}
        round={next}
        onHelp={help}
        onStart={async () => {
          sound.unlock()
          const r = await post<RoundState>(`${meta.id}/${day}/${next.slot}/start`)
          update(next.slot, r)
          setActive(next.slot)
        }}
      />
    )
  else screen = <Results day={data} />

  return (
    <div class="app">
      <TopBar center={data && <Progress rounds={data.rounds} current={active ?? next?.slot} />} onHelp={help} />
      {screen}
      <Sheet open={rulesOpen} title="How to play" onClose={closeRules}>
        <Rules />
        <button class="button primary big" onClick={closeRules}>Let’s drive</button>
      </Sheet>
    </div>
  )
}

function Progress({ rounds, current }: { rounds: Round[]; current?: number }) {
  return (
    <ol class="progress" aria-label="Today’s rounds">
      {rounds.map((r) => {
        const state = r.summary?.outcome ?? (r.slot === current ? 'current' : 'todo')
        const label = r.summary ? `${r.summary.outcome}, ${r.summary.score} mi` : state === 'current' ? 'up next' : 'not started'
        return <li key={r.slot} class={`step ${state}`} aria-label={`Round ${r.slot + 1}: ${label}`} />
      })}
    </ol>
  )
}

/** One finished round as tier chips, for intro and results. Emoji stay in the share text. */
function RoundRow({ round }: { round: Round }) {
  const v = round.view!
  const s = round.summary!
  return (
    <li class="round-row">
      <span class="round-label">Round {round.slot + 1}</span>
      <span class="chips" role="img" aria-label={`${v.picks.length} answers, ${s.outcome}`}>
        {v.picks.map((p) => (
          <span key={p.name} class={`chip tier-bg-${tierIndex(p.obscurity)}`} />
        ))}
        <span class={`chip-end ${s.outcome}`} aria-hidden="true">{s.outcome === 'banked' ? '↗' : '✕'}</span>
      </span>
      <span class="round-score">{s.score}<small>mi</small></span>
    </li>
  )
}

function Intro(props: { day: Day; round: Round; onStart: () => Promise<void>; onHelp: () => void }) {
  const { day, round } = props
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setScene('idle', 0.1), [])
  const start = () => {
    setBusy(true)
    props.onStart().catch((e: Error) => (setError(e.message), setBusy(false)))
  }
  const done = day.rounds.filter((r) => r.summary)
  return (
    <>
      <main class="scroll intro">
        <p class="eyebrow">Drive #{day.number}</p>
        <div class="round-card">
          <p class="round-num">
            Round {round.slot + 1} <small>of {day.rounds.length}</small>
          </p>
          <p>The category appears when you start. You have {config.answerMs / 1000} seconds per answer.</p>
        </div>
        {done.length > 0 && (
          <ol class="round-rows" aria-label="Finished rounds">
            {done.map((r) => <RoundRow key={r.slot} round={r} />)}
          </ol>
        )}
        {error && <p class="note" role="alert">{error}</p>}
      </main>
      <footer class="controls">
        <button class="button primary big" disabled={busy} onClick={start}>
          {busy ? 'Starting…' : `Start round ${round.slot + 1}`}
        </button>
        <button class="tiny-link" onClick={props.onHelp}>► How to play</button>
      </footer>
    </>
  )
}

function lastLine(v: BackroadsView): string | null {
  const l = v.last
  if (v.status === 'crashed')
    return v.crash === 'timeout'
      ? 'The signal ran out.'
      : `${l!.pick!.name} is a ${tierOf(l!.pick!.obscurity).name} answer. You needed ${tiers[v.need].name} or rarer.`
  if (!l) return null
  if (l.result === 'not-found') return `“${l.input}” isn’t on the map.`
  if (l.result === 'repeat') return `You already drove ${l.pick!.name}.`
  const t = tierOf(l.pick!.obscurity)
  // Always show what a corrected or aliased answer counted as.
  const as = l.input.toLowerCase() === l.pick!.name.toLowerCase() ? '' : `“${l.input}” → `
  return `${as}${l.pick!.name} ∙ ${t.name} ∙ +${config.miles(l.pick!.obscurity)} mi`
}

function Drive(props: { day: Day; round: Round; onUpdate: (r: RoundState) => void; onNext: () => void }) {
  const { day, round, onUpdate, onNext } = props
  const v = round.view!
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deadline, setDeadline] = useState(() => performance.now() + v.msLeft)
  const input = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const nextBtn = useRef<HTMLButtonElement>(null)
  const playing = v.status === 'playing'

  useEffect(() => (playing ? input : nextBtn).current?.focus(), [playing])
  useEffect(
    () => setScene(v.status === 'crashed' ? 'crash' : v.status === 'banked' ? 'exit' : 'drive', 0.2 + v.picks.length / 8),
    [v.status, v.picks.length],
  )

  const shake = () => {
    const f = form.current
    if (!f) return
    f.classList.remove('shake')
    void f.offsetWidth // restart the animation
    f.classList.add('shake')
  }

  const send = async (e: BackroadsEvent) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await post<RoundState>(`${meta.id}/${day.day}/${round.slot}/event`, e)
      onUpdate(r)
      setDeadline(performance.now() + r.view!.msLeft)
      const nv = r.view!
      if (nv.status === 'crashed') sound.crash()
      else if (nv.status === 'banked') sound.exit()
      else if (e.type === 'answer' && nv.last?.result === 'accepted') sound.accept()
      else if (e.type === 'answer') (sound.miss(), shake())
    } catch (err) {
      setError((err as Error).message)
      setDeadline(performance.now() + 1000) // retry a missed timeout shortly
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: Event) => {
    e.preventDefault()
    const t = text.trim()
    if (!t || busy) return
    setText('')
    void send({ type: 'answer', text: t })
  }

  const line = lastLine(v)
  const isLast = day.rounds.every((r) => r.slot === round.slot || r.summary)

  return (
    <>
      <main class="scroll drive">
        <p class="eyebrow">
          Drive #{day.number} ∙ Round {round.slot + 1} of {day.rounds.length}
        </p>
        <h1 class="prompt led-board">{round.prompt}</h1>
        <div class="dash">
          <div class="odometer" aria-label={`${v.pot} miles ${playing ? 'in the pot' : v.status === 'banked' ? 'banked' : 'lost'}`}>
            <span class="odo-digits">{String(v.pot).padStart(4, '0')}</span>
            <span class="odo-unit">{playing ? 'mi at stake' : v.status === 'banked' ? 'mi banked' : 'mi lost'}</span>
          </div>
          {playing && (
            <div class={`sign tier-need-${v.need}`} aria-label={`Next answer: ${tiers[v.need].name} or rarer`}>
              <span class="sign-label">NEXT</span>
              <span class="sign-text">
                {tiers[v.need].name}
                {v.need ? ' or rarer' : ''}
              </span>
            </div>
          )}
        </div>
        <p class={`last ${v.last?.result ?? ''} ${v.status}`} aria-live="polite">{line}</p>
        {error && <p class="note" role="alert">{error}</p>}
        {!playing && (
          <p class={`result-head ${v.status}`}>{v.status === 'banked' ? 'Took the exit' : 'Crashed'}</p>
        )}
        <ol class="picks" aria-label="Your answers">
          {v.picks.map((p, i) => {
            const ti = tierIndex(p.obscurity)
            return (
              <li key={p.name} class={`tier-${ti}`}>
                <span class="mm">{i + 1}</span>
                <span class="name">{p.name}</span>
                <span class="tier">{tiers[ti].name}</span>
                <span class="mi">+{config.miles(p.obscurity)}</span>
              </li>
            )
          })}
        </ol>
      </main>
      <footer class="controls">
        {playing ? (
          <>
            <Signal deadline={deadline} onExpire={() => void send({ type: 'timeout' })} />
            <form ref={form} class="answer" onSubmit={submit} onAnimationEnd={() => form.current?.classList.remove('shake')}>
              <input
                ref={input}
                value={text}
                onInput={(e) => setText(e.currentTarget.value)}
                maxLength={80}
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck={false}
                enterkeyhint="go"
                placeholder="Name one…"
                aria-label={`Answer for: ${round.prompt}`}
              />
              <button class="button primary" type="submit" disabled={!text.trim()}>Go</button>
            </form>
            <button class="exit" disabled={busy} onClick={() => void send({ type: 'bank' })}>
              <span class="exit-tab">EXIT</span>
              Take the exit ∙ bank {v.pot} mi
            </button>
          </>
        ) : (
          <button ref={nextBtn} class="button primary big" onClick={onNext}>
            {isLast ? 'See today’s drive' : 'Next round'}
          </button>
        )}
      </footer>
    </>
  )
}

function untilMidnight() {
  const now = new Date()
  const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
  return `${Math.floor(ms / 3_600_000)}h ${String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0')}m`
}

function Results({ day }: { day: Day }) {
  const summaries = day.rounds.map((r) => r.summary!)
  const total = summaries.reduce((n, s) => n + s.score, 0)
  const [st] = useState(() => stats(recordResult(meta.id, day.day, total), day.day))
  const [shared, setShared] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(untilMidnight)

  useEffect(() => setScene('idle', 0.2), [])
  useEffect(() => {
    const id = setInterval(() => setCountdown(untilMidnight()), 30_000)
    return () => clearInterval(id)
  }, [])

  const text = shareText(meta, day.number, summaries, location.origin)
  const onShare = async () => {
    const r = await share(text)
    setShared(r === 'copied' ? 'Copied. Paste it anywhere.' : r === 'failed' ? 'Could not share. Copy the text below.' : null)
  }

  return (
    <>
      <main class="scroll results">
        <p class="eyebrow">Drive #{day.number} complete</p>
        <p class="total led-board">
          {total}<small>mi</small>
        </p>
        <ol class="round-rows" aria-label="Rounds">
          {day.rounds.map((r) => <RoundRow key={r.slot} round={r} />)}
        </ol>
        <dl class="stats">
          <div><dt>Played</dt><dd>{st.played}</dd></div>
          <div><dt>Streak</dt><dd>{st.streak}</dd></div>
          <div><dt>Best streak</dt><dd>{st.bestStreak}</dd></div>
          <div><dt>Best day</dt><dd>{st.bestDay}<small>mi</small></dd></div>
        </dl>
        <p class="countdown">
          <span>Next drive in</span>
          <strong>{countdown}</strong>
        </p>
        <pre class="share-preview" aria-label="Share text">{text}</pre>
        {shared && <p class="note" role="status">{shared}</p>}
      </main>
      <footer class="controls">
        <button class="button primary big" onClick={onShare}>
          <ShareIcon /> Share
        </button>
      </footer>
    </>
  )
}
