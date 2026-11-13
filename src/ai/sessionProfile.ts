import { topicOfArea } from './contract.ts'
import { planned, type Planned } from '../features/sessions/sessionTasks.ts'
import { unitSpecs } from '../features/topics/yearPlan.ts'
import type { Operator, Session, TaskProfile } from '../types/index.ts'

// Øktprofilen AI-en får når oppgaver bestilles. Den styrer fagområdet, referansebanken og de faglige kontrollene på
// serveren. Øktene i årsplanen har sin egen profil. Repetisjonsøkter og økter læreren lager selv har ingen – da fikk
// AI-en bare temanavnet og eksempler fra oppgavesettet, og laget ofte regnestykker uansett tema («Klokka» → addisjon).
// Her finnes en profil i årsplanen ut fra undertemaene eller overskriften. Profilen brukes bare i bestillingen:
// årsplanen, undertemaene, nivåene og oppgavene i økta endres ikke.

/** Høyst så mange tilgrensende fagområder (samme grense som serveren bruker). */
const MAX_SECONDARY = 3

/** Øktene i årsplanen som har en profil med fagområde. */
const profiled = (): Planned[] => unitSpecs.flatMap((u) => planned(u.unitId)).filter((p) => p.profile?.area)

/** Ord som sier lite om innholdet i en overskrift. */
const STOP_WORDS = new Set(['og', 'med', 'til', 'fra', 'for', 'som', 'den', 'det', 'der', 'hvor', 'mer', 'økt', 'økta', 'tall', 'ulike'])

/** Innholdsordene i en tekst, med de første fem bokstavene som stamme («klokka»/«klokke» → «klokk»). */
function stems(text: string) {
  return new Set(
    (text.toLowerCase().match(/\p{L}+/gu) ?? []).filter((w) => w.length >= 4 && !STOP_WORDS.has(w)).map((w) => w.slice(0, 5)),
  )
}

/**
 * Flere profiler slått sammen til én bestilling: fagområdet er det første, de andre fagområdene i samme tema er
 * tilgrensende områder (serveren kontrollerer bare områder i samme tema som hovedområdet). Regneartene er alle
 * regneartene i profilene, så ingen gyldig oppgave avvises for regnearten.
 */
function combine(profiles: TaskProfile[], focus: string): TaskProfile {
  const [main] = profiles
  const topic = topicOfArea(main.area!)
  const sameTopic = profiles.filter((p) => topicOfArea(p.area!) === topic)
  if (sameTopic.length === 1) return main
  const areas = [...new Set(sameTopic.flatMap((p) => [p.area!, ...(p.secondaryAreas ?? [])]))].filter((a) => a !== main.area)
  const operations = [...new Set(sameTopic.flatMap((p) => p.operations))] as Operator[]
  return {
    ...main,
    focus,
    operations,
    ...(areas.length > 0 && { secondaryAreas: areas.slice(0, MAX_SECONDARY) }),
    // Krav som bare gjelder én bestemt økt, følger ikke med når flere økter slås sammen.
    taskVariant: undefined,
    divisionType: undefined,
    requiresCarry: undefined,
    strategyFocus: undefined,
    allowSwappedFactors: undefined,
  }
}

/** Temaet flest av profilene hører til (ved likt antall: det første). */
function mainTopicFirst(profiles: TaskProfile[]) {
  const count = (p: TaskProfile) => profiles.filter((q) => topicOfArea(q.area!) === topicOfArea(p.area!)).length
  const best = Math.max(...profiles.map(count))
  const first = profiles.find((p) => count(p) === best)!
  return [first, ...profiles.filter((p) => p !== first)]
}

/**
 * Profilen for et sett undertemaer (repetisjon): profilene til øktene i årsplanen som øver på dem, slått sammen.
 * Hovedområdet kommer fra temaet flest av undertemaene hører til; undertemaer i andre tema bør bestilles for seg
 * (se repetisjonen, som lager én bestilling per tema). Null når ingen av undertemaene har en profil.
 */
export function profileForSkills(skills: readonly string[], focus: string): TaskProfile | null {
  const all = profiled()
  const unique = [...new Set(skills.flatMap((skill) => all.find((p) => p.skills.includes(skill))?.profile ?? []))]
  if (unique.length === 0) return null
  return combine(mainTopicFirst(unique), `${focus} ${unique.map((p) => p.focus).join(' ')}`.trim())
}

/** Faget (referansebanken) et undertema hører til – til å dele en repetisjonsbestilling per tema. */
export function topicOfSkill(skill: string) {
  const profile = profiled().find((p) => p.skills.includes(skill))?.profile
  return profile?.area ? topicOfArea(profile.area) : null
}

export interface DerivedProfile {
  profile: TaskProfile
  /** Hvor profilen kommer fra: øktas egen, undertemaene, overskriften eller hele temaet. */
  source: 'session' | 'skills' | 'heading' | 'topic'
}

/**
 * Profilen en bestilling skal bruke for økta, eller null når temaet ikke har profiler i årsplanen:
 * 1. øktas egen profil med fagområde (øktene i årsplanen)
 * 2. undertemaene (repetisjon): profilene til øktene i årsplanen som øver på de samme undertemaene
 * 3. overskriften (økt læreren har laget selv): øktene i samme tema med flest felles innholdsord
 * 4. ellers hele temaet: alle fagområdene i temaet
 * En egen profil uten fagområde brukes bare når ingen av de andre gir noe.
 */
export function aiProfileFor(session: Pick<Session, 'taskProfile' | 'skillIds' | 'topicId' | 'heading'>): DerivedProfile | null {
  if (session.taskProfile?.area) return { profile: session.taskProfile, source: 'session' }
  const own = session.taskProfile ? ({ profile: session.taskProfile, source: 'session' } as const) : null
  const all = profiled()

  const fromSkills = profileForSkills(session.skillIds ?? [], `Repetisjon: ${session.heading}.`)
  if (fromSkills) return { profile: fromSkills, source: 'skills' }

  const inTopic = all.filter((p) => p.spec.unitId === session.topicId)
  if (inTopic.length === 0) return own
  const words = stems(session.heading)
  const scored = inTopic
    .map((p) => {
      // Ord i overskriften teller dobbelt så mye som ord i fokusbeskrivelsen («Vinkler» → vinkeløktene, ikke en
      // firkantøkt som nevner rette vinkler).
      const heading = stems(p.heading)
      const focus = stems(p.profile!.focus)
      return { p, score: [...words].reduce((n, w) => n + (heading.has(w) ? 2 : focus.has(w) ? 1 : 0), 0) }
    })
    .sort((a, b) => b.score - a.score)
  // Flere økter like gode («Vinkler»: to vinkeløkter, «Tabeller og diagrammer»: to økter): alle slås sammen.
  const best = scored.filter((x) => x.score > 0 && x.score === scored[0].score).map((x) => x.p.profile!)
  if (best.length === 1) return { profile: best[0], source: 'heading' }
  if (best.length > 1) {
    const areas = new Set(best.map((p) => p.area))
    const distinct = best.filter((p, i) => best.findIndex((q) => q.area === p.area) === i)
    return { profile: combine(areas.size === 1 ? best : distinct, `${session.heading}. ${best.map((p) => p.focus).join(' ')}`), source: 'heading' }
  }

  const topicProfiles = [...new Set(inTopic.map((p) => p.profile!))]
  return { profile: combine(topicProfiles, `${session.heading}. ${inTopic[0].spec.description}`), source: 'topic' }
}
