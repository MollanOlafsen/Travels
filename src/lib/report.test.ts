import { describe, expect, it } from 'vitest'
import type { Segment, Settings } from '../types'
import { RULE_DEFS } from './rules'
import { buildPdf, daysCsv, monthRows, tripsCsv } from './report'
import { computePresence } from './rules'

const settings: Settings = {
  name: 'Roger Mollan-Olafsen',
  postedPartnerName: 'Pål',
  postCountry: 'FR',
  postCity: 'Paris',
  homeCountry: 'NO',
  address: '',
  postingStart: '2026-08-05',
  serviceStart: '2026-08-10',
  initialCountry: 'FR',
  travelDayCountsBoth: true,
  rules: RULE_DEFS.map((r) => ({ id: r.id, enabled: r.defaultEnabled, params: { ...r.defaultParams } })),
  customAirports: {},
}

const segs: Segment[] = [
  { id: 'a', date: '2026-08-20', from: 'CDG', to: 'OSL', fromCountry: 'FR', toCountry: 'NO', carrier: 'SK', flight: '4703', source: 'barcode', createdAt: 1, order: 0 },
  { id: 'b', date: '2026-08-28', from: 'OSL', to: 'CDG', fromCountry: 'NO', toCountry: 'FR', carrier: 'AF', flight: '1275', source: 'manual', createdAt: 2, order: 0, note: 'Jobbuke i Oslo' },
]

describe('rapport', () => {
  it('månedsrader summerer riktig', () => {
    const p = computePresence(segs, settings, '2026-09-02')
    const rows = monthRows(segs, p, settings, '2026-08-05', '2026-09-02')
    expect(rows.map((r) => r.label)).toEqual(['august 2026', 'september 2026'])
    expect(rows[0]).toMatchObject({ post: 20, home: 9, other: 0, nightsPost: 19, nightsHome: 8, visits: 1 })
    expect(rows[1]).toMatchObject({ post: 2, home: 0 })
  })

  it('lager CSV med BOM og semikolon', () => {
    const csv = tripsCsv(segs, settings, '2026-01-01', '2026-12-31')
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.split('\r\n')).toHaveLength(3)
    expect(csv).toContain('2026-08-28;;OSL;Norge;CDG;Frankrike;AF;1275;;;Manuelt registrert;Jobbuke i Oslo')
    const days = daysCsv(segs, settings, '2026-08-19', '2026-08-21', '2026-09-02')
    expect(days.split('\r\n')).toHaveLength(4)
    expect(days).toContain('2026-08-20;Frankrike + Norge;Norge;1;1')
  })

  it('bygger en PDF', async () => {
    const blob = await buildPdf(segs, new Map(), settings, { from: '2026-08-05', to: '2026-09-02', includeRules: true, includeDays: true, includeImages: false }, '2026-09-02')
    expect(blob.size).toBeGreaterThan(5000)
    const head = new TextDecoder('latin1').decode((await blob.arrayBuffer()).slice(0, 8))
    expect(head.startsWith('%PDF')).toBe(true)
  })
})
