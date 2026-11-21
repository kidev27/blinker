import { tiers } from '../../../shared/modes/backroads.ts'

export function Rules() {
  return (
    <div class="rules">
      <ol class="rule-list">
        <li>You get a category. Name things in it, one at a time.</li>
        <li>The green sign shows how rare your next answer must be. It gets stricter every two answers.</li>
        <li>Rarer answers go farther. <strong>Take the exit</strong> any time to bank your miles.</li>
        <li>Name something too common, or let the signal run out, and <strong>you crash</strong>: the round scores 0.</li>
        <li>Answers that aren't on the map cost nothing but time.</li>
      </ol>
      <h3>Road tiers, most common to rarest</h3>
      <ul class="tier-legend">
        {tiers.map((t, i) => (
          <li key={t.name}>
            <span class={`chip tier-bg-${i}`} aria-hidden="true" />
            {t.name}
          </li>
        ))}
      </ul>
      <p class="hint">Three rounds a day, the same for everyone.</p>
    </div>
  )
}
