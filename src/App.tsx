import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Settings } from './types'
import { db, loadSettings, saveSettings } from './lib/db'
import { Dashboard } from './components/Dashboard'
import { CalendarView } from './components/CalendarView'
import { TripList } from './components/TripList'
import { AddTrip } from './components/AddTrip'
import { ReportPage } from './components/ReportPage'
import { RulesPage } from './components/RulesPage'
import { SettingsPage } from './components/SettingsPage'
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

  useEffect(() => {
    loadSettings().then(setSettingsState)
  }, [])

  useEffect(() => {
    history.replaceState(null, '', `#${tab}`)
    window.scrollTo({ top: 0 })
  }, [tab])

  const setSettings = useCallback(async (s: Settings) => {
    setSettingsState(s)
    await saveSettings(s)
  }, [])

  if (!settings || !segments) {
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

  return (
    <ToastContext.Provider value={toast.show}>
      <header className="app-header">
        <div className="inner">
          <div className="brand">
            <h1>Traveldays</h1>
            <small>{settings.postCity || 'Paris'} · Oslo</small>
          </div>
          {nav('nav-top')}
        </div>
      </header>
      <main>
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
