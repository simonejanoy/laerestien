import type { Operator, Task } from '../../types'

const numberFormat = new Intl.NumberFormat('nb-NO')

/** 2345 → «2 345» */
export const formatNumber = (n: number) => numberFormat.format(n)

/** Typografisk minus (−) i stedet for bindestrek. */
export const operatorSymbol = (operator: Operator) => (operator === '+' ? '+' : '−')

export const answerOf = (task: Task) => (task.operator === '+' ? task.a + task.b : task.a - task.b)

export const expressionOf = (task: Task) =>
  `${formatNumber(task.a)} ${operatorSymbol(task.operator)} ${formatNumber(task.b)}`

/** Oppstilling krever regneark, så merkelappen følger typen. */
export const needsWorksheet = (task: Task) => task.type === 'Oppstilling'

/** Et lite tips til eleven, tilpasset regnearten. */
export function hintFor(task: Task) {
  if (task.operator === '-') {
    return `Tell opp fra ${formatNumber(task.b)} til ${formatNumber(task.a)}. Hvor mange steg ble det?`
  }
  const tensA = task.a - (task.a % 10)
  const tensB = task.b - (task.b % 10)
  if (tensA === 0 && tensB === 0) {
    return `Start på ${task.a} og tell ${task.b} videre.`
  }
  return `Legg sammen tierne først (${formatNumber(tensA)} + ${formatNumber(tensB)}), og så enerne (${task.a % 10} + ${task.b % 10}).`
}
