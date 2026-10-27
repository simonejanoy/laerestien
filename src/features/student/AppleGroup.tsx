import apple from '../../assets/student/eple.png'

/** Én gruppe epler (maks 12, i to rader à 6). */
export function AppleGroup({ count, correct }: { count: number; correct: boolean }) {
  return (
    <figure
      className={`flex h-[220px] flex-1 flex-col items-center justify-center gap-3.5 rounded-[20px] px-4 py-5 ${
        correct ? 'bg-level2-surface' : 'bg-group'
      }`}
    >
      <div className="grid h-[168px] w-full max-w-[532px] grid-cols-6 grid-rows-2" aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <img key={i} src={apple} alt="" className="h-[71px] w-[60px] object-contain p-2" />
        ))}
      </div>
      <figcaption className="text-lg font-medium text-primary">{count} epler</figcaption>
    </figure>
  )
}
