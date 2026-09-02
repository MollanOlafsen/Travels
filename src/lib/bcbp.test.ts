import { describe, expect, it } from 'vitest'
import { formatPassengerName, parseBcbp, resolveJulianDate } from './bcbp'

// Eksempel fra IATA-standarden, tilpasset OSL–CDG
const SINGLE = 'M1MOLLAN/ROGER        EABC123 OSLCDGSK 4703 218Y012A0045 100'
const MULTI =
  'M2MOLLAN/ROGER        EABC123 OSLCPHSK 1456 218Y012A0045 100' +
  'ABC123 CPHCDGSK 1555 218Y014C0031 100'

describe('parseBcbp', () => {
  it('leser én strekning', () => {
    const b = parseBcbp(SINGLE)!
    expect(b).not.toBeNull()
    expect(b.passenger).toBe('Roger Mollan')
    expect(b.legs).toHaveLength(1)
    expect(b.legs[0]).toMatchObject({ pnr: 'ABC123', from: 'OSL', to: 'CDG', carrier: 'SK', flight: '4703', dayOfYear: 218, seat: '12A' })
  })
  it('leser flere strekninger', () => {
    const b = parseBcbp(MULTI)!
    expect(b.legs).toHaveLength(2)
    expect(b.legs[1]).toMatchObject({ from: 'CPH', to: 'CDG', flight: '1555', seat: '14C' })
  })
  it('avviser tekst som ikke er BCBP', () => {
    expect(parseBcbp('https://example.com')).toBeNull()
    expect(parseBcbp('M1')).toBeNull()
  })
})

describe('resolveJulianDate', () => {
  it('velger året nærmest referansen', () => {
    expect(resolveJulianDate(218, new Date(2026, 7, 10))).toBe('2026-08-06')
    // dag 5 sett fra slutten av desember → neste år
    expect(resolveJulianDate(5, new Date(2026, 11, 28))).toBe('2027-01-05')
    // dag 360 sett fra begynnelsen av januar → forrige år
    expect(resolveJulianDate(360, new Date(2027, 0, 3))).toBe('2026-12-26')
  })
  it('avviser ugyldige dager', () => {
    expect(resolveJulianDate(0)).toBeNull()
    expect(resolveJulianDate(400)).toBeNull()
  })
})

describe('formatPassengerName', () => {
  it('formaterer ETTERNAVN/FORNAVN MR', () => {
    expect(formatPassengerName('MOLLAN OLAFSEN/ROGER MR')).toBe('Roger Mollan olafsen')
  })
})
