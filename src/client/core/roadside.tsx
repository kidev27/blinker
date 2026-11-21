// Desert roadside props that pass by in the scene. Plain SVG shapes coloured by theme tokens.
const LED = { 'font-family': 'Doto, monospace', 'font-weight': 900, 'text-anchor': 'middle' } as const

const Cactus = () => (
  <svg viewBox="0 0 70 120" width="70" height="120">
    <path
      fill="var(--cactus)"
      d="M29 120V16c0-9 12-9 12 0v104zM29 72H17c-7 0-11-4-11-11V36c0-7 9-7 9 0v24h14zM41 62h12V30c0-7 9-7 9 0v26c0 7-4 11-11 11H41z"
    />
  </svg>
)

const Diner = () => (
  <svg viewBox="0 0 170 106" width="170" height="106">
    <rect x="8" y="48" width="154" height="58" fill="var(--prop)" />
    <rect x="3" y="43" width="164" height="7" fill="var(--prop-edge)" />
    <g fill="var(--window)">
      <rect x="18" y="62" width="32" height="20" />
      <rect x="58" y="62" width="32" height="20" />
      <rect x="120" y="62" width="32" height="20" />
      <rect x="98" y="64" width="14" height="42" opacity="0.7" />
    </g>
    <rect x="58" y="34" width="5" height="10" fill="var(--prop)" />
    <rect x="107" y="34" width="5" height="10" fill="var(--prop)" />
    <g class="neon">
      <rect x="40" y="8" width="90" height="28" rx="5" fill="#0a0a0c" stroke="var(--neon)" stroke-width="2.5" />
      <text x="85" y="29" font-size="19" fill="var(--neon)" {...LED}>DINER</text>
    </g>
  </svg>
)

const GasSign = () => (
  <svg viewBox="0 0 64 150" width="64" height="150">
    <rect x="29" y="58" width="6" height="92" fill="var(--prop)" />
    <g class="neon teal">
      <rect x="4" y="4" width="56" height="56" rx="5" fill="#0a0a0c" stroke="var(--neon-2)" stroke-width="2.5" />
      <text x="32" y="26" font-size="16" fill="var(--neon-2)" {...LED}>GAS</text>
      <text x="32" y="48" font-size="15" fill="var(--led-on)" {...LED}>3.99</text>
    </g>
  </svg>
)

const MotelSign = () => (
  <svg viewBox="0 0 116 150" width="116" height="150">
    <rect x="46" y="58" width="8" height="92" fill="var(--prop)" />
    <g class="neon">
      <path d="M5 8h88l16 21-16 21H5z" fill="#0a0a0c" stroke="var(--neon)" stroke-width="2.5" />
      <text x="50" y="37" font-size="19" fill="var(--neon)" {...LED}>MOTEL</text>
    </g>
    <g class="neon teal">
      <rect x="12" y="62" width="76" height="18" rx="3" fill="#0a0a0c" stroke="var(--neon-2)" stroke-width="2" />
      <text x="50" y="76" font-size="11" fill="var(--neon-2)" {...LED}>VACANCY</text>
    </g>
  </svg>
)

const Billboard = () => (
  <svg viewBox="0 0 170 120" width="170" height="120">
    <rect x="34" y="60" width="7" height="60" fill="var(--prop)" />
    <rect x="129" y="60" width="7" height="60" fill="var(--prop)" />
    <rect x="4" y="6" width="162" height="58" fill="var(--board)" stroke="var(--prop-edge)" stroke-width="4" />
    <text x="85" y="44" font-family="Overpass, sans-serif" font-weight="800" font-size="25" text-anchor="middle" fill="var(--board-text)">
      NEXT EXIT ↗
    </text>
  </svg>
)

/** Order sets who passes when; sides alternate so the road never crowds on one side. */
const PROPS: [preact.FunctionComponent, -1 | 1][] = [
  [Cactus, -1],
  [Diner, 1],
  [GasSign, -1],
  [Cactus, 1],
  [MotelSign, -1],
  [Billboard, 1],
  [Cactus, -1],
]

export const Roadside = () => (
  <div class="props">
    {PROPS.map(([Prop, side], k) => (
      <span key={k} class="prop" style={{ '--side': side, '--k': k / PROPS.length }}>
        <Prop />
      </span>
    ))}
  </div>
)
