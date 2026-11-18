import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import type { Visit } from '../types'
import { DEPTS, MAP_H, MAP_W, REGIONS } from '../data/franceMap'
import { REGION_INFO, project, visitPoint, type FranceStats } from '../lib/france'

type Box = [number, number, number, number] // x, y, w, h

const FULL: Box = [0, 0, MAP_W, MAP_H]
const UNVISITED = '#ece5d6'

/** Blander en hex-farge med hvitt (t = 0 → hvit, 1 → fargen). */
export function tint(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(255 + (c - 255) * t)
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}

function fitBox(b: [number, number, number, number]): Box {
  const [x0, y0, x1, y1] = b
  const aspect = MAP_W / MAP_H
  let w = Math.max(x1 - x0, 90) * 1.18
  let h = Math.max(y1 - y0, 90) * 1.18
  if (w / h > aspect) h = w / aspect
  else w = h * aspect
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  return [cx - w / 2, cy - h / 2, w, h]
}

function useAnimatedBox(target: Box): Box {
  const [box, setBox] = useState<Box>(target)
  const cur = useRef(box)
  cur.current = box
  useEffect(() => {
    const from = cur.current
    if (from.every((v, i) => Math.abs(v - target[i]) < 0.01)) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setBox(target)
      return
    }
    const t0 = performance.now()
    const dur = 520
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      setBox(from.map((v, i) => v + (target[i] - v) * e) as Box)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.join(',')])
  return box
}

interface Props {
  stats: FranceStats
  visits: Visit[]
  focusRegion?: string
  selectedDept?: string
  here?: { lat: number; lon: number }
  onRegion: (code: string | undefined) => void
  onDept: (code: string) => void
}

export const FranceMap = forwardRef<SVGSVGElement, Props>(function FranceMap({ stats, visits, focusRegion, selectedDept, here, onRegion, onDept }, ref) {
  const target = useMemo<Box>(() => {
    const r = REGIONS.find((x) => x.code === focusRegion)
    return r ? fitBox(r.bbox) : FULL
  }, [focusRegion])
  const box = useAnimatedBox(target)
  const k = box[2] / MAP_W // < 1 når vi har zoomet inn
  const zoomed = Boolean(focusRegion)

  const visitedRegion = useMemo(() => new Map(stats.regions.map((r) => [r.code, r.visited])), [stats])

  const pins = useMemo(() => {
    const seen = new Set<string>()
    const out: { x: number; y: number; color: string; key: string }[] = []
    for (const v of visits) {
      const p = visitPoint(v)
      if (!p) continue
      const key = `${Math.round(p[0] / 3)}:${Math.round(p[1] / 3)}`
      if (seen.has(key)) continue
      seen.add(key)
      const reg = DEPTS.find((d) => d.code === v.dept)?.region
      out.push({ x: p[0], y: p[1], color: REGION_INFO[reg ?? '11']?.color ?? '#0f1b2d', key })
    }
    return out
  }, [visits])

  const herePt = here ? project(here.lat, here.lon) : undefined

  return (
    <svg
      ref={ref}
      className="fr-map"
      viewBox={box.join(' ')}
      data-full={`0 0 ${MAP_W} ${MAP_H}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Kart over Frankrike med besøkte regioner"
      onClick={(e) => {
        if (e.target === e.currentTarget) onRegion(undefined)
      }}
    >
      <defs>
        <pattern id="fr-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill={UNVISITED} />
          <line x1="0" y1="0" x2="0" y2="7" stroke="#ddd3bf" strokeWidth="2.2" />
        </pattern>
        <filter id="fr-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f1b2d" floodOpacity="0.18" />
        </filter>
      </defs>
      <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} fill="transparent" onClick={() => onRegion(undefined)} />

      <g filter="url(#fr-shadow)">
        {DEPTS.map((d) => {
          const info = REGION_INFO[d.region]
          const regVisited = visitedRegion.get(d.region)
          const deptVisited = stats.deptsVisited.has(d.code)
          const dim = zoomed && d.region !== focusRegion
          const fill = deptVisited ? info.color : regVisited ? tint(info.color, 0.38) : 'url(#fr-hatch)'
          return (
            <path
              key={d.code}
              d={d.d}
              fill={fill}
              fillOpacity={dim ? 0.45 : 1}
              stroke="#fffdf8"
              strokeWidth={0.7}
              vectorEffect="non-scaling-stroke"
              className="fr-dept"
              onClick={(e) => {
                e.stopPropagation()
                if (!zoomed || d.region !== focusRegion) onRegion(d.region)
                else onDept(d.code)
              }}
            >
              <title>{`${d.name} (${d.code})`}</title>
            </path>
          )
        })}
      </g>

      {REGIONS.map((r) => (
        <path
          key={r.code}
          d={r.d}
          fill="none"
          stroke={r.code === focusRegion ? '#c9a961' : '#0f1b2d'}
          strokeOpacity={r.code === focusRegion ? 1 : 0.55}
          strokeWidth={r.code === focusRegion ? 3 : 1.3}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ))}

      {selectedDept &&
        (() => {
          const d = DEPTS.find((x) => x.code === selectedDept)
          return d ? <path d={d.d} fill="none" stroke="#0f1b2d" strokeWidth={3} vectorEffect="non-scaling-stroke" pointerEvents="none" className="fr-selected" /> : null
        })()}

      {/* Nåler for registrerte steder */}
      {pins.map((p) => (
        <g key={p.key} pointerEvents="none">
          <circle cx={p.x} cy={p.y} r={7.5 * k} fill="#fff" stroke={p.color} strokeWidth={3 * k} />
          <circle cx={p.x} cy={p.y} r={2.8 * k} fill={p.color} />
        </g>
      ))}

      {/* Etiketter */}
      {!zoomed &&
        REGIONS.map((r) => {
          const visited = visitedRegion.get(r.code)
          const [x, y] = r.label
          const s = r.code === '11' ? 0.95 : 1.3
          return (
            <g key={r.code} transform={`translate(${x} ${y}) scale(${s})`} pointerEvents="none">
              <circle r={17} fill={visited ? '#fffdf8' : '#f6f1e7'} stroke={visited ? REGION_INFO[r.code].color : '#b9ae98'} strokeWidth={2} strokeDasharray={visited ? undefined : '3 3'} />
              <text y={7} textAnchor="middle" fontSize={visited ? 19 : 17} fontFamily="Georgia, serif" fill="#8a8170">
                {visited ? REGION_INFO[r.code].emoji : '?'}
              </text>
            </g>
          )
        })}
      {zoomed &&
        DEPTS.filter((d) => d.region === focusRegion).map((d) => {
          const visited = stats.deptsVisited.has(d.code)
          return (
            <text
              key={d.code}
              x={d.label[0]}
              y={d.label[1] + 8 * k}
              textAnchor="middle"
              fontSize={24 * k}
              fontWeight={600}
              fontFamily="Inter, system-ui, sans-serif"
              fill={visited ? '#fff' : '#5b5446'}
              stroke={visited ? 'rgba(0,0,0,0.25)' : 'rgba(255,253,248,0.9)'}
              strokeWidth={4 * k}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {d.code}
            </text>
          )
        })}

      {herePt && (
        <g pointerEvents="none">
          <circle cx={herePt[0]} cy={herePt[1]} r={14 * k} fill="#3b82f6" opacity={0.25} className="fr-pulse" />
          <circle cx={herePt[0]} cy={herePt[1]} r={6 * k} fill="#3b82f6" stroke="#fff" strokeWidth={2.5 * k} />
        </g>
      )}
    </svg>
  )
})
