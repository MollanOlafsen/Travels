import { describe, expect, it } from 'vitest'
import type { Segment, Settings } from '../types'
import { RULE_DEFS, absencesFrom, computePresence, daysIn, evaluateRules, homeVisits, nightsIn, rollingDays } from './rules'

const settings: Settings = {
  name: 'Roger',
  postedPartnerName: 'Pål',
  station: 'Norges ambassade i Paris',
  postCountry: 'FR',
  postCity: 'Paris',
  homeCountry: 'NO',
  address: '',
  commuterAddress: '',
  employer: '',
  postingStart: '2026-08-05',
  serviceStart: '2026-08-10',
  initialCountry: 'FR',
  travelDayCountsBoth: true,
  rules: RULE_DEFS.map((r) => ({ id: r.id, enabled: true, params: { ...r.defaultParams } })),
  customAirports: {},
}

let n = 0
const seg = (date: string, from: string, to: string, extra: Partial<Segment> = {}): Segment => ({
  id: `s${n++}`,
  date,
  from,
  to,
  fromCountry: from === 'OSL' ? 'NO' : from === 'CDG' ? 'FR' : 'IT',
  toCountry: to === 'OSL' ? 'NO' : to === 'CDG' ? 'FR' : 'IT',
  source: 'manual',
  createdAt: n,
  updatedAt: n,
  order: 0,
  ...extra,
})

describe('computePresence', () => {
  it('starter på tjenestestedet og følger reisene', () => {
    const segs = [seg('2026-08-10', 'CDG', 'OSL'), seg('2026-08-14', 'OSL', 'CDG')]
    const p = computePresence(segs, settings, '2026-08-20')
    expect(p.byDate.get('2026-08-05')!.countries).toEqual(['FR'])
    expect(p.byDate.get('2026-08-10')!.countries).toEqual(['FR', 'NO'])
    expect(p.byDate.get('2026-08-10')!.endOfDay).toBe('NO')
    expect(p.byDate.get('2026-08-12')!.countries).toEqual(['NO'])
    expect(p.byDate.get('2026-08-14')!.countries).toEqual(['NO', 'FR'])
    expect(p.byDate.get('2026-08-20')!.endOfDay).toBe('FR')
    expect(daysIn(p, 'NO', '2026-08-05', '2026-08-20')).toBe(5)
    expect(daysIn(p, 'FR', '2026-08-05', '2026-08-20')).toBe(13)
    expect(nightsIn(p, 'NO', '2026-08-05', '2026-08-20')).toBe(4)
  })

  it('reisedag teller bare ankomstland når travelDayCountsBoth er av', () => {
    const p = computePresence([seg('2026-08-10', 'CDG', 'OSL')], { ...settings, travelDayCountsBoth: false }, '2026-08-11')
    expect(p.byDate.get('2026-08-10')!.countries).toEqual(['NO'])
  })

  it('håndterer nattfly (ankomst neste dag)', () => {
    const p = computePresence([seg('2026-09-01', 'OSL', 'CDG', { arrivalDate: '2026-09-02' })], { ...settings, initialCountry: 'NO' }, '2026-09-03')
    expect(p.byDate.get('2026-09-01')!.countries).toEqual(['NO'])
    expect(p.byDate.get('2026-09-01')!.endOfDay).toBe('XX')
    expect(p.byDate.get('2026-09-02')!.countries).toEqual(['FR'])
  })
})

describe('tellere', () => {
  it('finner sammenhengende fravær', () => {
    const segs = [seg('2026-08-10', 'CDG', 'OSL'), seg('2026-08-14', 'OSL', 'CDG'), seg('2026-09-01', 'CDG', 'OSL')]
    const p = computePresence(segs, settings, '2026-09-10')
    const abs = absencesFrom(p, 'FR')
    expect(abs).toEqual([
      { from: '2026-08-11', to: '2026-08-13', days: 3, ongoing: false },
      { from: '2026-09-02', to: '2026-09-10', days: 9, ongoing: true },
    ])
  })

  it('teller besøksreiser med overnatting', () => {
    const segs = [
      seg('2026-08-10', 'CDG', 'OSL'),
      seg('2026-08-14', 'OSL', 'CDG'), // overnatter i Paris → teller
      seg('2026-09-01', 'CDG', 'OSL'),
      seg('2026-09-05', 'OSL', 'CDG'),
      seg('2026-09-05', 'CDG', 'OSL', { order: 1 }), // samme dag videre → teller ikke
    ]
    const p = computePresence(segs, settings, '2026-09-10')
    expect(homeVisits(segs, p, 'FR', 2026)).toEqual(['2026-08-14'])
  })

  it('rullerende 12-månedersvindu', () => {
    const p = computePresence([seg('2026-08-10', 'CDG', 'OSL')], settings, '2027-09-01')
    expect(rollingDays(p, 'NO', '2027-08-09', 12)).toBe(365)
    expect(rollingDays(p, 'NO', '2027-09-01', 12)).toBe(365)
  })
})

describe('evaluateRules', () => {
  it('gir ok-status ved lite fravær', () => {
    const segs = [seg('2026-08-10', 'CDG', 'OSL'), seg('2026-08-14', 'OSL', 'CDG')]
    const res = evaluateRules(segs, settings, '2026-09-02')
    const by = Object.fromEntries(res.map((r) => [r.id, r]))
    expect(by.ud_fast_bosatt.status).toBe('ok')
    expect(by.ud_absence_3m.status).toBe('ok')
    expect(by.ud_absence_3m.value).toBe('På tjenestestedet')
    expect(by.skatt_home_visits.value).toBe('1 av 3 reiser')
    expect(by.skatt_183.status).toBe('ok')
  })

  it('varsler når 3-månedersfristen nærmer seg', () => {
    const segs = [seg('2026-08-10', 'CDG', 'OSL')]
    const res = evaluateRules(segs, settings, '2026-10-25')
    const r = res.find((x) => x.id === 'ud_absence_3m')!
    expect(r.status).toBe('warn')
    expect(r.detail).toContain('11.11.2026')
    const late = evaluateRules(segs, settings, '2026-11-12').find((x) => x.id === 'ud_absence_3m')!
    expect(late.status).toBe('critical')
  })

  it('teller tjenestetiden fra tiltredelsesdato', () => {
    const r = evaluateRules([], settings, '2026-09-02').find((x) => x.id === 'ud_fast_bosatt')!
    expect(r.value).toBe('24 av 144 dager')
    expect(r.detail).toContain('minst 72 dager')
    expect(r.detail).toContain('10.8.2026–31.12.2026')
  })

  it('slår kritisk når 50 %-kravet ikke lenger kan nås', () => {
    const segs = [seg('2026-08-06', 'CDG', 'OSL')]
    const r = evaluateRules(segs, settings, '2026-11-15').find((x) => x.id === 'ud_fast_bosatt')!
    expect(r.status).toBe('critical')
  })

  it('respekterer avslåtte regler', () => {
    const s = { ...settings, rules: settings.rules.map((r) => ({ ...r, enabled: r.id !== 'skatt_183' })) }
    const r = evaluateRules([], s, '2026-09-02').find((x) => x.id === 'skatt_183')!
    expect(r.status).toBe('off')
  })
})
