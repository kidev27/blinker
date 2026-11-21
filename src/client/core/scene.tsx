// The night road behind every screen. Modes steer it through setScene(); CSS does the rest.
export type Mood = 'idle' | 'drive' | 'crash' | 'exit'

/** speed: 0 (parked) to 1 (flat out). */
export function setScene(mood: Mood, speed = 0) {
  const root = document.documentElement
  root.dataset.mood = mood
  root.style.setProperty('--speed', String(Math.min(1, Math.max(0, speed))))
}

export const Scene = () => (
  <div class="scene" aria-hidden="true">
    <div class="stars" />
    <div class="glow" />
    <div class="road">
      <div class="road-plane" />
    </div>
    <div class="flash" />
  </div>
)
