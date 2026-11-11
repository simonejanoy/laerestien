import { createElement as h, type ReactElement } from 'react'
import { ANGLE_NAMES, DEFAULT_ANGLE_DEGREES, SHAPE_NAMES, type AiVisual, type ShapeKind } from '../../ai/contract.ts'

// Plane figurer og vinkler i geometrioppgaver, tegnet av appen selv som SVG – samme komponent i
// lærerens oppgavekort, lærerens elevvisning og elevvisningen (via TaskFigure). Ingen bilder og ingen AI.
// Skrevet uten JSX (createElement), så figurene også kan tegnes og testes direkte i Node.
// Formen leses av strek og hjørnemarkeringer, ikke farge: strek i `currentColor`, lys fyll.

type Point = { x: number; y: number }

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const fmt = (n: number) => Math.round(n * 10) / 10
const pointsAttr = (points: Point[]) => points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ')

/** Regulær mangekant med `n` hjørner i en 120 × 120-boks, med ett hjørne rett opp. */
function regular(n: number, radius = 50): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n + (n % 2 === 0 ? Math.PI / n : 0)
    return { x: 60 + radius * Math.cos(angle), y: 62 + radius * Math.sin(angle) }
  })
}

/**
 * Hjørnene i figuren, i en viewBox på 120 × 120 (rektangelet er bredere: 160 × 120).
 * Kvadratet har like sider, rektangelet er tydelig lengre enn det er bredt, og den generelle firkanten
 * er en uregelmessig, konveks firkant uten rette vinkler, like sider eller parallelle sider – så eleven
 * ikke leser inn egenskaper som ikke er oppgitt.
 */
export function shapePoints(shape: Exclude<ShapeKind, 'circle'>): Point[] {
  switch (shape) {
    case 'triangle':
      return regular(3, 56).map((p) => ({ x: p.x, y: p.y + 10 }))
    case 'square':
      return [
        { x: 20, y: 20 },
        { x: 100, y: 20 },
        { x: 100, y: 100 },
        { x: 20, y: 100 },
      ]
    case 'rectangle':
      return [
        { x: 15, y: 30 },
        { x: 145, y: 30 },
        { x: 145, y: 90 },
        { x: 15, y: 90 },
      ]
    case 'quadrilateral':
      return [
        { x: 12, y: 94 },
        { x: 38, y: 18 },
        { x: 96, y: 28 },
        { x: 112, y: 96 },
      ]
    case 'pentagon':
      return regular(5)
    case 'hexagon':
      return regular(6)
    case 'octagon':
      return regular(8)
  }
}

const VIEW = { width: 120, height: 120 }
const viewOf = (figure: AiVisual) => (figure.kind === 'shape' && figure.shape === 'rectangle' ? { width: 160, height: 120 } : VIEW)

/** Toppunktet og endene på de to strålene for en vinkel på `degrees` grader (viewBox 120 × 120). */
export function angleRays(degrees: number): { vertex: Point; ray1: Point; ray2: Point } {
  // Like lange stråler, flyttet slik at vinkelen står midt i figuren uansett gradtall.
  const length = degrees > 90 ? 58 : 76
  const rad = (degrees * Math.PI) / 180
  const raw = { vertex: { x: 0, y: 0 }, ray1: { x: length, y: 0 }, ray2: { x: length * Math.cos(rad), y: -length * Math.sin(rad) } }
  const xs = [0, raw.ray1.x, raw.ray2.x]
  const ys = [0, raw.ray2.y]
  const dx = VIEW.width / 2 - (Math.min(...xs) + Math.max(...xs)) / 2
  const dy = VIEW.height / 2 - (Math.min(...ys) + Math.max(...ys)) / 2
  const move = (p: Point) => ({ x: p.x + dx, y: p.y + dy })
  return { vertex: move(raw.vertex), ray1: move(raw.ray1), ray2: move(raw.ray2) }
}

