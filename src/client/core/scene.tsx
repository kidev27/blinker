import { Roadside } from './roadside.tsx'

// The night road behind every screen. Modes steer it through setScene(); CSS does the rest.
export type Mood = 'idle' | 'drive' | 'exit'

/** speed: 0 (parked) to 1 (flat out). */
export function setScene(mood: Mood, speed = 0) {
  const root = document.documentElement
  root.dataset.mood = mood
  root.style.setProperty('--speed', String(Math.min(1, Math.max(0, speed))))
}

const POSTS = [0, 1, 2, 3, 4]
const TOWN = [8, 11, 13, 27, 31, 62, 66, 67, 71, 88, 91]

export const Scene = () => (
  <div class="scene" aria-hidden="true">
    <div class="stars" />
    <div class="moon" />
    <div class="glow" />
    <svg class="hills" viewBox="0 0 1200 100" preserveAspectRatio="none">
      <path d="M0 100V62c60-18 110-30 170-14s90 10 140-6 100-34 170-6 80 30 150 18 110-40 190-22 90 30 160 12 90-26 220-4V100z" />
    </svg>
    <div class="town">
      {TOWN.map((x, i) => (
        <i key={x} style={{ left: `${x}%`, animationDelay: `${i * 0.7}s` }} />
      ))}
    </div>
    <div class="road">
      <div class="road-plane" />
    </div>
    <Roadside />
    <div class="posts">
      {POSTS.flatMap((i) => [
        <span key={`l${i}`} class="post left" style={{ '--i': i }} />,
        <span key={`r${i}`} class="post right" style={{ '--i': i }} />,
      ])}
    </div>
    <div class="flash" />
  </div>
)
