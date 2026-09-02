import Dexie, { type EntityTable } from 'dexie'
import type { Segment, Settings, StoredImage } from '../types'
import { RULE_DEFS } from './rules'

interface KV {
  key: string
  value: unknown
}

class TraveldaysDB extends Dexie {
  segments!: EntityTable<Segment, 'id'>
  images!: EntityTable<StoredImage, 'id'>
  kv!: EntityTable<KV, 'key'>

  constructor() {
    super('traveldays')
    this.version(1).stores({
      segments: 'id, date, imageId',
      images: '++id, createdAt',
      kv: 'key',
    })
  }
}

export const db = new TraveldaysDB()

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  postedPartnerName: '',
  postCountry: 'FR',
  postCity: 'Paris',
  homeCountry: 'NO',
  postingStart: '2026-08-05',
  initialCountry: 'FR',
  travelDayCountsBoth: true,
  rules: RULE_DEFS.map((r) => ({ id: r.id, enabled: r.defaultEnabled, params: { ...r.defaultParams } })),
  customAirports: {},
}

/** Slår sammen lagrede innstillinger med standardverdier (nye regler får standardoppsett). */
export function normalizeSettings(raw: Partial<Settings> | undefined): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) }
  const stored = new Map((raw?.rules ?? []).map((r) => [r.id, r]))
  s.rules = RULE_DEFS.map((def) => {
    const st = stored.get(def.id)
    return {
      id: def.id,
      enabled: st?.enabled ?? def.defaultEnabled,
      params: { ...def.defaultParams, ...(st?.params ?? {}) },
    }
  })
  s.customAirports = raw?.customAirports ?? {}
  return s
}

export async function loadSettings(): Promise<Settings> {
  const row = await db.kv.get('settings')
  return normalizeSettings(row?.value as Partial<Settings> | undefined)
}

export async function saveSettings(s: Settings): Promise<void> {
  await db.kv.put({ key: 'settings', value: s })
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/* ---------- Sikkerhetskopi ---------- */

export interface Backup {
  app: 'traveldays'
  version: 1
  exportedAt: string
  settings: Settings
  segments: Segment[]
  images: Array<Omit<StoredImage, 'blob'> & { dataUrl: string }>
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

export async function exportBackup(): Promise<Backup> {
  const [settings, segments, images] = await Promise.all([loadSettings(), db.segments.toArray(), db.images.toArray()])
  const imgs = await Promise.all(
    images.map(async ({ blob, ...rest }) => ({ ...rest, dataUrl: await blobToDataUrl(blob) })),
  )
  return { app: 'traveldays', version: 1, exportedAt: new Date().toISOString(), settings, segments, images: imgs }
}

/** Importerer en sikkerhetskopi. `replace` sletter alt først; ellers legges data til (dubletter på id hoppes over). */
export async function importBackup(b: Backup, replace: boolean): Promise<{ segments: number; images: number }> {
  if (b.app !== 'traveldays') throw new Error('Filen er ikke en Traveldays-sikkerhetskopi')
  const idMap = new Map<number, number>()
  await db.transaction('rw', db.segments, db.images, db.kv, async () => {
    if (replace) {
      await db.segments.clear()
      await db.images.clear()
    }
    for (const img of b.images) {
      const blob = await dataUrlToBlob(img.dataUrl)
      const { dataUrl: _d, id: oldId, ...rest } = img
      void _d
      const newId = (await db.images.add({ ...rest, blob })) as number
      if (oldId != null) idMap.set(oldId, newId)
    }
    for (const seg of b.segments) {
      if (!replace && (await db.segments.get(seg.id))) continue
      const imageId = seg.imageId != null ? idMap.get(seg.imageId) : undefined
      await db.segments.put({ ...seg, imageId })
    }
    await db.kv.put({ key: 'settings', value: normalizeSettings(b.settings) })
  })
  return { segments: b.segments.length, images: b.images.length }
}

export async function wipeAll(): Promise<void> {
  await db.transaction('rw', db.segments, db.images, db.kv, async () => {
    await db.segments.clear()
    await db.images.clear()
    await db.kv.clear()
  })
}
