import teacher from '../../assets/student/laerer.png'

/** Mørk tavle når læreren har trykket på pause. */
export function PausedScreen() {
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <img src={teacher} alt="" width={96} height={96} />
      <p className="text-h1 text-white">Følg med på læreren</p>
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
