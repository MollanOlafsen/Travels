// Datamodell for Traveldays. Alle data lagres lokalt (IndexedDB) – ingen server.

export type Source = 'barcode' | 'ocr' | 'manual'

/** Én reisestrekning (fly, tog, bil …). Datoen er lokal avreisedato. */
export interface Segment {
  id: string
  /** YYYY-MM-DD, avreise */
  date: string
  /** YYYY-MM-DD, ankomst – bare satt når den avviker fra avreisedato (nattfly) */
  arrivalDate?: string
  /** IATA-kode eller fritekst (f.eks. «Paris Gare de Lyon») */
  from: string
  to: string
  /** ISO 3166-1 alpha-2 */
  fromCountry: string
  toCountry: string
  carrier?: string
  flight?: string
  pnr?: string
  seat?: string
  passenger?: string
  source: Source
  /** Peker til bilde av boardingkortet i images-tabellen */
  imageId?: number
  note?: string
  createdAt: number
  /** Rekkefølge på samme dato (0 = først) */
  order: number
}

export interface StoredImage {
  id?: number
  blob: Blob
  name: string
  width: number
  height: number
  createdAt: number
  /** Rå strekkodetekst hvis lest */
  rawBarcode?: string
  /** OCR-tekst hvis kjørt */
  ocrText?: string
}

export type RuleStatus = 'ok' | 'warn' | 'critical' | 'info' | 'off'

export interface RuleParams {
  [key: string]: number | boolean | string
}

export interface RuleConfig {
  id: string
  enabled: boolean
  params: RuleParams
}

export interface Settings {
  /** Navn som brukes i rapporter */
  name: string
  /** Den utsendtes navn (for rapporten til ambassaden) */
  postedPartnerName: string
  /** Tjenestested */
  postCountry: string
  postCity: string
  /** Hjemlandet for skatt/pendling – NO */
  homeCountry: string
  /** Første dag i utsendelsen (YYYY-MM-DD) */
  postingStart: string
  postingEnd?: string
  /** Hvor man var ved postingStart */
  initialCountry: string
  /** Reisedag regnes som opphold i både avreise- og ankomstland (Skatteetatens praksis: hele eller deler av døgn teller) */
  travelDayCountsBoth: boolean
  rules: RuleConfig[]
  /** Egendefinerte flyplasser: IATA → land */
  customAirports: Record<string, { country: string; city: string }>
}