const STROKE = { stroke: 'currentColor', strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

function shapeParts(shape: ShapeKind): ReactElement[] {
  if (shape === 'circle') {
    return [h('circle', { key: 'o', 'data-part': 'outline', cx: 60, cy: 60, r: 48, className: 'fill-surface-light', strokeWidth: 3, ...STROKE })]
  }
  const points = shapePoints(shape)
  return [
    h('polygon', { key: 'o', 'data-part': 'outline', points: pointsAttr(points), className: 'fill-surface-light', strokeWidth: 3, ...STROKE }),
    // Markerte hjørner gjør det lettere å telle hjørnene.
    ...points.map((p, i) => h('circle', { key: `c${i}`, 'data-part': 'corner', cx: fmt(p.x), cy: fmt(p.y), r: 3.5, fill: 'currentColor' })),
  ]
}

function angleParts(degrees: number, right: boolean): ReactElement[] {
  const { vertex, ray1, ray2 } = angleRays(degrees)
  const r = 20
  const rad = (degrees * Math.PI) / 180
  const arcStart = { x: vertex.x + r, y: vertex.y }
  const arcEnd = { x: vertex.x + r * Math.cos(rad), y: vertex.y - r * Math.sin(rad) }
  const parts: ReactElement[] = [
    h('line', { key: 'r1', 'data-part': 'ray', x1: fmt(vertex.x), y1: fmt(vertex.y), x2: fmt(ray1.x), y2: fmt(ray1.y), strokeWidth: 3, ...STROKE }),
    h('line', { key: 'r2', 'data-part': 'ray', x1: fmt(vertex.x), y1: fmt(vertex.y), x2: fmt(ray2.x), y2: fmt(ray2.y), strokeWidth: 3, ...STROKE }),
    // Vinkelbuen mellom strålene (mot klokka i figuren = sweep-flagg 0 i SVG).
    h('path', {
      key: 'arc',
      'data-part': 'angle-arc',
      d: `M ${fmt(arcStart.x)} ${fmt(arcStart.y)} A ${r} ${r} 0 0 0 ${fmt(arcEnd.x)} ${fmt(arcEnd.y)}`,
      fill: 'none',
      strokeWidth: 2,
      ...STROKE,
    }),
    h('circle', { key: 'v', 'data-part': 'vertex', cx: fmt(vertex.x), cy: fmt(vertex.y), r: 3.5, fill: 'currentColor' }),
  ]
  if (right) {
    // Vanlig rettvinkelsymbol: et lite kvadrat i hjørnet.
    const s = 11
    parts.push(
      h('path', {
        key: 'right',
        'data-part': 'right-angle-marker',
        d: `M ${fmt(vertex.x + s)} ${fmt(vertex.y)} L ${fmt(vertex.x + s)} ${fmt(vertex.y - s)} L ${fmt(vertex.x)} ${fmt(vertex.y - s)}`,
        fill: 'none',
        strokeWidth: 2,
        ...STROKE,
      }),
    )
  }
  return parts
}

/** Navnet på figuren for skjermlesere og som <title>, f.eks. «Femkant» eller «Rett vinkel». */
export const figureLabel = (figure: AiVisual) =>
  figure.kind === 'shape' ? capitalize(SHAPE_NAMES[figure.shape]) : `${capitalize(ANGLE_NAMES[figure.angleType])} vinkel`

/** SVG-figuren til en geometrioppgave. Skalerer med plassen (viewBox, max-w-full, h-auto). */
export function GeometryFigure({ figure, size = 'md' }: { figure: AiVisual; size?: 'sm' | 'md' }): ReactElement {
  const view = viewOf(figure)
  const height = size === 'sm' ? 96 : 160
  const width = Math.round((height * view.width) / view.height)
  const label = figureLabel(figure)
  const degrees = figure.kind === 'angle' ? (figure.degrees ?? DEFAULT_ANGLE_DEGREES[figure.angleType]) : undefined
  return h(
    'svg',
    {
      role: 'img',
      'aria-label': label,
      width,
      height,
      viewBox: `0 0 ${view.width} ${view.height}`,
      className: 'max-w-full h-auto shrink-0 text-primary',
      'data-figure': figure.kind,
      ...(figure.kind === 'shape' ? { 'data-shape': figure.shape } : { 'data-angle-type': figure.angleType, 'data-degrees': degrees }),
    },
    h('title', null, label),
    ...(figure.kind === 'shape' ? shapeParts(figure.shape) : angleParts(degrees!, figure.angleType === 'right')),
  )
}
