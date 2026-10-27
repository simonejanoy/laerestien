import type { MasteryStatus } from '../../types'

export const statusLabel: Record<MasteryStatus, string> = {
  understanding: 'Viser forståelse',
  needsSupport: 'Trenger oppfølging',
  insufficient: 'For lite grunnlag',
}

export const statusText: Record<MasteryStatus, string> = {
  understanding: 'text-understanding',
  needsSupport: 'text-needs-support',
  insufficient: 'text-insufficient',
}

export const statusFill: Record<MasteryStatus, string> = {
  understanding: 'bg-understanding',
  needsSupport: 'bg-needs-support',
  insufficient: 'bg-insufficient',
}
