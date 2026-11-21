import { useEffect, useState } from 'preact/hooks'
import { load, save } from './storage.ts'

export interface Settings {
  theme: 'night' | 'dusk'
  /** Colour-blind-safe tier colours, stronger borders and muted text. */
  contrast: boolean
  muted: boolean
}

const KEY = 'blinker:settings'
const THEME_COLOR = { night: '#03050a', dusk: '#c9c2ea' }

let current: Settings = { theme: 'night', contrast: false, muted: false, ...load<Partial<Settings>>(KEY, {}) }
const listeners = new Set<() => void>()

export const getSettings = () => current

/** Puts the settings on <html> so CSS tokens switch. Call before the first render to avoid a flash. */
export function applySettings() {
  const root = document.documentElement
  root.dataset.theme = current.theme
  root.toggleAttribute('data-contrast', current.contrast)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[current.theme])
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch }
  save(KEY, current)
  applySettings()
  listeners.forEach((f) => f())
}

export function useSettings(): Settings {
  const [, rerender] = useState(0)
  useEffect(() => {
    const f = () => rerender((n) => n + 1)
    listeners.add(f)
    return () => void listeners.delete(f)
  }, [])
  return current
}
