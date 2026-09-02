// Lager PNG-ikoner (192, 512, 180 apple-touch) uten eksterne avhengigheter.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(root, { recursive: true })

const NAVY = [15, 27, 45]
const GOLD = [201, 169, 97]
const CREAM = [246, 241, 231]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y)
      const o = y * (size * 3 + 1) + 1 + x * 3
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bitdybde
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

function draw(size) {
  const c = size / 2
  const R = size * 0.3
  const ring = size * 0.028
  const dot = size * 0.025
  return (x, y) => {
    const px = x + 0.5 - c
    const py = y + 0.5 - c
    const d = Math.hypot(px, py)
    // gullring med myk kant
    const ringD = Math.abs(d - R)
    if (ringD < ring) return mix(NAVY, GOLD, Math.min(1, (ring - ringD) / (size * 0.006)))
    // tynt kryss
    if (d < R - ring && (Math.abs(px) < size * 0.008 || Math.abs(py) < size * 0.008)) return mix(NAVY, GOLD, 0.45)
    // pil (papirfly) fra sørvest mot nordøst
    const u = (px + py) / Math.SQRT2 // langs pilen
    const v = (py - px) / Math.SQRT2 // på tvers
    const L = R * 0.78
    if (u > -L * 0.55 && u < L * 0.45) {
      const halfW = ((L * 0.45 - u) / L) * size * 0.07
      if (Math.abs(v) < halfW && Math.abs(v) > size * 0.004) return CREAM
    }
    if (d < dot) return GOLD
    return NAVY
  }
}

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(root, name), png(size, draw(size)))
  console.log('skrev', name)
}
