import { describe, expect, it } from 'vitest'
import type { Segment, Visit } from '../types'
import { DEPTS, REGIONS } from '../data/franceMap'
import { CITIES, REGION_INFO, computeFrance, deptAt, findCity, nearestCity, suggestionsFromTrips, badges } from './france'

const visit = (dept: string, date: string, extra: Partial<Visit> = {}): Visit => ({ id: `${dept}-${date}`, dept, date, createdAt: 0, updatedAt: 0, ...extra })

describe('kartdata', () => {
  it('har 13 regioner og 96 departementer', () => {
    expect(REGIONS).toHaveLength(13)
    expect(DEPTS).toHaveLength(96)
    expect(REGIONS.reduce((s, r) => s + r.depts.length, 0)).toBe(96)
    for (const r of REGIONS) expect(REGION_INFO[r.code], r.name).toBeDefined()
  })

  it('plasserer departementer i riktig region', () => {
    const reg = (d: string) => DEPTS.find((x) => x.code === d)!.region
    expect(reg('75')).toBe('11')
    expect(reg('69')).toBe('84')
    expect(reg('2A')).toBe('94')
    expect(reg('29')).toBe('53')
    expect(reg('44')).toBe('52')
    expect(reg('67')).toBe('44')
  })
})

describe('GPS → departement', () => {
  it('finner kjente steder', () => {
    expect(deptAt(48.8584, 2.2945)?.code).toBe('75') // Eiffeltårnet
    expect(deptAt(45.764, 4.8357)?.code).toBe('69') // Lyon
    expect(deptAt(41.9192, 8.7386)?.code).toBe('2A') // Ajaccio
    expect(deptAt(48.6361, -1.5115)?.code).toBe('50') // Mont-Saint-Michel
    expect(deptAt(59.91, 10.75)).toBeUndefined() // Oslo
  })

  it('alle byene i stedslisten ligger i departementet de er oppført med', () => {
    const wrong = CITIES.filter((c) => deptAt(c.lat, c.lon)?.code !== c.dept).map((c) => `${c.name}: ${deptAt(c.lat, c.lon)?.code}≠${c.dept}`)
    expect(wrong).toEqual([])
  })

  it('finner nærmeste by og byer fra fritekst', () => {
    expect(nearestCity(43.3, 5.38)?.name).toBe('Marseille')
    expect(nearestCity(47.0, -30)).toBeUndefined()
    expect(findCity('lyon part-dieu')?.dept).toBe('69')
    expect(findCity('NIMES')?.name).toBe('Nîmes')
  })
})

describe('statistikk', () => {
  it('teller regioner, hjemregion og neste mål', () => {
    const s = computeFrance([visit('69', '2026-09-01'), visit('38', '2026-09-02'), visit('06', '2026-10-10')], { franceHomeCounts: true })
    expect(s.regionsVisited).toBe(3) // IDF (hjem) + ARA + PACA
    expect(s.deptsVisited.size).toBe(4) // + Paris (hjemme)
    expect(s.regions.find((r) => r.code === '84')!.deptsVisited).toEqual(['38', '69'])
    expect(s.timeline.map((t) => t.code)).toEqual(['84', '93'])
    expect(s.next).toBe('44') // Grand Est – Reims på 45 min
    expect(s.level.title).toBe('Helgeturist')
    expect(s.areaPct).toBeGreaterThan(0)
    expect(s.areaPct).toBeLessThan(10)

    const s2 = computeFrance([], { franceHomeCounts: false })
    expect(s2.regionsVisited).toBe(0)
    expect(s2.deptsVisited.size).toBe(0)
    expect(s2.next).toBe('11')
  })

  it('gir merker', () => {
    const vs = [visit('2A', '2026-09-01')]
    const b = badges(computeFrance(vs, { franceHomeCounts: true }), vs)
    expect(b.find((x) => x.id === 'corse')!.earned).toBe(true)
    expect(b.find((x) => x.id === 'sea')!.earned).toBe(true)
    expect(b.find((x) => x.id === 'alps')!.earned).toBe(false)
  })
})

describe('forslag fra reiser', () => {
  const seg = (id: string, to: string, date: string): Segment => ({ id, date, from: 'CDG', to, fromCountry: 'FR', toCountry: 'FR', source: 'manual', createdAt: 0, updatedAt: 0, order: 0 })
  it('foreslår franske flyplasser utenfor Île-de-France', () => {
    const segs = [seg('a', 'NCE', '2026-10-01'), seg('b', 'ORY', '2026-10-03'), seg('c', 'OSL', '2026-10-05'), seg('d', 'AJA', '2026-11-01')]
    const sug = suggestionsFromTrips(segs, [], [])
    expect(sug.map((s) => [s.dept, s.place])).toEqual([
      ['2A', 'Ajaccio'],
      ['06', 'Nice'],
    ])
    expect(suggestionsFromTrips(segs, [visit('06', '2026-10-01')], ['d'])).toHaveLength(0)
  })
})
