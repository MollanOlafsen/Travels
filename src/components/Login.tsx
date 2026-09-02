import { useState } from 'react'
import { API_BASE, errorText, login } from '../lib/api'
import { afterLogin } from '../lib/sync'

export function Login({ setupNeeded }: { setupNeeded: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [needCode, setNeedCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await login(email.trim(), password, needCode ? code : undefined)
      if (r.needCode) {
        setNeedCode(true)
        return
      }
      await afterLogin(r.email ?? email, Boolean(r.totpEnabled))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '8vh auto', padding: '0 16px' }}>
      <div className="card stack">
        <div>
          <div className="eyebrow">Traveldays</div>
          <h2 style={{ marginBottom: 4 }}>{setupNeeded ? 'Serveren er ikke satt opp' : 'Logg inn'}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {setupNeeded ? (
              <>
                Kjør engangsoppsettet først:{' '}
                <a href={`${API_BASE}setup.php`}>api/setup.php</a>
              </>
            ) : (
              'Dataene dine ligger i databasen på mollan-olafsen.fr og er bare tilgjengelige etter innlogging.'
            )}
          </p>
        </div>
        {!setupNeeded && (
          <form onSubmit={submit} className="stack">
            {!needCode ? (
              <>
                <label className="field">
                  E-post
                  <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                </label>
                <label className="field">
                  Passord
                  <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
              </>
            ) : (
              <label className="field">
                Engangskode fra autentiseringsappen
                <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
              </label>
            )}
            {error && <div className="notice warn">{error}</div>}
            <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>
              {busy ? 'Logger inn …' : needCode ? 'Bekreft kode' : 'Logg inn'}
            </button>
            {needCode && (
              <button type="button" className="btn ghost small" onClick={() => { setNeedCode(false); setCode('') }}>
                Tilbake
              </button>
            )}
          </form>
        )}
      </div>
    </main>
  )
}
