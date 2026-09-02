// Synkronisering mellom lokal IndexedDB og serveren.
// Skriv alltid via `store` – det lagrer lokalt, legger i utboksen og sender når nettet er der.
import { useEffect, useState } from 'react'
import type { Segment, Settings, StoredImage } from '../types'
import { db, kvGet, kvSet, loadSettings, normalizeSettings } from './db'
import { API_BASE, ApiError, api } from './api'

export type AuthState = 'loading' | 'setup' | 'out' | 'in'

export interface SyncState {
  auth: AuthState
  online: boolean
  syncing: boolean
  pending: number
  lastError: string | null
  lastSyncAt: number | null
  email: string | null
  totpEnabled: boolean
}

const state: SyncState = {
  auth: 'loading',
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncing: false,
  pending: 0,
  lastError: null,
  lastSyncAt: null,
  email: null,
  totpEnabled: false,
}

type Listener = () => void
const listeners = new Set<Listener>()
const settingsListeners = new Set<(s: Settings) => void>()

function emit() {
  for (const l of listeners) l()
}

export function setSyncState(patch: Partial<SyncState>) {
  Object.assign(state, patch)
  emit()
}

export function getSyncState(): SyncState {
  return state
}

export function useSync(): SyncState {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = () => tick((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return state
}

export function onSettingsChanged(fn: (s: Settings) => void): () => void {
  settingsListeners.add(fn)
  return () => {
    settingsListeners.delete(fn)
  }
}

async function refreshPending() {
  state.pending = await db.outbox.count()
  emit()
}

/* ---------- Skriveoperasjoner ---------- */

export const store = {
  async putSegment(seg: Segment): Promise<void> {
    seg.updatedAt = Date.now()
    await db.transaction('rw', db.segments, db.outbox, async () => {
      await db.segments.put(seg)
      await db.outbox.add({ kind: 'segment', id: seg.id, ts: Date.now() })
    })
    void flush()
  },

  async updateSegment(id: string, patch: Partial<Segment>): Promise<void> {
    await db.transaction('rw', db.segments, db.outbox, async () => {
      await db.segments.update(id, { ...patch, updatedAt: Date.now() })
      await db.outbox.add({ kind: 'segment', id, ts: Date.now() })
    })
    void flush()
  },

  async deleteSegment(id: string): Promise<void> {
    await db.transaction('rw', db.segments, db.photos, db.outbox, async () => {
      const seg = await db.segments.get(id)
      await db.segments.delete(id)
      await db.outbox.add({ kind: 'segmentDelete', id, ts: Date.now() })
      if (seg?.imageId) {
        const others = await db.segments.where('imageId').equals(seg.imageId).count()
        if (others === 0) {
          await db.photos.delete(seg.imageId)
          await db.outbox.add({ kind: 'imageDelete', id: seg.imageId, ts: Date.now() })
        }
      }
    })
    void flush()
  },

  async addImage(img: StoredImage): Promise<void> {
    img.updatedAt = Date.now()
    await db.transaction('rw', db.photos, db.outbox, async () => {
      await db.photos.put(img)
      await db.outbox.add({ kind: 'image', id: img.id, ts: Date.now() })
    })
    void flush()
  },

  async saveSettings(s: Settings): Promise<void> {
    const now = Date.now()
    await db.transaction('rw', db.kv, db.outbox, async () => {
      await kvSet('settings', s)
      await kvSet('settingsUpdatedAt', now)
      await db.outbox.add({ kind: 'settings', ts: now })
    })
    void flush()
  },
}

/* ---------- Bilder ---------- */

const blobPromises = new Map<string, Promise<Blob | undefined>>()

/** Henter bildet – lokalt hvis det finnes, ellers fra serveren (og lagrer lokalt). */
export function getImageBlob(id: string): Promise<Blob | undefined> {
  const existing = blobPromises.get(id)
  if (existing) return existing
  const p = (async () => {
    const local = await db.photos.get(id)
    if (local?.blob) return local.blob
    if (state.auth !== 'in' || !state.online) return undefined
    try {
      const res = await fetch(`${API_BASE}image.php?id=${encodeURIComponent(id)}`, { credentials: 'same-origin' })
      if (!res.ok) return undefined
      const blob = await res.blob()
      if (local) await db.photos.update(id, { blob })
      return blob
    } catch {
      return undefined
    } finally {
      blobPromises.delete(id)
    }
  })()
  blobPromises.set(id, p)
  return p
}

/* ---------- Sending (utboks) ---------- */

let flushing = false
let flushAgain = false

export async function flush(): Promise<void> {
  if (state.auth !== 'in' || !state.online) {
    await refreshPending()
    return
  }
  if (flushing) {
    flushAgain = true
    return
  }
  flushing = true
  setSyncState({ syncing: true })
  try {
    const items = await db.outbox.orderBy('seq').toArray()
    // Slå sammen dubletter (samme kind+id) – behold siste
    const seen = new Set<string>()
    const dedup = items.filter((it) => {
      const k = `${it.kind}:${it.id ?? ''}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    const extra = items.filter((it) => !dedup.includes(it)).map((it) => it.seq!)
    if (extra.length) await db.outbox.bulkDelete(extra)

    for (const it of dedup) {
      try {
        await send(it)
        await db.outbox.delete(it.seq!)
        state.lastError = null
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setSyncState({ auth: 'out', lastError: null })
          return
        }
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
          // Ugyldig element – ikke blokker køen
          console.error('Utboks: forkastet', it, e)
          await db.outbox.delete(it.seq!)
          state.lastError = `Kunne ikke lagre ett element (${e.code})`
          continue
        }
        state.lastError = e instanceof TypeError ? 'Ingen kontakt med serveren' : (e as Error).message
        break
      } finally {
        await refreshPending()
      }
    }
  } finally {
    flushing = false
    setSyncState({ syncing: false })
    if (flushAgain) {
      flushAgain = false
      void flush()
    }
  }
}

async function send(it: { kind: string; id?: string }): Promise<void> {
  switch (it.kind) {
    case 'segment': {
      const seg = await db.segments.get(it.id!)
      if (!seg) return
      await api('segments.php', { body: { op: 'put', segment: seg } })
      return
    }
    case 'segmentDelete':
      await api('segments.php', { body: { op: 'delete', id: it.id } })
      return
    case 'image': {
      const img = await db.photos.get(it.id!)
      if (!img?.blob) return
      const form = new FormData()
      form.set('id', img.id)
      form.set('meta', JSON.stringify({ name: img.name, width: img.width, height: img.height, createdAt: img.createdAt, updatedAt: img.updatedAt, rawBarcode: img.rawBarcode, ocrText: img.ocrText }))
      form.set('file', img.blob, img.name || 'boardingkort.jpg')
      await api('images.php', { form })
      return
    }
    case 'imageDelete':
      await api('images.php', { body: { op: 'delete', id: it.id } })
      return
    case 'settings': {
      const s = await loadSettings()
      const updatedAt = (await kvGet<number>('settingsUpdatedAt')) ?? Date.now()
      await api('settings.php', { body: { data: s, updatedAt } })
      return
    }
  }
}

/* ---------- Henting ---------- */

interface SyncPayload {
  now: number
  segments: Array<{ id: string; deleted: boolean; updatedAt: number; data: Segment | null }>
  images: Array<Omit<StoredImage, 'blob'> & { deleted: boolean }>
  settings: { data: Settings; updatedAt: number } | null
  serverSegmentCount: number
}

let pulling = false

export async function pull(): Promise<void> {
  if (state.auth !== 'in' || !state.online || pulling) return
  pulling = true
  setSyncState({ syncing: true })
  try {
    const since = (await kvGet<number>('lastSync')) ?? 0
    const p = await api<SyncPayload>('sync.php', { query: { since } })
    const pendingIds = new Set((await db.outbox.toArray()).map((o) => `${o.kind}:${o.id ?? ''}`))
    let settingsChanged: Settings | null = null

    await db.transaction('rw', db.segments, db.photos, db.kv, async () => {
      for (const r of p.segments) {
        if (pendingIds.has(`segment:${r.id}`) || pendingIds.has(`segmentDelete:${r.id}`)) continue
        if (r.deleted) {
          await db.segments.delete(r.id)
          continue
        }
        const local = await db.segments.get(r.id)
        if (!local || local.updatedAt < r.updatedAt) await db.segments.put({ ...r.data!, updatedAt: r.updatedAt })
      }
      for (const r of p.images) {
        if (pendingIds.has(`image:${r.id}`) || pendingIds.has(`imageDelete:${r.id}`)) continue
        if (r.deleted) {
          await db.photos.delete(r.id)
          continue
        }
        const local = await db.photos.get(r.id)
        const { deleted: _d, ...meta } = r
        void _d
        if (!local) await db.photos.put(meta)
        else await db.photos.update(r.id, meta)
      }
      if (p.settings && !pendingIds.has('settings:')) {
        const localAt = (await kvGet<number>('settingsUpdatedAt')) ?? 0
        if (p.settings.updatedAt > localAt) {
          settingsChanged = normalizeSettings(p.settings.data)
          await kvSet('settings', settingsChanged)
          await kvSet('settingsUpdatedAt', p.settings.updatedAt)
        }
      }
      await kvSet('lastSync', p.now)
    })

    // Første synk: last opp lokale data som serveren ikke har
    if (since === 0) {
      const remoteSegs = new Set(p.segments.map((r) => r.id))
      const remoteImgs = new Set(p.images.map((r) => r.id))
      const localSegs = await db.segments.toArray()
      const localImgs = await db.photos.toArray()
      const now = Date.now()
      await db.transaction('rw', db.outbox, db.kv, async () => {
        for (const s of localSegs) if (!remoteSegs.has(s.id)) await db.outbox.add({ kind: 'segment', id: s.id, ts: now })
        for (const i of localImgs) if (!remoteImgs.has(i.id) && i.blob) await db.outbox.add({ kind: 'image', id: i.id, ts: now })
        if (!p.settings) {
          const hasLocal = (await db.kv.get('settings')) !== undefined
          if (hasLocal) {
            await kvSet('settingsUpdatedAt', now)
            await db.outbox.add({ kind: 'settings', ts: now })
          }
        }
      })
    }

    state.lastSyncAt = Date.now()
    state.lastError = null
    if (settingsChanged) for (const l of settingsListeners) l(settingsChanged)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) setSyncState({ auth: 'out' })
    else state.lastError = e instanceof TypeError ? 'Ingen kontakt med serveren' : (e as Error).message
  } finally {
    pulling = false
    setSyncState({ syncing: false })
    await refreshPending()
    void flush()
  }
}

/* ---------- Livssyklus ---------- */

let started = false

export function startSync(): void {
  if (started) return
  started = true
  window.addEventListener('online', () => {
    setSyncState({ online: true })
    void pull()
  })
  window.addEventListener('offline', () => setSyncState({ online: false }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void pull()
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') void pull()
  }, 90_000)
  void refreshPending()
}

/** Etter innlogging: nullstill synkroniseringsmerket hvis serveren er en annen enn sist. */
export async function afterLogin(email: string, totpEnabled: boolean): Promise<void> {
  const prev = await kvGet<string>('account')
  if (prev && prev !== email) {
    await kvSet('lastSync', 0)
  }
  await kvSet('account', email)
  setSyncState({ auth: 'in', email, totpEnabled })
  await pull()
}
