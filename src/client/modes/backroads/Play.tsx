import { useEffect, useRef, useState } from 'preact/hooks'
import type { RoundSummary } from '../../../shared/mode.ts'
import { config, meta, tierIndex, tiers, type BackroadsEvent, type BackroadsView } from '../../../shared/modes/backroads.ts'
import { get, post } from '../../core/api.ts'
import { share, shareText } from '../../core/share.ts'
import { recordDay, type Streak } from '../../core/streaks.ts'
import { Signal } from './Signal.tsx'
import * as sound from './sound.ts'

interface RoundState { prompt: string | null; view: BackroadsView | null; summary: RoundSummary | null }
interface Round extends RoundState { slot: number }
interface Day { day: string; number: number; rounds: Round[] }

const tierOf = (obscurity: number) => tiers[tierIndex(obscurity)]
const tierClass = (i: number) => `tier-${i}`

export function Play({ day }: { day: string }) {
  const [data, setData] = useState<Day | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<number | null>(null)

  const load = () => {
    setError(null)
    get<Day>(`${meta.id}/${day}`).then(
      (d) => {
        setData(d)
        setActive(d.rounds.find((r) => r.view && !r.summary)?.slot ?? null)
      },
      (e: Error) => setError(e.message),
    )
  }
  useEffect(load, [day])

  if (error)
    return (
      <Shell>
        <p class="note">{error}</p>
        <button class="primary" onClick={load}>Try again</button>
      </Shell>
    )
  if (!data) return <Shell><p class="note">Warming up the engine…</p></Shell>

  const update = (slot: number, r: RoundState) =>
    setData((d) => d && { ...d, rounds: d.rounds.map((x) => (x.slot === slot ? { slot, ...r } : x)) })

  const round = active === null ? null : data.rounds[active]
  if (round?.view)
    return (
      <Drive
        key={round.slot}
        day={data}
        round={round}
        onUpdate={(r) => update(round.slot, r)}
        onNext={() => setActive(null)}
      />
    )

  const next = data.rounds.find((r) => !r.summary)
  if (next)
    return (
      <Intro
        day={data}
        round={next}
        onStart={async () => {
          sound.unlock()
          const r = await post<RoundState>(`${meta.id}/${day}/${next.slot}/start`)
          update(next.slot, r)
          setActive(next.slot)
        }}
      />
    )
  return <Results day={data} />
}

function Shell({ children, odometer }: { children: preact.ComponentChildren; odometer?: number }) {
  const [muted, setMuted] = useState(sound.isMuted())
  return (
    <div class="app">
      <header class="dash">
        <a href="#/" class="brand" aria-label="Blinker home">BLINKER</a>
        {odometer !== undefined && (
          <span class="odometer" aria-label={`${odometer} miles in the pot`}>
            {String(odometer).padStart(4, '0')} <small>mi</small>
          </span>
        )}
        <button
          class="icon"
          aria-pressed={muted}
          aria-label={muted ? 'Sound off' : 'Sound on'}
          onClick={() => (sound.setMuted(!muted), setMuted(!muted))}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </header>
      {children}
    </div>
  )
}

function Done({ rounds }: { rounds: Round[] }) {
  const done = rounds.filter((r) => r.summary)
  if (!done.length) return null
  return (
    <ol class="done">
      {done.map((r) => (
        <li key={r.slot}>
          Round {r.slot + 1}: <span aria-hidden="true">{r.summary!.glyph}</span> {r.summary!.score} mi
        </li>
      ))}
    </ol>
  )
}

