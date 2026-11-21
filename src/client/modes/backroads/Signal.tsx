import { useEffect, useRef, useState } from 'preact/hooks'
import { config } from '../../../shared/modes/backroads.ts'
import { tick } from './sound.ts'

const BLINK_MS = 400
/** A failing bulb makes a real indicator "hyperflash"; we do it for the last few seconds. */
const HYPER_MS = 160
const HYPER_FROM = 5_000

/** Turn-signal countdown. `deadline` is a performance.now() timestamp; onExpire fires once per deadline. */
export function Signal({ deadline, onExpire }: { deadline: number; onExpire: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, deadline - performance.now()))
  const fired = useRef(false)
  const expire = useRef(onExpire)
  expire.current = onExpire

  useEffect(() => {
    fired.current = false
    let lastOn: boolean | null = null
    const id = setInterval(() => {
      const ms = Math.max(0, deadline - performance.now())
      setLeft(ms)
      const on = Math.floor(ms / (ms < HYPER_FROM ? HYPER_MS : BLINK_MS)) % 2 === 0
      if (on !== lastOn && ms > 0) tick(on)
      lastOn = on
      if (ms === 0 && !fired.current) {
        fired.current = true
        expire.current()
      }
    }, 40)
    return () => clearInterval(id)
  }, [deadline])

  const on = Math.floor(left / (left < HYPER_FROM ? HYPER_MS : BLINK_MS)) % 2 === 0 && left > 0
  const secs = Math.ceil(left / 1000)
  return (
    <div class={`signal ${left < HYPER_FROM ? 'hurry' : ''}`}>
      <svg class={`arrow ${on ? 'on' : ''}`} viewBox="0 0 48 32" aria-hidden="true">
        <path d="M2 11h24V2l20 14-20 14v-9H2z" />
      </svg>
      <span class="secs" role="timer" aria-label={`${secs} seconds left`}>
        {String(secs).padStart(2, '0')}
      </span>
      <div class="fuel" aria-hidden="true">
        <div style={{ width: `${(left / config.answerMs) * 100}%` }} />
      </div>
    </div>
  )
}
