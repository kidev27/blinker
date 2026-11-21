import { useEffect, useState } from 'preact/hooks'
import { dayNumber, localDayKey } from '../shared/day.ts'
import { Arrow } from './core/icons.tsx'
import { Scene, setScene } from './core/scene.tsx'
import { Sheet } from './core/Sheet.tsx'
import { getHistory, stats } from './core/streaks.ts'
import { TopBar } from './core/TopBar.tsx'
import type { ClientMode } from './mode.ts'
import { clientModes } from './modes/registry.ts'

const route = () => location.hash.replace(/^#\/?/, '')

export function App() {
  const [path, setPath] = useState(route)
  useEffect(() => {
    const on = () => setPath(route())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  const mode = clientModes.find((m) => m.meta.id === path)
  return (
    <>
      <Scene />
      {mode ? <mode.Play day={localDayKey()} /> : <Home />}
    </>
  )
}

function Home() {
  const today = localDayKey()
  const [rules, setRules] = useState<ClientMode | null>(null)
  useEffect(() => setScene('idle', 0.15), [])
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div class="app">
      <TopBar brand={false} />
      <main class="scroll home">
        <h1 class="wordmark">
          <Arrow class="signal-arrow blinking" />
          BLINKER
        </h1>
        <p class="tagline">A daily drive down the backroads of what you know.</p>
        <p class="drive-meta">
          Drive #{dayNumber(today)} ∙ {date}
        </p>
        {clientModes.map((m) => {
          const history = getHistory(m.meta.id)
          const { streak } = stats(history, today)
          return (
            <section key={m.meta.id} class="mode-card" aria-labelledby={`mode-${m.meta.id}`}>
              <h2 id={`mode-${m.meta.id}`}>{m.meta.title}</h2>
              <p>{m.meta.tagline}</p>
              <a class="button primary big" href={`#/${m.meta.id}`}>
                {today in history ? 'See today’s drive' : 'Start today’s drive'}
              </a>
              <div class="mode-foot">
                <span>{streak > 0 ? `${streak}-day streak` : ''}</span>
                {m.Rules && (
                  <button class="link" onClick={() => setRules(m)}>
                    How to play
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </main>
      {rules?.Rules && (
        <Sheet open title={`How to play ${rules.meta.title}`} onClose={() => setRules(null)}>
          <rules.Rules />
        </Sheet>
      )}
    </div>
  )
}
