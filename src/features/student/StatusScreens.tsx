import teacher from '../../assets/student/laerer.png'

/** Teksten på tavla i de tre tilstandene der eleven ikke har oppgaver foran seg. */
const BOARD_TEXT = {
  waiting: 'Venter på at læreren skal starte økten',
  paused: 'Følg med på læreren',
  ended: 'Økten er avsluttet',
} as const

/**
 * Mørk tavle med læreren ved tavla og én kort tekst (Figma: «Elevvisning – læreren har trykket på pause»). Brukes når
 * eleven venter på at økta starter, når læreren har pause, og når økta er avsluttet. Legges i StudentLayout med
 * background="board".
 */
export function BoardScreen({ state }: { state: keyof typeof BOARD_TEXT }) {
  return (
    <div role="status" data-testid={`tavle-${state}`} className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <img src={teacher} alt="" width={96} height={96} />
      <h2 className="max-w-[560px] text-center text-h1 text-white">{BOARD_TEXT[state]}</h2>
    </div>
  )
}

/** Hilsen øverst i elevvisningen, f.eks. «Hei, Emma! Vi legger sammen». */
export function Greeting({ text }: { text: string }) {
  return (
    <div className="bg-cream px-20 py-9">
      <h1 className="text-h1 text-primary">{text}</h1>
    </div>
  )
}

/** Når det ikke er noen oppgave å vise: venter, ferdig eller feil. */
export function MessageCard({ title, text }: { title: string; text?: string }) {
  return (
    <div className="px-20 pb-12">
      <section role="status" className="flex flex-col gap-2.5 rounded-3xl border border-card-border bg-background p-8">
        <h2 className="text-h2 text-primary">{title}</h2>
        {text && <p className="text-lg leading-normal text-muted">{text}</p>}
      </section>
    </div>
  )
}
