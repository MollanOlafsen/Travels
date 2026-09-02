import { useRef, useState } from 'react'
import type { Settings } from '../types'
import { exportBackup, importBackup, wipeAll, type Backup } from '../lib/db'
import { COUNTRY_CODES, countryName } from '../lib/airports'
import { deliverFile } from '../lib/report'
import { useToast } from './Toast'

export function SettingsPage({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(settings)
  const [apCode, setApCode] = useState('')
  const [apCountry, setApCountry] = useState('FR')
  const [apCity, setApCity] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

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

  async function doImport(file: File, replace: boolean) {
    try {
      const b = JSON.parse(await file.text()) as Backup
      const r = await importBackup(b, replace)
      const s = b.settings ? { ...settings, ...b.settings } : settings
      setDraft(s)
      await onChange(s)
      toast(`Importerte ${r.segments} reiser og ${r.images} bilder.`)
    } catch (e) {
      console.error(e)
      toast('Kunne ikke lese sikkerhetskopien.')
    }
  }

  async function backup() {
    const b = await exportBackup()
    await deliverFile(new Blob([JSON.stringify(b)], { type: 'application/json' }), `traveldays-sikkerhetskopi-${new Date().toISOString().slice(0, 10)}.json`, 'Traveldays sikkerhetskopi')
  }

  async function wipe() {
    if (!confirm('Slette ALLE reiser, bilder og innstillinger i denne nettleseren? Dette kan ikke angres. Ta sikkerhetskopi først.')) return
    await wipeAll()
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

      <div className="card">
        <div className="eyebrow">Flyplasser</div>
        <p className="small muted">Appen kjenner norske, franske og de vanligste europeiske lufthavnene. Legg til andre koder her.</p>
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
          Alt lagres kun i denne nettleseren (IndexedDB) – ingenting sendes til noen server. Bruker du appen både på mobil og PC, flytt data med sikkerhetskopi.
        </p>
        <div className="row">
          <button className="btn" onClick={backup}>
            Last ned sikkerhetskopi
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Gjenopprett fra fil …
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              const replace = confirm('Erstatte alle eksisterende data med sikkerhetskopien? (Avbryt = legg til uten å slette.)')
              doImport(f, replace)
            }}
          />
        </div>
        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '14px 0' }} />
        <button className="btn danger" onClick={wipe}>
          Slett alle data
        </button>
      </div>

      <p className="small muted" style={{ textAlign: 'center' }}>
        Traveldays · versjon {__APP_VERSION__} · kode på{' '}
        <a href="https://github.com/MollanOlafsen/Travels" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </p>
    </div>
  )
}
