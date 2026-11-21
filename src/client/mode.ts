import type { ComponentType } from 'preact'
import type { ModeMeta } from '../shared/mode.ts'

/** Client half of a game mode: its metadata and the screen that plays one day. */
export interface ClientMode {
  meta: ModeMeta
  Play: ComponentType<{ day: string }>
}
