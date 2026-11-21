import { config, tiers } from '../../../shared/modes/backroads.ts'

export function Rules() {
  return (
    <div class="rules">
      <ol class="rule-list">
        <li>You get a category. Name things in it, one at a time.</li>
        <li>You start with a {config.tankMs / 1000}-second tank of fuel. When it runs dry, the round ends.</li>
        <li>Answers that clear the <strong>green sign</strong> score miles and refuel the tank. Rarer answers earn more of both.</li>
        <li>The sign gets stricter every two scoring answers. Answers below it are fine, they just score nothing.</li>
        <li>Stuck? <strong>Pull over</strong> any time: every second of fuel left is worth {config.pullOverMilesPerSec} miles.</li>
        <li>Answers that aren't on the map cost nothing but time. You never lose miles.</li>
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
