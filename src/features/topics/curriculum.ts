import type { PlanUnit, Skill, Term, Topic } from '../../types'

// Årsplan i matematikk for 4. trinn. Ukeantallene er forslag til prototypen, ikke en
// offisiell årsplan. Tema (fag) og periode (når det undervises) er skilt: et tema har
// undertemaer/ferdigheter, og en periode peker på ferdighetene den øver på. Repetisjon er
// en periode som gjenbruker ferdigheter fra tidligere tema – ikke et eget fagtema.

const skill = (id: string, name: string): Skill => ({ id, name })

export const topics: Topic[] = [
  {
    id: 'tall',
    name: 'Tall',
    skills: [
      skill('tall.hoderegning', 'Hoderegning'),
      skill('tall.firesifrede', 'Firesifrede tall'),
      skill('tall.addisjon-subtraksjon', 'Addisjon og subtraksjon'),
      skill('tall.oppstilling', 'Oppstilling med tall over 1000'),
      skill('tall.negative', 'Negative tall'),
    ],
  },
  {
    id: 'multiplikasjon',
    name: 'Multiplikasjon',
    skills: [
      skill('mult.tabell-2-10', '2-, 3-, 4-, 5- og 10-gangen'),
      skill('mult.tabell-6-9', '6-, 7-, 8- og 9-gangen'),
      skill('mult.tiere-hundrere', 'Multiplisere med tiere og hundrere'),
      skill('mult.dele-opp', 'Dele opp og multiplisere'),
      skill('mult.blokkmodeller', 'Bruke blokkmodeller'),
      skill('mult.kombinasjoner', 'Antall ulike kombinasjoner'),
    ],
  },
  {
    id: 'divisjon',
    name: 'Divisjon',
    skills: [
      skill('div.mult-og-div', 'Multiplikasjon og divisjon'),
      skill('div.delings-malings', 'Delingsdivisjon og målingsdivisjon'),
      skill('div.rest', 'Divisjon med noe til overs'),
      skill('div.modeller', 'Bruke modeller'),
    ],
  },
  {
    id: 'geometri',
    name: 'Geometri',
    skills: [
      skill('geo.2d', 'Todimensjonale figurer'),
      skill('geo.3d', 'Tredimensjonale figurer'),
      skill('geo.3d-til-2d', 'Fra tredimensjonal til todimensjonal'),
      skill('geo.vinkler', 'Vinkler'),
    ],
  },
  {
    id: 'problemlosing',
    name: 'Problemløsing',
    skills: [
      skill('prob.regnefortellinger', 'Regnefortellinger og regneuttrykk'),
      skill('prob.modeller', 'Bruke modeller'),
      skill('prob.flersteg', 'Flerstegsoppgaver'),
      skill('prob.flervalg', 'Flervalgsoppgaver'),
    ],
  },
  {
    id: 'tall-og-regning',
    name: 'Tall og regning',
    skills: [
      skill('tr.add-sub', 'Sammenhengen mellom addisjon og subtraksjon'),
      skill('tr.mult-div', 'Sammenhengen mellom multiplikasjon og divisjon'),
      skill('tr.tideler', 'Desimaltall med tideler'),
      skill('tr.desimal-lengde', 'Desimaltall i lengdemåling'),
    ],
  },
  {
    id: 'strategier-i-divisjon',
    name: 'Strategier i divisjon',
    skills: [
      skill('sdiv.hte', 'Dele tall i hundrere, tiere og enere'),
      skill('sdiv.gode-mater', 'Dele tall på gode måter'),
      skill('sdiv.sammenhenger', 'Sammenhenger i divisjon'),
      skill('sdiv.10-100', 'Dividere med 10 og 100'),
      skill('sdiv.malings-delings', 'Målingsdivisjon og delingsdivisjon'),
      skill('sdiv.del-av-hel', 'Del av en hel'),
      skill('sdiv.del-av-mengde', 'Del av en mengde'),
    ],
  },
  {
    id: 'maling',
    name: 'Måling',
    skills: [
      skill('mal.volum', 'Måle volum'),
      skill('mal.liter-dl', 'Liter og desiliter'),
      skill('mal.desimaltall', 'Desimaltall'),
      skill('mal.kg-g', 'Kilogram og gram'),
      skill('mal.areal', 'Måle areal'),
      skill('mal.areal-omkrets', 'Areal og omkrets'),
      skill('mal.tid', 'Tid'),
    ],
  },
  {
    id: 'monster-og-algoritmer',
    name: 'Mønster og algoritmer',
    skills: [
      skill('mon.utforske', 'Utforske mønster'),
      skill('mon.figurtall', 'Figurtall'),
      skill('mon.tallfolger', 'Mønster i tallfølger'),
      skill('mon.lokker', 'Koder med løkker'),
      skill('mon.vilkar', 'Koder med vilkår'),
    ],
  },
  {
    id: 'regning',
    name: 'Regning',
    skills: [
      skill('reg.diagrammer', 'Lese og tolke diagrammer'),
      skill('reg.tabeller', 'Lese og tolke tabeller'),
      skill('reg.fire-regnearter', 'De fire regneartene'),
      skill('reg.algebra', 'Utforske algebra'),
    ],
  },
]

