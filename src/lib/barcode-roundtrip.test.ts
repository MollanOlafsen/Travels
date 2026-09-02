// Ende-til-ende: lager en ekte PDF417/Aztec-strekkode med BCBP-innhold, leser den tilbake og tolker den.
import { describe, expect, it } from 'vitest'
import { readBarcodes } from 'zxing-wasm/reader'
import { writeBarcode } from 'zxing-wasm/writer'
import { parseBcbp } from './bcbp'

const BCBP = 'M1MOLLAN OLAFSEN/ROGEREABC123 CDGOSLAF 1274 246Y014C0031 100'

describe('strekkode rundtur', () => {
  for (const format of ['PDF417', 'Aztec', 'QRCode'] as const) {
    it(`skriver og leser ${format}`, async () => {
      const written = await writeBarcode(BCBP, { format, scale: 3 })
      expect(written.image).toBeTruthy()
      const bytes = new Uint8Array(await written.image!.arrayBuffer())
      const hits = await readBarcodes(bytes, { formats: [format], tryHarder: true, textMode: 'Plain' })
      expect(hits.length).toBeGreaterThan(0)
      const b = parseBcbp(hits[0].text)!
      expect(b).not.toBeNull()
      expect(b.legs[0]).toMatchObject({ from: 'CDG', to: 'OSL', carrier: 'AF', flight: '1274', dayOfYear: 246, seat: '14C', pnr: 'ABC123' })
      expect(b.passenger).toBe('Roger Mollan olafsen')
    }, 30000)
  }
})
