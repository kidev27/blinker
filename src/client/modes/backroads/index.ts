import { meta } from '../../../shared/modes/backroads.ts'
import type { ClientMode } from '../../mode.ts'
import { Play } from './Play.tsx'
import { Rules } from './Rules.tsx'

export const backroads: ClientMode = { meta, Play, Rules }
