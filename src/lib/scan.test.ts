import { describe, expect, it } from 'vitest'
import { extractDate, extractFlight, extractRoute, extractSeat } from './scan'

const ref = new Date(2026, 8, 2)

describe('OCR-tolkning', () => {
  it('finner dato i ulike formater', () => {
    expect(extractDate('DATE 05AUG26 GATE B12', ref)).toBe('2026-08-05')
    expect(extractDate('Departure 05 AUG 2026', ref)).toBe('2026-08-05')
    expect(extractDate('05AUG', ref)).toBe('2026-08-05')
    expect(extractDate('Dato: 05.08.2026', ref)).toBe('2026-08-05')
    expect(extractDate('2026-08-05T10:30', ref)).toBe('2026-08-05')
    expect(extractDate('AUG 05, 2026', ref)).toBe('2026-08-05')
    expect(extractDate('05 AOÛT 2026', ref)).toBe('2026-08-05')
  })

  it('finner rute', () => {
    expect(extractRoute('OSLO OSL → PARIS CDG', ['NO', 'FR'])).toEqual({ from: 'OSL', to: 'CDG' })
    expect(extractRoute('FROM OSL TO CDG SEAT 12A', ['NO', 'FR'])).toEqual({ from: 'OSL', to: 'CDG' })
    expect(extractRoute('OSL-CDG', ['NO', 'FR'])).toEqual({ from: 'OSL', to: 'CDG' })
  })

  it('ignorerer norske ord som ligner IATA-koder', () => {
    const r = extractRoute('FRA OSLO TIL PARIS OSL CDG', ['NO', 'FR'])
    expect(r).toEqual({ from: 'OSL', to: 'CDG' })
  })

  it('finner flightnummer og sete', () => {
    expect(extractFlight('FLIGHT SK 4703 GATE 12')).toEqual({ carrier: 'SK', flight: '4703' })
    expect(extractFlight('AF1275')).toEqual({ carrier: 'AF', flight: '1275' })
    expect(extractFlight('D8 3612')).toEqual({ carrier: 'D8', flight: '3612' })
    expect(extractSeat('SEAT 14C')).toBe('14C')
  })
})
