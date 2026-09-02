# Traveldays

Dagslogg for medfølgende ektefelle i utenrikstjenesten: teller dager i Paris/Frankrike, Norge og andre land, leser boardingkort fra bilde, og lager rapport til ambassaden og Skatteetaten.

**App:** https://mollanolafsen.github.io/Travels/

## Hva den gjør

- **Boardingkort → reise.** Ta bilde av boardingkortet. Strekkoden (PDF417/Aztec/QR i IATA BCBP-format) leses lokalt i nettleseren og gir dato, rute, flight, PNR og sete. Uten strekkode kjøres OCR (Tesseract) som reserve; alt kan rettes før lagring.
- **Dagtelling.** Ut fra reisene beregnes hvor man har oppholdt seg hver dag (hele og deler av døgn), hvor man har overnattet, sammenhengende fravær fra tjenestestedet og besøksreiser hjem.
- **Regler med kilder.** Status mot UD-særavtalen (fast bosatt ≥ 50 %, fravær maks 3 måneder), Skatteetatens pendlerregler (besøksreiser, døgnhvile) og 183-dagersregelen. Alle grenser kan justeres, og hver regel viser kilde.
- **Rapport.** PDF med månedssammendrag, regelstatus, reiseliste, erklæring/underskrift og boardingkortene som vedlegg. CSV for reiser og dager. Deles via delingsarket på mobil.
- **Personvern.** Ingen server. Alt ligger i nettleserens IndexedDB. Sikkerhetskopi som JSON (med bilder) kan lastes ned og gjenopprettes.
- **PWA.** Kan installeres på hjemskjermen (iPhone: Del → Legg til på Hjem-skjerm). Virker offline etter første besøk (OCR-modellen krever nett første gang).

## Utvikling

```bash
npm install
npm run dev        # http://localhost:5173/Travels/
npm test           # vitest: BCBP-parser, OCR-tolkning, regelmotor
npm run build      # dist/
node scripts/make-icons.mjs   # regenererer PNG-ikoner
```

Publisering skjer automatisk til GitHub Pages ved push til `main` (`.github/workflows/deploy.yml`). Repo-innstilling: Settings → Pages → Source: **GitHub Actions**.

## Kilder for reglene (hentet 2. september 2026)

- [Særavtale om tillegg, ytelser og godtgjørelser i utenrikstjenesten 2026–2028](https://www.regjeringen.no/no/dokumenter/saravtale/id545430/) – definisjonen av «fast bosatt», § 2.1 (fravær over tre måneder), § 2.5 (samboer likestilles).
- [Familieportalen (UD) – Under utenlandsoppholdet](https://familieportalen.mfa.no/utenlandsoppholdet/)
- [Skatteetaten – Pendlerfradrag](https://www.skatteetaten.no/en/person/taxes/get-the-taxes-right/employment-benefits-and-pensions/travel-home-work/commuter/commuter/commuter-deduction/)
- [FSFIN § 3-1 Skattemessig bosted for pendlere](https://lovdata.no/dokument/SF/forskrift/1999-11-19-1158/KAPITTEL_3)
- [Skatteloven § 2-1](https://lovdata.no/lov/1999-03-26-14/§2-1) og [Skatteetaten – skattemessig bosted](https://www.skatteetaten.no/en/person/taxes/get-the-taxes-right/abroad/tax-residence-in-norway-when-moving-to-or-from-norway/)
- [Høringsnotat 24/2434 – skattemessig bosted for utsendt utenrikstjenesteansatt](https://www.regjeringen.no/no/dokumenter/horingsbrev-endring-av-reglene-om-skattemessig-bosted-for-utsendte-utenrikstjenesteansatte-mv/id3047407/) og [Forskuddsmeldingen 2025](https://www.skatteetaten.no/en/rettskilder/type/skattedirektoratets-meldinger/forskuddsmeldingen-2025/)

Appen er et hjelpemiddel. Det formelle regelverket og ambassadens/Skatteetatens vurdering går alltid foran.
