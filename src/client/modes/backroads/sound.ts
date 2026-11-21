// Tiny Web Audio cues, no audio files. Browsers only allow audio after a user gesture, so
// unlock() runs on the Start tap.
import { load, save } from '../../core/storage.ts'

let ctx: AudioContext | null = null
let muted = load('blinker:muted', false)

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  save('blinker:muted', m)
}

export function unlock() {
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
  } catch {
    ctx = null
  }
}

function tone(freq: number, ms: number, gain: number, type: OscillatorType = 'square', delayMs = 0) {
  if (!ctx || muted) return
  const t = ctx.currentTime + delayMs / 1000
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + ms / 1000 + 0.02)
}

/** Relay click of a turn signal: alternating tick and tock. */
export const tick = (on: boolean) => tone(on ? 1900 : 1300, 25, 0.06)
export const accept = () => tone(660, 90, 0.05, 'triangle')
export const miss = () => tone(180, 120, 0.05, 'sawtooth')
export const exit = () => (tone(523, 140, 0.07, 'triangle'), tone(784, 220, 0.07, 'triangle', 120))
export function crash() {
  tone(90, 500, 0.12, 'sawtooth')
  tone(60, 700, 0.1, 'square', 40)
  navigator.vibrate?.(200)
}
