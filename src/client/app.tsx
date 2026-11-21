import { useEffect, useState } from 'preact/hooks'
import { localDayKey } from '../shared/day.ts'
import { getStreak, liveCount } from './core/streaks.ts'
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
  return mode ? <mode.Play day={localDayKey()} /> : <Home />
}

function Home() {
  const today = localDayKey()
  return (
    <div class="app">
      <main class="scroll home">
        <h1 class="wordmark">
          <svg class="arrow on" viewBox="0 0 48 32" aria-hidden="true">
            <path d="M2 11h24V2l20 14-20 14v-9H2z" />
          </svg>
          BLINKER
        </h1>
        <p class="tagline">A daily drive down the backroads of what you know.</p>
        <ul class="modes">
          {clientModes.map(({ meta }) => {
            const streak = liveCount(getStreak(meta.id), today)
            return (
              <li key={meta.id}>
                <a class="mode-card" href={`#/${meta.id}`}>
                  <span class="mode-title">{meta.title}</span>
                  <span class="mode-tag">{meta.tagline}</span>
                  {streak > 0 && <span class="mode-streak">{streak}-day streak</span>}
                </a>
              </li>
            )
          })}
        </ul>
      </main>
    </div>
  )
}
