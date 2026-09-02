import type { RuleConfig, Settings } from '../types'
import { RULE_DEFS } from '../lib/rules'

export function RulesPage({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const update = (id: string, patch: Partial<RuleConfig>) =>
    onChange({ ...settings, rules: settings.rules.map((r) => (r.id === id ? { ...r, ...patch, params: { ...r.params, ...(patch.params ?? {}) } } : r)) })

  return (
    <div className="stack">
      <div className="card">
        <div className="eyebrow">Regelverk</div>
        <h2>Reglene appen teller mot</h2>
        <p className="small" style={{ marginTop: 0 }}>
          Kildene er hentet fra regjeringen.no (UD-særavtalen), Familieportalen og Skatteetaten/Lovdata 2. september 2026. Tallene kan justeres her hvis ambassaden eller Skatteetaten gir deg andre grenser. Appen er et hjelpemiddel – det er alltid det formelle regelverket og ambassadens/Skatteetatens vurdering som gjelder.
        </p>
        <details>
          <summary>Kort om din situasjon</summary>
          <ul className="small" style={{ paddingLeft: 18 }}>
            <li>
              <strong>UD:</strong> Som medfølgende ektefelle utløser du <em>forhøyet utenlandstillegg</em> for den utsendte. Vilkåret er at du er «fast bosatt» på tjenestestedet (minst halvparten av tjenestetiden hvert kalenderår) og ikke har sammenhengende fravær over tre måneder (særavtalen § 2 og 2.1). Reglene gjelder likt for ektefelle, registrert partner og samboer (§ 2.5).
            </li>
            <li>
              <strong>Skatteetaten – bosted:</strong> Den utsendte regnes fra inntektsåret 2025 som skattemessig bosatt i Norge (skatteloven § 2-1 åttende ledd, endret ved Prop. 1 LS 2024–2025). Særregelen gjelder <em>bare</em> den utsendte; du følger de alminnelige reglene og forblir skattemessig bosatt i Norge (bolig/arbeid i Norge, 183-dagersregelen).
            </li>
            <li>
              <strong>Skatteetaten – pendlerfradrag:</strong> Gift familiependler har skattemessig hjem der ektefellen bor (Paris, FSFIN § 3-1-2). Arbeidsopphold i Oslo gir fradrag for besøksreiser til Paris, kost og losji – med krav om minst tre hjemreiser med overnatting i året, dokumentert med reisebilag. Boardingkortene i denne appen er den dokumentasjonen.
            </li>
            <li>
              <strong>90-dagersregelen</strong> som ambassader ofte viser til, var skattepraksis for <em>utsendte</em> (maks 90 dager i Norge for å beholde status som bosatt i utlandet). Den ble ikke videreført fra 2025. Har du fått et konkret dagstak, legg det inn under «Egen grense».
            </li>
          </ul>
        </details>
      </div>

      {RULE_DEFS.map((def) => {
        const cfg = settings.rules.find((r) => r.id === def.id)!
        return (
          <article key={def.id} className={`card rule-card ${cfg.enabled ? 'info' : ''}`}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div>
                <span className={`badge ${def.authority === 'UD' ? 'navy' : def.authority === 'Skatteetaten' ? 'gold' : 'off'}`}>{def.authority}</span>
                <h3 style={{ marginTop: 6 }}>{def.title}</h3>
              </div>
              <label className="switch" title={cfg.enabled ? 'Slå av' : 'Slå på'}>
                <input type="checkbox" checked={cfg.enabled} onChange={(e) => update(def.id, { enabled: e.target.checked })} />
                <span />
              </label>
            </div>
            <p className="small" style={{ margin: '8px 0' }}>{def.description}</p>
            {def.quote && <blockquote>{def.quote}</blockquote>}
            {Object.keys(def.paramLabels).length > 0 && (
              <div className="form-grid" style={{ marginTop: 10 }}>
                {Object.entries(def.paramLabels).map(([k, label]) => (
                  <label key={k} className="field">
                    {label}
                    <input
                      type="number"
                      value={Number(cfg.params[k] ?? def.defaultParams[k])}
                      onChange={(e) => update(def.id, { params: { [k]: Number(e.target.value) } })}
                      disabled={!cfg.enabled}
                    />
                  </label>
                ))}
              </div>
            )}
            <details style={{ marginTop: 8 }}>
              <summary className="small">Kilder</summary>
              <ul className="sources">
                {def.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </article>
        )
      })}
    </div>
  )
}
