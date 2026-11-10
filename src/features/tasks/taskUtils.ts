import type { Operator, Task } from '../../types/index.ts'

const numberFormat = new Intl.NumberFormat('nb-NO')

/** 2345 → «2 345» */
export const formatNumber = (n: number) => numberFormat.format(n)

/** Tegnene elevene bruker: typografisk minus (−), gangeprikk (·) og kolon for deling. */
const symbols: Record<Operator, string> = { '+': '+', '-': '−', '*': '·', '/': ':' }

export const operators = Object.keys(symbols) as Operator[]

export const operatorSymbol = (operator: Operator) => symbols[operator]

export function answerOf(task: Task) {
  switch (task.operator) {
    case '+':
      return task.a + task.b
    case '-':
      return task.a - task.b
    case '*':
      return task.a * task.b
    case '/':
      return task.b === 0 ? NaN : task.a / task.b
  }
}

/** Hva som er galt med regnestykket, eller null hvis svaret er et helt tall ≥ 0. */
export function answerProblem(task: Task) {
  if (task.operator === '/' && (task.b === 0 || task.a % task.b !== 0)) return 'Delingen går ikke opp'
  if (answerOf(task) < 0) return 'Svaret blir negativt'
  return null
}

export const expressionOf = (task: Task) =>
  `${formatNumber(task.a)} ${operatorSymbol(task.operator)} ${formatNumber(task.b)}`

/** Oppstilling krever regneark, så merkelappen følger typen. */
export const needsWorksheet = (task: Task) => task.type === 'Oppstilling'

/** Et lite tips til eleven, tilpasset regnearten. */
export function hintFor(task: Task) {
  if (task.operator === '-') {
    return `Tell opp fra ${formatNumber(task.b)} til ${formatNumber(task.a)}. Hvor mange steg ble det?`
  }
  if (task.operator === '*') {
    return `Tenk ${formatNumber(task.a)} grupper med ${formatNumber(task.b)} i hver. Hopp-tell ${formatNumber(task.b)} om gangen.`
  }
  if (task.operator === '/') {
    return `Hvor mange ganger går ${formatNumber(task.b)} opp i ${formatNumber(task.a)}? Bruk gangetabellen baklengs.`
  }
  const tensA = task.a - (task.a % 10)
  const tensB = task.b - (task.b % 10)
  if (tensA === 0 && tensB === 0) {
    return `Start på ${task.a} og tell ${task.b} videre.`
  }
  return `Legg sammen tierne først (${formatNumber(tensA)} + ${formatNumber(tensB)}), og så enerne (${task.a % 10} + ${task.b % 10}).`
}
