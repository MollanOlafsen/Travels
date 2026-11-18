// Genererer src/data/franceMap.ts (SVG-stier for regioner og departementer i fastlands-Frankrike + Korsika)
// fra GeoJSON-filene i https://github.com/gregoiredavid/france-geojson (versjon «simplifiee», Etalab-lisens).
//
//   node scripts/build-france-map.mjs <regions.geojson> <departements.geojson>
//
// Projeksjon: ekvirektangulær med cos(46,5°) som x-skalering – enkel å regne baklengs for GPS-posisjon.
import { readFileSync, writeFileSync } from 'node:fs'

const [regionsFile, deptsFile] = process.argv.slice(2)
if (!regionsFile || !deptsFile) {
  console.error('Bruk: node scripts/build-france-map.mjs <regions.geojson> <departements.geojson>')
  process.exit(1)
}

const regions = JSON.parse(readFileSync(regionsFile, 'utf8')).features
const depts = JSON.parse(readFileSync(deptsFile, 'utf8')).features

const K = Math.cos((46.5 * Math.PI) / 180)
const WIDTH = 1000
const PAD = 12

// Utstrekning
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
const eachCoord = (geom, fn) => {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  for (const poly of polys) for (const ring of poly) for (const c of ring) fn(c)
}
for (const f of depts) eachCoord(f.geometry, ([lon, lat]) => {
  const x = lon * K, y = -lat
  minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
})
const S = (WIDTH - 2 * PAD) / (maxX - minX)
const HEIGHT = Math.ceil((maxY - minY) * S + 2 * PAD)
const proj = ([lon, lat]) => [(lon * K - minX) * S + PAD, (-lat - minY) * S + PAD]
const r1 = (n) => Math.round(n * 10) / 10

// Douglas–Peucker i skjermkoordinater (svært lav toleranse – bare for å kutte overflødige punkter)
function simplify(pts, tol) {
  if (pts.length < 5) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = pts[a], [bx, by] = pts[b]
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy || 1
    let best = -1, bestD = 0
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
      const ex = ax + t * dx - px, ey = ay + t * dy - py
      const d = ex * ex + ey * ey
      if (d > bestD) { bestD = d; best = i }
    }
    if (best > 0 && bestD > tol * tol) {
      keep[best] = 1
      stack.push([a, best], [best, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

function ringsOf(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  const rings = []
  for (const poly of polys) for (const ring of poly) {
    let pts = ring.map(proj).map(([x, y]) => [r1(x), r1(y)])
    pts = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1])
    pts = simplify(pts, 0.7)
    if (pts.length >= 4) rings.push(pts)
  }
  return rings
}

const area = (ring) => {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  return a / 2
}

function centroid(ring) {
  let a = 0, cx = 0, cy = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
    a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f
  }
  a /= 2
  return [cx / (6 * a), cy / (6 * a)]
}

function inRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Etikettpunkt: tyngdepunktet til største ring, eller – hvis det havner utenfor – beste punkt i et rutenett. */
function labelPoint(rings) {
  const big = rings.reduce((m, r) => (Math.abs(area(r)) > Math.abs(area(m)) ? r : m))
  let [cx, cy] = centroid(big)
  if (inRing(cx, cy, big)) return [r1(cx), r1(cy)]
  const xs = big.map((p) => p[0]), ys = big.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  let best = null, bestD = -1
  for (let gx = 0; gx <= 30; gx++) for (let gy = 0; gy <= 30; gy++) {
    const x = x0 + ((x1 - x0) * gx) / 30, y = y0 + ((y1 - y0) * gy) / 30
    if (!inRing(x, y, big)) continue
    const d = -Math.hypot(x - cx, y - cy)
    if (best === null || d > bestD) { best = [x, y]; bestD = d }
  }
  return best ? [r1(best[0]), r1(best[1])] : [r1(cx), r1(cy)]
}

const toPath = (rings) => rings.map((r) => 'M' + r.map(([x, y]) => `${x} ${y}`).join('L') + 'Z').join('')

const bbox = (rings) => {
  const xs = rings.flat().map((p) => p[0]), ys = rings.flat().map((p) => p[1])
  return [r1(Math.min(...xs)), r1(Math.min(...ys)), r1(Math.max(...xs)), r1(Math.max(...ys))]
}

const regionData = regions.map((f) => {
  const rings = ringsOf(f.geometry)
  return { code: f.properties.code, name: f.properties.nom, rings }
})

const deptData = depts.map((f) => {
  const rings = ringsOf(f.geometry)
  const [lx, ly] = labelPoint(rings)
  // Hvilken region? Den som inneholder etikettpunktet.
  const reg = regionData.find((r) => r.rings.some((ring) => inRing(lx, ly, ring)))
  if (!reg) throw new Error(`Fant ingen region for ${f.properties.code}`)
  return { code: f.properties.code, name: f.properties.nom, region: reg.code, d: toPath(rings), label: [lx, ly], bbox: bbox(rings) }
})

const regionOut = regionData.map((r) => ({
  code: r.code,
  name: r.name,
  d: toPath(r.rings),
  label: labelPoint(r.rings),
  bbox: bbox(r.rings),
  depts: deptData.filter((d) => d.region === r.code).map((d) => d.code),
}))

for (const r of regionOut) console.log(r.code, r.name.padEnd(28), r.depts.length, 'dep.')

const header = `// GENERERT av scripts/build-france-map.mjs – ikke rediger for hånd.
// Kilde: github.com/gregoiredavid/france-geojson (regions/departements, version simplifiée), Licence Ouverte / Etalab.
// Koordinater i SVG-rommet 0 0 ${WIDTH} ${HEIGHT}.

export interface MapRegion {
  code: string
  name: string
  d: string
  label: [number, number]
  bbox: [number, number, number, number]
  depts: string[]
}

export interface MapDept {
  code: string
  name: string
  region: string
  d: string
  label: [number, number]
  bbox: [number, number, number, number]
}

export const MAP_W = ${WIDTH}
export const MAP_H = ${HEIGHT}

/** Projeksjon lengde/bredde → kartkoordinater (samme som stiene er laget med). */
export const PROJ = { k: ${K}, minX: ${minX}, minY: ${minY}, s: ${S}, pad: ${PAD} }
`

writeFileSync(
  new URL('../src/data/franceMap.ts', import.meta.url),
  header +
    `\nexport const REGIONS: MapRegion[] = ${JSON.stringify(regionOut)}\n` +
    `\nexport const DEPTS: MapDept[] = ${JSON.stringify(deptData)}\n`,
)
console.log(`Skrev src/data/franceMap.ts (${WIDTH}×${HEIGHT})`)
