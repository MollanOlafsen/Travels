import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Settings } from './types'
import { db, kvGet, kvSet, loadSettings } from './lib/db'
import { getStatus } from './lib/api'
import { flush, onSettingsChanged, pull, setSyncState, startSync, store, useSync } from './lib/sync'
import { Dashboard } from './components/Dashboard'
import { CalendarView } from './components/CalendarView'
import { TripList } from './components/TripList'
import { AddTrip } from './components/AddTrip'
import { ReportPage } from './components/ReportPage'
import { RulesPage } from './components/RulesPage'
import { SettingsPage } from './components/SettingsPage'
import { Login } from './components/Login'
import { Icon, type IconName } from './components/Icon'
import { ToastContext, useToastState } from './components/Toast'

type Tab = 'home' | 'calendar' | 'trips' | 'add' | 'report' | 'rules' | 'settings'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Oversikt', icon: 'home' },
  { id: 'calendar', label: 'Kalender', icon: 'calendar' },
  { id: 'add', label: 'Legg til', icon: 'plus' },
  { id: 'trips', label: 'Reiser', icon: 'plane' },
  { id: 'report', label: 'Rapport', icon: 'doc' },
  { id: 'rules', label: 'Regler', icon: 'scale' },
  { id: 'settings', label: 'Innstillinger', icon: 'gear' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'home')
  const [settings, setSettingsState] = useState<Settings | null>(null)
  const segments = useLiveQuery(() => db.segments.toArray(), [], undefined)
  const toast = useToastState()
  const sync = useSync()

  // Oppstart: sjekk innlogging mot serveren; offline → bruk lokal kopi hvis vi har vært innlogget før
  useEffect(() => {
    startSync()
    ;(async () => {
      try {
        const st = await getStatus()
        if (!st.installed) setSyncState({ auth: 'setup' })
        else if (st.authenticated) {
          setSyncState({ auth: 'in', email: st.email ?? null, totpEnabled: Boolean(st.totpEnabled) })
          await kvSet('account', st.email ?? '')
          void pull()
        } else setSyncState({ auth: 'out' })
      } catch {
        const account = await kvGet<string>('account')
        if (account) setSyncState({ auth: 'in', email: account, online: false, lastError: 'Ingen kontakt med serveren – viser lokal kopi' })
        else setSyncState({ auth: 'out', lastError: 'Ingen kontakt med serveren' })
      }
    })()
  }, [])

  useEffect(() => {
    loadSettings().then(setSettingsState)
    return onSettingsChanged(setSettingsState)
  }, [sync.auth])

  useEffect(() => {
    history.replaceState(null, '', `#${tab}`)
    window.scrollTo({ top: 0 })
  }, [tab])

  const setSettings = useCallback(async (s: Settings) => {
    setSettingsState(s)
    await store.saveSettings(s)
  }, [])

  if (sync.auth === 'loading') {
    return (
      <div className="app-header">
        <div className="inner">
          <div className="brand">
            <h1>Traveldays</h1>
            <small>laster …</small>
          </div>
        </div>
      </div>
    )
  }

  if (sync.auth === 'out' || sync.auth === 'setup') {
    return (
      <>
        <header className="app-header">
          <div className="inner">
            <div className="brand">
              <h1>Traveldays</h1>
              <small>Paris · Oslo</small>
            </div>
          </div>
        </header>
        <Login setupNeeded={sync.auth === 'setup'} />
      </>
    )
  }

  if (!settings || !segments) return null

  const nav = (cls: string) => (
    <nav className={cls}>
      {TABS.map((t) => (
        <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} aria-label={t.label}>
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )

  const syncDot = !sync.online ? 'offline' : sync.pending > 0 || sync.syncing ? 'pending' : 'ok'
  const syncTitle = !sync.online ? 'Frakoblet – endringer sendes når nettet er tilbake' : sync.pending > 0 ? `${sync.pending} endring${sync.pending === 1 ? '' : 'er'} venter` : sync.syncing ? 'Synkroniserer …' : 'Synkronisert'

  return (
    <ToastContext.Provider value={toast.show}>
      <header className="app-header">
        <div className="inner">
          <div className="brand">
            <h1>Traveldays</h1>
            <small>{settings.postCity || 'Paris'} · Oslo</small>
            <button className={`syncdot ${syncDot}`} title={syncTitle} aria-label={syncTitle} onClick={() => { void pull(); void flush() }} />
          </div>
          {nav('nav-top')}
        </div>
      </header>
      <main>
        {sync.lastError && (
          <div className="notice warn" style={{ marginBottom: 14 }}>
            {sync.lastError}
          </div>
        )}
        {!settings.name && tab !== 'settings' && (
          <div className="notice warn" style={{ marginBottom: 14 }}>
            Fyll inn navn og startdato for utsendelsen under{' '}
            <a href="#settings" onClick={(e) => { e.preventDefault(); setTab('settings') }}>
              Innstillinger
            </a>{' '}
            før du lager rapporter.
          </div>
        )}
        {tab === 'home' && <Dashboard segments={segments} settings={settings} onGoTo={(t) => setTab(t as Tab)} />}
        {tab === 'calendar' && <CalendarView segments={segments} settings={settings} />}
        {tab === 'trips' && <TripList segments={segments} settings={settings} />}
        {tab === 'add' && <AddTrip settings={settings} onDone={() => setTab('trips')} />}
        {tab === 'report' && <ReportPage segments={segments} settings={settings} />}
        {tab === 'rules' && <RulesPage settings={settings} onChange={setSettings} />}
        {tab === 'settings' && <SettingsPage settings={settings} onChange={setSettings} />}
      </main>
      {nav('nav-bottom')}
      {toast.node}
    </ToastContext.Provider>
  )
}