const skillIdsOf = (topicId: string) => topics.find((t) => t.id === topicId)?.skills.map((s) => s.id) ?? []

const topicUnit = (topicId: string, weeks: number): PlanUnit => ({
  id: topicId,
  name: topics.find((t) => t.id === topicId)?.name ?? topicId,
  weeks,
  kind: 'topic',
  topicId,
  skillIds: skillIdsOf(topicId),
})

const repetitionUnit = (id: string, weeks: number, skillIds: string[]): PlanUnit => ({
  id,
  name: 'Repetisjon',
  weeks,
  kind: 'repetition',
  skillIds,
})

/** Høst 16 uker, vinter 10 uker og vår 13 uker – til sammen 39. */
export const terms: Term[] = [
  {
    id: 'host',
    name: 'Høst',
    period: 'August - Desember',
    units: [
      topicUnit('tall', 4),
      topicUnit('multiplikasjon', 5),
      topicUnit('divisjon', 4),
      // Tallforståelse og plassverdi, addisjon og subtraksjon, gangetabellen,
      // grunnleggende divisjon og problemløsing med flere regnearter.
      repetitionUnit('repetisjon-host', 3, [
        'tall.firesifrede',
        'tall.hoderegning',
        'tall.addisjon-subtraksjon',
        'mult.tabell-2-10',
        'mult.tabell-6-9',
        'div.mult-og-div',
        'div.delings-malings',
      ]),
    ],
  },
  {
    id: 'vinter',
    name: 'Vinter',
    period: 'Januar - Mars',
    units: [
      topicUnit('geometri', 3),
      topicUnit('problemlosing', 2),
      topicUnit('tall-og-regning', 3),
      // Figurer, vinkler, problemløsing med flere steg, sammenhenger mellom regneartene og tideler.
      repetitionUnit('repetisjon-vinter', 2, [
        'geo.2d',
        'geo.3d',
        'geo.vinkler',
        'prob.flersteg',
        'tr.add-sub',
        'tr.mult-div',
        'tr.tideler',
      ]),
    ],
  },
  {
    id: 'var',
    name: 'Vår',
    period: 'April - Juni',
    units: [
      topicUnit('strategier-i-divisjon', 3),
      topicUnit('maling', 3),
      topicUnit('monster-og-algoritmer', 2),
      topicUnit('regning', 3),
      // Divisjon, måling (areal og omkrets), mønstre, tabeller og diagrammer, de fire
      // regneartene og sammensatte problemløsingsoppgaver.
      repetitionUnit('repetisjon-var', 2, [
        'sdiv.hte',
        'sdiv.malings-delings',
        'mal.areal',
        'mal.areal-omkrets',
        'mal.tid',
        'mon.tallfolger',
        'reg.diagrammer',
        'reg.tabeller',
        'reg.fire-regnearter',
        'prob.flersteg',
      ]),
    ],
  },
]

/** Alle periodene i årsplanen, i rekkefølge. */
export const planUnits: PlanUnit[] = terms.flatMap((t) => t.units)

export const unitById = (id: string) => planUnits.find((u) => u.id === id)

export const skillById = (id: string) => topics.flatMap((t) => t.skills).find((s) => s.id === id)
