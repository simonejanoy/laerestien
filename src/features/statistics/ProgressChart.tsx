// «Faglig progresjon»: linjediagram over oppnådde læringsmål gjennom skoleåret.

const WIDTH = 562
const HEIGHT = 224
const PAD = { top: 12, right: 12, bottom: 28, left: 36 }
const ticks = [0, 20, 40, 60, 80, 100]

export function ProgressChart({ values, labels }: { values: number[]; labels: string[] }) {
  const innerW = WIDTH - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (labels.length > 1 ? (i / (labels.length - 1)) * innerW : 0)
  const y = (v: number) => PAD.top + innerH - (v / 100) * innerH
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      role="img"
      aria-label={`Oppnådde læringsmål: ${values.map((v, i) => `${labels[i]} ${v} %`).join(', ')}`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} className="stroke-surface" strokeWidth={1} />
          <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-secondary text-[10px]">
            {t}%
          </text>
        </g>
      ))}
      {labels.map((label, i) => (
        <text key={label} x={x(i)} y={HEIGHT - 8} textAnchor="middle" className="fill-secondary text-[10px]">
          {label}
        </text>
      ))}
      <polyline points={points} fill="none" className="stroke-secondary" strokeWidth={1.5} />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={3.5} className="fill-background stroke-secondary" strokeWidth={1.5} />
      ))}
    </svg>
  )
}
