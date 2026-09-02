import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { Settings } from '../types'
import { db, dataUrlToBlob, normalizeSettings, uid, wipeLocal, type Backup } from '../lib/db'
import { api, errorText, logout } from '../lib/api'
import { flush, getSyncState, setSyncState, store, useSync } from '../lib/sync'
import { COUNTRY_CODES, countryName } from '../lib/airports'
import { useToast } from './Toast'

export function SettingsPage({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const toast = useToast()
  const sync = useSync()
  const fileRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(settings)
  const [apCode, setApCode] = useState('')
  const [apCountry, setApCountry] = useState('FR')
  const [apCity, setApCity] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

  useEffect(() => setDraft(settings), [settings])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }))

  async function save() {
    await onChange(draft)
    toast('Innstillingene er lagret.')
  }

  function addAirport() {
    const code = apCode.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(code)) {
      toast('IATA-koden må være tre bokstaver.')
      return
    }
    const next = { ...draft, customAirports: { ...draft.customAirports, [code]: { country: apCountry, city: apCity.trim() || code } } }
    setDraft(next)
    onChange(next)
    setApCode('')
    setApCity('')
  }

  function removeAirport(code: string) {
    const { [code]: _x, ...rest } = draft.customAirports
    void _x
    const next = { ...draft, customAirports: rest }
    setDraft(next)
    onChange(next)
  }

  async function doImport(file: File) {
    try {
      const b = JSON.parse(await file.text()) as Backup
      if (b.app !== 'traveldays') throw new Error('Ikke en Traveldays-fil')
      const idMap = new Map<string | number, string>()
      let nImg = 0
      for (const img of b.images ?? []) {
        const id = uid()
        idMap.set(img.id ?? id, id)
        const blob = await dataUrlToBlob(img.dataUrl)
        await store.addImage({
          id,
          blob,
          name: img.name,
          mime: img.mime ?? blob.type ?? 'image/jpeg',
          width: img.width,
          height: img.height,
          createdAt: img.createdAt,
          updatedAt: Date.now(),
          rawBarcode: img.rawBarcode ?? undefined,
          ocrText: img.ocrText ?? undefined,
        })
        nImg++
      }
      let nSeg = 0
      for (const seg of b.segments ?? []) {
        if (await db.segments.get(seg.id)) continue
        const imageId = seg.imageId != null ? idMap.get(seg.imageId) : undefined
        await store.putSegment({ ...seg, imageId, updatedAt: Date.now() })
        nSeg++
      }
      if (b.settings) await onChange(normalizeSettings(b.settings))
      toast(`Importerte ${nSeg} reiser og ${nImg} bilder.`)
    } catch (e) {
      console.error(e)
      toast('Kunne ikke lese sikkerhetskopien.')
    }
  }

  async function doLogout() {
    await flush()
    if (getSyncState().pending > 0 && !confirm('Noen endringer er ikke sendt til serveren ennå. Logge ut likevel? De går tapt.')) return
    try {
      await logout()
    } catch {
      /* fortsett uansett */
    }
    await wipeLocal()
    setSyncState({ auth: 'out', email: null })
    location.reload()
  }

  async function clearLocal() {
    await flush()
    if (getSyncState().pending > 0 && !confirm('Noen endringer er ikke sendt til serveren ennå. Tømme likevel?')) return
    const account = sync.email
    await wipeLocal()
    if (account) await db.kv.put({ key: 'account', value: account })
    location.reload()
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="eyebrow">Profil</div>
        <h2>Innstillinger</h2>
        <div className="form-grid">
          <label className="field">
            Ditt navn (i rapporten)
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Roger …" />
          </label>
          <label className="field">
            Den utsendtes navn
            <input value={draft.postedPartnerName} onChange={(e) => set('postedPartnerName', e.target.value)} placeholder="Pål …" />
          </label>
          <label className="field">
            Utenriksstasjon
            <input value={draft.station} onChange={(e) => set('station', e.target.value)} placeholder="Norges ambassade i Paris" />
          </label>
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          Fast adresse på tjenestestedet (vises i rapporten)
          <input value={draft.address} onChange={(e) => set('address', e.target.value)} placeholder="Gate og nummer, postnummer by, land" autoComplete="street-address" />
        </label>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="field">
            Pendlerbolig i Norge (for Skatteetaten)
            <input value={draft.commuterAddress} onChange={(e) => set('commuterAddress', e.target.value)} placeholder="Gate og nummer, postnummer by" />
          </label>
          <label className="field">
            Arbeidsgiver og arbeidssted i Norge
            <input value={draft.employer} onChange={(e) => set('employer', e.target.value)} placeholder="Firma AS, sted" />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">Utsendelsen</div>
        <div className="form-grid">
          <label className="field">
            Tjenestested (by)
            <input value={draft.postCity} onChange={(e) => set('postCity', e.target.value)} />
          </label>
          <label className="field">
            Tjenesteland
            <select value={draft.postCountry} onChange={(e) => set('postCountry', e.target.value)}>
              {COUNTRY_CODES.map((c) => (
                <option key={c} value={c}>
                  {countryName(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Hjemland (skatt/pendling)
            <select value={draft.homeCountry} onChange={(e) => set('homeCountry', e.target.value)}>
              {COUNTRY_CODES.map((c) => (
                <option key={c} value={c}>
                  {countryName(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Flyttet inn på tjenestestedet (dagsloggen starter her)
            <input type="date" value={draft.postingStart} onChange={(e) => set('postingStart', e.target.value)} />
          </label>
          <label className="field">
            Den utsendtes første arbeidsdag (UD-tellingen starter her)
            <input type="date" value={draft.serviceStart} onChange={(e) => set('serviceStart', e.target.value)} />
          </label>
          <label className="field">
            Utsendelsen slutter (valgfritt)
            <input type="date" value={draft.postingEnd ?? ''} onChange={(e) => set('postingEnd', e.target.value || undefined)} />
          </label>
          <label className="field">
            Hvor var du på startdatoen?
            <select value={draft.initialCountry} onChange={(e) => set('initialCountry', e.target.value)}>
              {COUNTRY_CODES.map((c) => (
                <option key={c} value={c}>
                  {countryName(c)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={draft.travelDayCountsBoth} onChange={(e) => set('travelDayCountsBoth', e.target.checked)} />
          <span>
            Reisedag teller som opphold i både avreise- og ankomstland
            <br />
            <span className="small muted">Skatteetaten teller hele og deler av døgn i Norge. Slå av for å telle reisedagen bare i ankomstlandet.</span>
          </span>
        </label>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn primary" onClick={save} disabled={!dirty}>
            Lagre innstillinger
          </button>
        </div>
      </div>

      <SecurityCard />

      <div className="card">
        <div className="eyebrow">Flyplasser</div>
        <p className="small muted">Appen kjenner 380 lufthavner. Legg til andre koder her.</p>
        {Object.keys(draft.customAirports).length > 0 && (
          <table className="plain" style={{ marginBottom: 10 }}>
            <tbody>
              {Object.entries(draft.customAirports).map(([code, ap]) => (
                <tr key={code}>
                  <td>
                    <strong>{code}</strong>
                  </td>
                  <td>{ap.city}</td>
                  <td>{countryName(ap.country)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn small ghost" onClick={() => removeAirport(code)}>
                      Fjern
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="form-grid">
          <label className="field">
            IATA-kode
            <input value={apCode} maxLength={3} onChange={(e) => setApCode(e.target.value.toUpperCase())} placeholder="LYS" />
          </label>
          <label className="field">
            By
            <input value={apCity} onChange={(e) => setApCity(e.target.value)} />
          </label>
          <label className="field">
            Land
            <select value={apCountry} onChange={(e) => setApCountry(e.target.value)}>
              {COUNTRY_CODES.map((c) => (
                <option key={c} value={c}>
                  {countryName(c)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={addAirport}>
          Legg til flyplass
        </button>
      </div>

      <div className="card">
        <div className="eyebrow">Data</div>
        <p className="small muted">
          Kilden er databasen på serveren din. Denne enheten har en lokal kopi for offline-bruk som synkroniseres automatisk.
          {sync.pending > 0 ? ` ${sync.pending} endring${sync.pending === 1 ? '' : 'er'} venter på sending.` : ' Alt er synkronisert.'}
        </p>
        <div className="row">
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Gjenopprett fra sikkerhetskopi …
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f && confirm('Legge til reisene fra sikkerhetskopien? Eksisterende reiser beholdes.')) doImport(f)
            }}
          />
          <button className="btn" onClick={clearLocal}>
            Tøm lokal kopi og hent på nytt
          </button>
        </div>
      </div>

      <p className="small muted" style={{ textAlign: 'center' }}>
        Traveldays · versjon {__APP_VERSION__} · kode på{' '}
        <a href="https://github.com/MollanOlafsen/Travels" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </p>
      <div style={{ textAlign: 'center' }}>
        <button className="btn ghost small" onClick={doLogout}>
          Logg ut på denne enheten
        </button>
      </div>
    </div>
  )
}

function SecurityCard() {
  const toast = useToast()
  const sync = useSync()
  const [cur, setCur] = useState('')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [totp, setTotp] = useState<{ secret: string; otpauth: string; qr: string } | null>(null)
  const [code, setCode] = useState('')
  const [disablePw, setDisablePw] = useState('')
  const [busy, setBusy] = useState(false)
  const [audit, setAudit] = useState<Array<{ ts: number; event: string; ua: string; detail: string | null }> | null>(null)

  async function changePassword() {
    if (pw1 !== pw2) return toast('Passordene er ikke like.')
    if (pw1.length < 12) return toast('Minst 12 tegn.')
    setBusy(true)
    try {
      await api('security.php', { body: { op: 'password', current: cur, new: pw1 } })
      setCur('')
      setPw1('')
      setPw2('')
      toast('Passordet er byttet. Andre enheter er logget ut.')
    } catch (e) {
      toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function beginTotp() {
    setBusy(true)
    try {
      const r = await api<{ secret: string; otpauth: string }>('security.php', { body: { op: 'totp_begin' } })
      const qr = await QRCode.toDataURL(r.otpauth, { width: 220, margin: 1, color: { dark: '#0f1b2d', light: '#ffffff' } })
      setTotp({ ...r, qr })
    } catch (e) {
      toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function enableTotp() {
    setBusy(true)
    try {
      await api('security.php', { body: { op: 'totp_enable', code } })
      setTotp(null)
      setCode('')
      setSyncState({ totpEnabled: true })
      toast('Tofaktor er aktivert.')
    } catch (e) {
      toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function disableTotp() {
    setBusy(true)
    try {
      await api('security.php', { body: { op: 'totp_disable', password: disablePw, code } })
      setDisablePw('')
      setCode('')
      setSyncState({ totpEnabled: false })
      toast('Tofaktor er slått av.')
    } catch (e) {
      toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function revokeOthers() {
    try {
      await api('security.php', { body: { op: 'sessions_revoke_others' } })
      toast('Alle andre enheter er logget ut.')
    } catch (e) {
      toast(errorText(e))
    }
  }

  async function loadAudit() {
    try {
      const r = await api<{ events: Array<{ ts: number; event: string; ua: string; detail: string | null }> }>('security.php', { body: { op: 'audit' } })
      setAudit(r.events)
    } catch (e) {
      toast(errorText(e))
    }
  }

  const EVENT: Record<string, string> = {
    login_ok: 'Innlogging',
    login_fail: 'Mislykket innlogging',
    login_fail_totp: 'Feil engangskode',
    login_throttled: 'Innlogging sperret (for mange forsøk)',
    logout: 'Utlogging',
    password_changed: 'Passord byttet',
    totp_enabled: 'Tofaktor aktivert',
    totp_disabled: 'Tofaktor slått av',
    sessions_revoked: 'Andre enheter logget ut',
    backup_downloaded: 'Sikkerhetskopi lastet ned',
  }

  return (
    <div className="card stack">
      <div>
        <div className="eyebrow">Sikkerhet</div>
        <h3>
          Innlogget som {sync.email ?? '–'}{' '}
          <span className={`badge ${sync.totpEnabled ? 'ok' : 'warn'}`}>{sync.totpEnabled ? 'Tofaktor på' : 'Tofaktor av'}</span>
        </h3>
      </div>

      {!sync.totpEnabled && !totp && (
        <div>
          <p className="small muted" style={{ marginTop: 0 }}>
            Anbefalt: aktiver tofaktor med en autentiseringsapp (1Password, Apple Passord, Google Authenticator). Da trengs både passord og engangskode for å logge inn.
          </p>
          <button className="btn primary" onClick={beginTotp} disabled={busy || !sync.online}>
            Aktiver tofaktor
          </button>
        </div>
      )}
      {totp && (
        <div className="stack">
          <p className="small" style={{ margin: 0 }}>Skann QR-koden i autentiseringsappen, eller skriv inn nøkkelen manuelt. Bekreft med koden appen viser.</p>
          <img src={totp.qr} alt="QR-kode for tofaktor" style={{ width: 220, height: 220, borderRadius: 10, border: '1px solid var(--border)' }} />
          <code className="small" style={{ wordBreak: 'break-all' }}>{totp.secret}</code>
          <div className="row">
            <input className="field" style={{ padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 10, width: 140 }} inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn primary" onClick={enableTotp} disabled={busy || code.length !== 6}>
              Bekreft og aktiver
            </button>
            <button className="btn ghost" onClick={() => { setTotp(null); setCode('') }}>
              Avbryt
            </button>
          </div>
        </div>
      )}
      {sync.totpEnabled && (
        <details>
          <summary className="small">Slå av tofaktor</summary>
          <div className="row" style={{ marginTop: 8 }}>
            <input type="password" placeholder="Passord" autoComplete="current-password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} style={{ padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 10 }} />
            <input inputMode="numeric" maxLength={6} placeholder="Kode" value={code} onChange={(e) => setCode(e.target.value)} style={{ padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 10, width: 110 }} />
            <button className="btn danger" onClick={disableTotp} disabled={busy}>
              Slå av
            </button>
          </div>
        </details>
      )}

      <details>
        <summary className="small">Bytt passord</summary>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <label className="field">
            Nåværende passord
            <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </label>
          <label className="field">
            Nytt passord (minst 12 tegn)
            <input type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
          </label>
          <label className="field">
            Gjenta nytt passord
            <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </label>
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={changePassword} disabled={busy || !cur || !pw1}>
          Bytt passord
        </button>
      </details>

      <details onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !audit) loadAudit() }}>
        <summary className="small">Innloggingslogg og enheter</summary>
        <div style={{ marginTop: 8 }}>
          <button className="btn small" onClick={revokeOthers}>
            Logg ut alle andre enheter
          </button>
          {audit && (
            <table className="plain" style={{ marginTop: 10 }}>
              <tbody>
                {audit.map((a, i) => (
                  <tr key={i}>
                    <td className="small">{new Date(a.ts).toLocaleString('nb-NO')}</td>
                    <td className="small">{EVENT[a.event] ?? a.event}</td>
                    <td className="small muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.ua}>{a.ua.replace(/^Mozilla\/5\.0 /, '').slice(0, 60)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </div>
  )
}