function Intro({ day, round, onStart }: { day: Day; round: Round; onStart: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const start = () => {
    setBusy(true)
    onStart().catch((e: Error) => (setError(e.message), setBusy(false)))
  }
  return (
    <Shell>
      <main class="scroll">
        <p class="eyebrow">Drive #{day.number} · Round {round.slot + 1} of {day.rounds.length}</p>
        <h1 class="title">Backroads</h1>
        <ul class="rules">
          <li>You get a category. Name things in it, one at a time.</li>
          <li>The road sign shows how rare your next answer must be. It gets stricter every two answers.</li>
          <li>Rarer answers go farther. <strong>Take the exit</strong> to bank your miles.</li>
          <li>Too common, or the signal runs out: <strong>you crash</strong> and lose the round.</li>
        </ul>
        <Done rounds={day.rounds} />
        {error && <p class="note" role="alert">{error}</p>}
      </main>
      <footer class="controls">
        <button class="primary big" disabled={busy} onClick={start}>
          {busy ? 'Starting…' : `Start round ${round.slot + 1}`}
        </button>
        <p class="hint">The clock starts when you tap. {config.answerMs / 1000} seconds per answer.</p>
      </footer>
    </Shell>
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
  return `${as}${l.pick!.name} · ${t.name} · +${config.miles(l.pick!.obscurity)} mi`
}

function Drive(props: { day: Day; round: Round; onUpdate: (r: RoundState) => void; onNext: () => void }) {
  const { day, round, onUpdate, onNext } = props
  const v = round.view!
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deadline, setDeadline] = useState(() => performance.now() + v.msLeft)
  const input = useRef<HTMLInputElement>(null)
  const nextBtn = useRef<HTMLButtonElement>(null)
  const playing = v.status === 'playing'

  useEffect(() => (playing ? input : nextBtn).current?.focus(), [playing])

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
      else if (e.type === 'answer') (nv.last?.result === 'accepted' ? sound.accept : sound.miss)()
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
    <Shell odometer={v.pot}>
      <main class="scroll">
        <p class="eyebrow">Drive #{day.number} · Round {round.slot + 1} of {day.rounds.length}</p>
        <h1 class="prompt">{round.prompt}</h1>
        {playing && (
          <div class={`sign ${tierClass(v.need)}`} aria-label={`Next answer: ${tiers[v.need].name} or rarer`}>
            <span class="sign-label">NEXT</span>
            <span class="sign-text">{tiers[v.need].name}{v.need ? ' or rarer' : ''}</span>
          </div>
        )}
        <p class={`last ${v.last?.result ?? ''} ${v.status}`} aria-live="polite">{line}</p>
        {error && <p class="note" role="alert">{error}</p>}
        {!playing && (
          <div class={`result ${v.status}`}>
            <p class="result-head">{v.status === 'banked' ? `Took the exit · ${v.pot} mi banked` : `Crashed · ${v.pot} mi lost`}</p>
          </div>
        )}
        <ol class="picks" aria-label="Your answers">
          {v.picks.map((p, i) => {
            const ti = tierIndex(p.obscurity)
            return (
              <li key={p.name} class={tierClass(ti)}>
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
            <form class="answer" onSubmit={submit}>
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
              <button class="primary" type="submit" disabled={!text.trim()}>Go</button>
            </form>
            <button class="exit" disabled={busy} onClick={() => void send({ type: 'bank' })}>
              <span class="exit-tab">EXIT</span>
              Take the exit · bank {v.pot} mi
            </button>
          </>
        ) : (
          <button ref={nextBtn} class="primary big" onClick={onNext}>
            {isLast ? 'See today’s drive' : `Next round`}
          </button>
        )}
      </footer>
    </Shell>
  )
}

function untilMidnight() {
  const now = new Date()
  const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function Results({ day }: { day: Day }) {
  const summaries = day.rounds.map((r) => r.summary!)
  const total = summaries.reduce((n, s) => n + s.score, 0)
  const [streak, setStreak] = useState<Streak | null>(null)
  const [shared, setShared] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(untilMidnight)

  useEffect(() => setStreak(recordDay(meta.id, day.day)), [day.day])
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
    <Shell>
      <main class="scroll">
        <p class="eyebrow">Drive #{day.number} complete</p>
        <h1 class="total">
          {total} <small>mi</small>
        </h1>
        <Done rounds={day.rounds} />
        {streak && (
          <p class="streak">
            {streak.count}-day streak{streak.best > streak.count ? ` · best ${streak.best}` : ''}
          </p>
        )}
        <pre class="share-preview" aria-label="Share text">{text}</pre>
        {shared && <p class="note" role="status">{shared}</p>}
      </main>
      <footer class="controls">
        <button class="primary big" onClick={onShare}>Share</button>
        <p class="hint">Next drive in {countdown}</p>
      </footer>
    </Shell>
  )
}
