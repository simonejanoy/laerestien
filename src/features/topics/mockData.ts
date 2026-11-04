import type { TopicDetails } from '../../types'
import { unitDetails } from './yearPlan'

// Årsplanen for 4. trinn (se curriculum.ts) og planen for hver periode (se yearPlan.ts).
// Testdata frem til Firestore er på plass.

export { planUnits, terms, unitById } from './curriculum'

export const topicDetails: TopicDetails[] = unitDetails
