import { divisionReferences } from './division.ts'
import { geometryReferences } from './geometry.ts'
import { multiplicationReferences } from './multiplication.ts'
import { placeValueReferences } from './placeValue.ts'
import { problemSolvingReferences } from './problemSolving.ts'
import type { ReferenceTask } from './types.ts'

// Alle referansebankene samlet. Fagområdene har unike ID-er på tvers av temaene, så utvalget
// (selectReferences) filtrerer bare på fagområde og nivå.

export const referenceBanks: readonly ReferenceTask[] = [...multiplicationReferences, ...placeValueReferences, ...divisionReferences, ...geometryReferences, ...problemSolvingReferences]
