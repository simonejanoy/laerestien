import { TermBlock } from './TermBlock'
import { terms } from './mockData'

export function AllTopicsPage() {
  return (
    <div className="flex max-w-[1039px] flex-col gap-12">
      <h1 className="text-h1 text-on-background">Alle tema</h1>
      <div className="flex flex-col gap-[25px]">
        {terms.map((term) => (
          <TermBlock key={term.id} term={term} />
        ))}
      </div>
    </div>
  )
}
