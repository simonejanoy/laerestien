function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function Avatar({ name }: { name: string }) {
  return (
    <div className="flex size-[50px] shrink-0 items-center justify-center rounded-full bg-surface text-h3 text-on-surface">
      {initials(name)}
    </div>
  )
}
