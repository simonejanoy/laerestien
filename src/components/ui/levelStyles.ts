import type { Level } from '../../types'

export const levelStyles: Record<Level, { text: string; bar: string; surface: string; border: string }> = {
  1: { text: 'text-level1', bar: 'bg-level1', surface: 'bg-level1-surface', border: 'border-level1' },
  2: { text: 'text-level2', bar: 'bg-level2', surface: 'bg-level2-surface', border: 'border-level2' },
  3: { text: 'text-level3', bar: 'bg-level3', surface: 'bg-level3-surface', border: 'border-level3' },
}
