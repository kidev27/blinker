import { useEffect, useState } from 'preact/hooks'
import { dayNumber, localDayKey } from '../shared/day.ts'
import { Arrow } from './core/icons.tsx'
import { Privacy } from './core/Privacy.tsx'
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
  const [privacy, setPrivacy] = useState(false)
  useEffect(() => setScene('idle', 0.15), [])
  const date = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div class="app">
      <TopBar brand={false} />
      <main class="scroll home">
        <div class="hero-sign">
          <h1 class="led-board hero-board">
            <Arrow class="signal-arrow blinking" />
            <span class="hero-word">Blinker</span>
          </h1>
          <div class="sign-legs" aria-hidden="true">
            <span />
            <span />
          </div>
        </div>
        <p class="tagline">A daily drive down the backroads of what you know.</p>
        <p class="eyebrow drive-meta">
          Drive #{dayNumber(today)} ∙ {date}
        </p>
        {clientModes.map((m) => {
          const history = getHistory(m.meta.id)
          const { streak } = stats(history, today)
          return (
            <section key={m.meta.id} class="mode-card" aria-labelledby={`mode-${m.meta.id}`}>
              <h2 id={`mode-${m.meta.id}`} class="led-text">{m.meta.title}</h2>
              <p>{m.meta.tagline}</p>
              <a class="button primary big" href={`#/${m.meta.id}`}>
                {today in history ? 'See today’s drive' : 'Start today’s drive'}
              </a>
              <div class="mode-foot">
                {m.Rules && (
                  <button class="tiny-link" onClick={() => setRules(m)}>
                    ► How to play
                  </button>
                )}
                {streak > 0 && <span class="tiny-text">{streak}-day streak</span>}
              </div>
            </section>
          )
        })}
        <footer class="home-foot">
          <button class="tiny-link" onClick={() => setPrivacy(true)}>
            Privacy
          </button>
        </footer>
      </main>
      {rules?.Rules && (
        <Sheet open title="How to play" onClose={() => setRules(null)}>
          <rules.Rules />
        </Sheet>
      )}
      <Sheet open={privacy} title="Privacy" onClose={() => setPrivacy(false)}>
        <Privacy />
      </Sheet>
    </div>
  )
}
