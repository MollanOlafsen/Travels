import Dexie, { type EntityTable } from 'dexie'
import type { OutboxItem, Segment, Settings, StoredImage } from '../types'
import { RULE_DEFS } from './rules'

interface KV {
  key: string
  value: unknown
}

class TraveldaysDB extends Dexie {
  segments!: EntityTable<Segment, 'id'>
  photos!: EntityTable<StoredImage, 'id'>
  kv!: EntityTable<KV, 'key'>
  outbox!: EntityTable<OutboxItem, 'seq'>

  constructor() {
    super('traveldays')
    this.version(1).stores({
      segments: 'id, date, imageId',
      images: '++id, createdAt',
      kv: 'key',
    })
    // v2: bilder får uuid (synkroniserbare), segmenter får updatedAt, utboks for offline-endringer.
    this.version(2)
      .stores({
        segments: 'id, date, imageId, updatedAt',
        images: null,
        photos: 'id, createdAt',
        kv: 'key',
        outbox: '++seq',
      })
      .upgrade(async (tx) => {
        const old = (await tx.table('images').toArray()) as Array<{ id: number; blob: Blob; name: string; width: number; height: number; createdAt: number; rawBarcode?: string; ocrText?: string }>
        const map = new Map<number, string>()
        for (const img of old) {
          const id = uid()
          map.set(img.id, id)
          await tx.table('photos').add({
            id,
            blob: img.blob,
            name: img.name,
            mime: img.blob?.type || 'image/jpeg',
            width: img.width,
            height: img.height,
            createdAt: img.createdAt,
            updatedAt: img.createdAt,
            rawBarcode: img.rawBarcode,
            ocrText: img.ocrText,
          })
        }
        await tx
          .table('segments')
          .toCollection()
          .modify((s: Segment & { imageId?: string | number }) => {
            if (typeof s.imageId === 'number') s.imageId = map.get(s.imageId)
            if (!s.updatedAt) s.updatedAt = s.createdAt || Date.now()
          })
      })
  }
}

export const db = new TraveldaysDB()

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  postedPartnerName: '',
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
  if (!s.serviceStart) s.serviceStart = s.postingStart
  return s
}

export async function loadSettings(): Promise<Settings> {
  const row = await db.kv.get('settings')
  return normalizeSettings(row?.value as Partial<Settings> | undefined)
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value })
}

export function uid(): string {
  const c = globalThis.crypto as Crypto
  if (typeof c.randomUUID === 'function') return c.randomUUID()
  // RFC 4122 v4 uten crypto.randomUUID
  const b = new Uint8Array(16)
  c.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/* ---------- Sikkerhetskopi ---------- */

export interface BackupImage {
  id?: number | string
  name: string
  mime?: string
  width: number
  height: number
  createdAt: number
  rawBarcode?: string | null
  ocrText?: string | null
  dataUrl: string
}

export interface Backup {
  app: 'traveldays'
  version: 1 | 2
  exportedAt: string
  settings: Settings
  segments: Array<Segment & { imageId?: string | number }>
  images: BackupImage[]
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

/** Lokal eksport (brukes når serveren ikke kan nås). Bilder uten lokal kopi hoppes over. */
export async function exportLocalBackup(): Promise<Backup> {
  const [settings, segments, photos] = await Promise.all([loadSettings(), db.segments.toArray(), db.photos.toArray()])
  const images: BackupImage[] = []
  for (const p of photos) {
    if (!p.blob) continue
    const { blob, updatedAt: _u, ...rest } = p
    void _u
    images.push({ ...rest, dataUrl: await blobToDataUrl(blob) })
  }
  return { app: 'traveldays', version: 2, exportedAt: new Date().toISOString(), settings, segments, images }
}

export async function wipeLocal(): Promise<void> {
  await db.transaction('rw', db.segments, db.photos, db.kv, db.outbox, async () => {
    await db.segments.clear()
    await db.photos.clear()
    await db.kv.clear()
    await db.outbox.clear()
  })
}
