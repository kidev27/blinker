import { useState } from 'preact/hooks'
import { Arrow, Help, Settings as SettingsIcon, SoundOff, SoundOn } from './icons.tsx'
import { updateSettings, useSettings } from './settings.ts'
import { Sheet } from './Sheet.tsx'

/** Top bar shared by every screen: brand, an optional middle slot (progress), help, sound, settings. */
export function TopBar(props: { brand?: boolean; center?: preact.ComponentChildren; onHelp?: () => void }) {
  const s = useSettings()
  const [open, setOpen] = useState(false)
  return (
    <header class="topbar">
      {props.brand !== false && (
        <a href="#/" class="brand" aria-label="Blinker home">
          <Arrow class="brand-arrow" />
          <span class="brand-text">BLINKER</span>
        </a>
      )}
      <div class="topbar-center">{props.center}</div>
      <div class="topbar-actions">
        {props.onHelp && (
          <button class="icon" aria-label="How to play" onClick={props.onHelp}>
            <Help />
          </button>
        )}
        <button class="icon" aria-label="Sound" aria-pressed={!s.muted} onClick={() => updateSettings({ muted: !s.muted })}>
          {s.muted ? <SoundOff /> : <SoundOn />}
        </button>
        <button class="icon" aria-label="Settings" onClick={() => setOpen(true)}>
          <SettingsIcon />
        </button>
      </div>
      <Sheet open={open} title="Settings" onClose={() => setOpen(false)}>
        <SettingsForm />
      </Sheet>
    </header>
  )
}

function SettingsForm() {
  const s = useSettings()
  return (
    <div class="settings">
      <fieldset class="segmented">
        <legend>Theme</legend>
        {(['night', 'dusk'] as const).map((t) => (
          <label key={t}>
            <input type="radio" name="theme" checked={s.theme === t} onChange={() => updateSettings({ theme: t })} />
            <span>{t === 'night' ? 'Night' : 'Dusk'}</span>
          </label>
        ))}
      </fieldset>
      <label class="switch">
        <span>
          <strong>High contrast</strong>
          <small>Colour-blind-friendly tier colours and stronger text.</small>
        </span>
        <input type="checkbox" role="switch" checked={s.contrast} onChange={() => updateSettings({ contrast: !s.contrast })} />
      </label>
      <label class="switch">
        <span>
          <strong>Sound</strong>
          <small>Turn-signal ticks and crash and exit sounds.</small>
        </span>
        <input type="checkbox" role="switch" checked={!s.muted} onChange={() => updateSettings({ muted: !s.muted })} />
      </label>
    </div>
  )
}
