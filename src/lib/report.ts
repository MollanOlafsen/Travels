// Rapporter: PDF (jsPDF) til ambassaden/Skatteetaten, CSV og deling.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { eachMonthOfInterval, endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import { nb } from 'date-fns/locale'
import type { RuleStatus, Segment, Settings, StoredImage } from '../types'
import { countryName, lookupAirport } from './airports'
import { RULE_MAP, computePresence, daysIn, daysOther, evaluateRules, fmtDate, homeVisits, iso, nightsIn, sortSegments, type Presence } from './rules'

export interface ReportOptions {
  from: string
  to: string
  includeRules: boolean
  includeDays: boolean
  includeImages: boolean
}

export interface MonthRow {
  label: string
  from: string
  to: string
  post: number
  home: number
  other: number
  nightsPost: number
  nightsHome: number
  visits: number
}

export const SOURCE_LABEL: Record<Segment['source'], string> = {
  barcode: 'Boardingkort (strekkode)',
  ocr: 'Boardingkort (OCR)',
  manual: 'Manuelt registrert',
}

export const STATUS_LABEL: Record<RuleStatus, string> = {
  ok: 'OK',
  warn: 'Følg med',
  critical: 'Kritisk',
  info: 'Info',
  off: 'Av',
}

export function monthRows(segments: Segment[], p: Presence, s: Settings, from: string, to: string): MonthRow[] {
  if (to < from) return []
  const months = eachMonthOfInterval({ start: parseISO(from), end: parseISO(to) })
  return months.map((m) => {
    const mf = [iso(startOfMonth(m)), from].sort().pop()!
    const mt = [iso(endOfMonth(m)), to].sort()[0]
    const year = m.getFullYear()
    const visits = homeVisits(segments, p, s.postCountry, year).filter((d) => d >= mf && d <= mt).length
    return {
      label: format(m, 'MMMM yyyy', { locale: nb }),
      from: mf,
      to: mt,
      post: daysIn(p, s.postCountry, mf, mt),
      home: daysIn(p, s.homeCountry, mf, mt),
      other: daysOther(p, s.homeCountry, s.postCountry, mf, mt),
      nightsPost: nightsIn(p, s.postCountry, mf, mt),
      nightsHome: nightsIn(p, s.homeCountry, mf, mt),
      visits,
    }
  })
}

export function placeLabel(code: string, s: Settings): string {
  const ap = lookupAirport(code, s.customAirports)
  return ap ? `${code.toUpperCase()} ${ap.city}` : code
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

export async function buildPdf(
  segments: Segment[],
  images: Map<number, StoredImage>,
  s: Settings,
  opts: ReportOptions,
  today: string,
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const navy: [number, number, number] = [15, 27, 45]
  const gold: [number, number, number] = [201, 169, 97]
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 16
  const p = computePresence(segments, s, [today, opts.to].sort().pop()!)
  const segs = sortSegments(segments).filter((x) => x.date >= opts.from && x.date <= opts.to)
  const postName = `${s.postCity || countryName(s.postCountry)}`

  // Topptekst
  doc.setFillColor(...navy)
  doc.rect(0, 0, pageW, 34, 'F')
  doc.setTextColor(246, 241, 231)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('Reisedagslogg', margin, 15)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`${countryName(s.postCountry)} · ${countryName(s.homeCountry)} · andre land`, margin, 22)
  doc.setTextColor(...gold)
  doc.text('Traveldays', pageW - margin, 15, { align: 'right' })
  doc.setTextColor(246, 241, 231)
  doc.text(`Generert ${fmtDate(today)}`, pageW - margin, 22, { align: 'right' })

  doc.setTextColor(28, 28, 28)
  let y = 44
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(s.name || '(navn ikke satt)', margin, y)
  doc.setFont('helvetica', 'normal')
  y += 6
  if (s.postedPartnerName) {
    doc.text(`Medfølgende ektefelle til ${s.postedPartnerName}, utsendt til ${postName}`, margin, y)
    y += 6
  }
  doc.text(`Periode: ${fmtDate(opts.from)} – ${fmtDate(opts.to)}`, margin, y)
  y += 6
  doc.text(`Utsendelsen startet ${fmtDate(s.postingStart)}. Hele og deler av døgn teller som opphold i et land.`, margin, y)
  y += 9

  // Sammendrag per måned
  const rows = monthRows(segs.length ? segments : segments, p, s, opts.from, opts.to)
  const tot = rows.reduce(
    (a, r) => ({ post: a.post + r.post, home: a.home + r.home, other: a.other + r.other, nightsPost: a.nightsPost + r.nightsPost, nightsHome: a.nightsHome + r.nightsHome, visits: a.visits + r.visits }),
    { post: 0, home: 0, other: 0, nightsPost: 0, nightsHome: 0, visits: 0 },
  )
  autoTable(doc, {
    startY: y,
    head: [['Måned', `Dager ${countryName(s.postCountry)}`, `Dager ${countryName(s.homeCountry)}`, 'Dager andre land', `Netter ${postName}`, `Netter ${countryName(s.homeCountry)}`, 'Besøksreiser']],
    body: [
      ...rows.map((r) => [r.label, r.post, r.home, r.other, r.nightsPost, r.nightsHome, r.visits]),
      [{ content: 'Sum', styles: { fontStyle: 'bold' } }, tot.post, tot.home, tot.other, tot.nightsPost, tot.nightsHome, tot.visits],
    ],
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: navy, textColor: [246, 241, 231] },
    alternateRowStyles: { fillColor: [246, 241, 231] },
    margin: { left: margin, right: margin },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

  if (opts.includeRules) {
    const res = evaluateRules(segments, s, today).filter((r) => r.status !== 'off')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(`Status mot regelverk (per ${fmtDate(today)})`, margin, y)
    y += 3
    autoTable(doc, {
      startY: y,
      head: [['Regel', 'Status', 'Verdi', 'Kommentar']],
      body: res.map((r) => {
        const def = RULE_MAP.get(r.id)!
        return [`${def.authority}: ${def.title}`, STATUS_LABEL[r.status], r.value, `${r.headline} ${r.detail}`]
      }),
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 18 }, 2: { cellWidth: 30 } },
      headStyles: { fillColor: navy, textColor: [246, 241, 231] },
      margin: { left: margin, right: margin },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }

  // Reiser
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Reiser i perioden', margin, y)
  y += 3
  autoTable(doc, {
    startY: y,
    head: [['Dato', 'Fra', 'Til', 'Flight', 'Kilde', 'Merknad']],
    body: segs.length
      ? segs.map((x) => [
          x.arrivalDate && x.arrivalDate !== x.date ? `${fmtDate(x.date)} – ${fmtDate(x.arrivalDate)}` : fmtDate(x.date),
          `${placeLabel(x.from, s)} (${countryName(x.fromCountry)})`,
          `${placeLabel(x.to, s)} (${countryName(x.toCountry)})`,
          [x.carrier, x.flight].filter(Boolean).join(' '),
          SOURCE_LABEL[x.source] + (x.imageId ? ' – vedlegg' : ''),
          x.note ?? '',
        ])
      : [['Ingen reiser registrert i perioden', '', '', '', '', '']],
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: navy, textColor: [246, 241, 231] },
    alternateRowStyles: { fillColor: [246, 241, 231] },
    margin: { left: margin, right: margin },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

  if (opts.includeDays) {
    doc.addPage()
    y = 20
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Dag for dag', margin, y)
    y += 3
    const days = p.days.filter((d) => d.date >= opts.from && d.date <= opts.to)
    autoTable(doc, {
      startY: y,
      head: [['Dato', 'Opphold (land)', 'Overnatting']],
      body: days.map((d) => [
        format(parseISO(d.date), 'EEE d. MMM yyyy', { locale: nb }),
        d.countries.map(countryName).join(' + ') || 'Underveis',
        d.endOfDay === 'XX' ? 'Underveis' : countryName(d.endOfDay),
      ]),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: navy, textColor: [246, 241, 231] },
      margin: { left: margin, right: margin },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }

  // Erklæring
  if (y > 240) {
    doc.addPage()
    y = 20
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Jeg bekrefter at oversikten er korrekt og i samsvar med mine reisedokumenter.', margin, y)
  y += 16
  doc.setDrawColor(120)
  doc.line(margin, y, margin + 70, y)
  doc.line(margin + 90, y, margin + 160, y)
  y += 5
  doc.setFontSize(8)
  doc.setTextColor(110)
  doc.text('Sted og dato', margin, y)
  doc.text('Underskrift', margin + 90, y)
  doc.setTextColor(28, 28, 28)

  // Vedlegg: boardingkort
  if (opts.includeImages) {
    const withImg = segs.filter((x) => x.imageId != null && images.has(x.imageId))
    const seen = new Set<number>()
    let n = 0
    for (const x of withImg) {
      if (seen.has(x.imageId!)) continue
      seen.add(x.imageId!)
      const img = images.get(x.imageId!)!
      n++
      doc.addPage()
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(`Vedlegg ${n} – ${fmtDate(x.date)} ${x.from} – ${x.to} ${[x.carrier, x.flight].filter(Boolean).join(' ')}`, margin, 18)
      doc.setFont('helvetica', 'normal')
      const dataUrl = await blobToDataUrl(img.blob)
      const maxW = pageW - margin * 2
      const maxH = doc.internal.pageSize.getHeight() - 40
      const scale = Math.min(maxW / img.width, maxH / img.height)
      const w = img.width * scale
      const h = img.height * scale
      doc.addImage(dataUrl, 'JPEG', margin, 24, w, h)
    }
  }

  // Sidetall
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(110)
    doc.text(`${s.name || 'Traveldays'} – reisedagslogg – side ${i} av ${pages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
  }
  return doc.output('blob')
}

/* ---------- CSV ---------- */

const csvCell = (v: string | number) => {
  const str = String(v ?? '')
  return /[;"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function tripsCsv(segments: Segment[], s: Settings, from: string, to: string): string {
  const head = ['Dato', 'Ankomstdato', 'Fra', 'Fra land', 'Til', 'Til land', 'Selskap', 'Flight', 'PNR', 'Sete', 'Kilde', 'Merknad']
  const rows = sortSegments(segments)
    .filter((x) => x.date >= from && x.date <= to)
    .map((x) => [x.date, x.arrivalDate ?? '', x.from, countryName(x.fromCountry), x.to, countryName(x.toCountry), x.carrier ?? '', x.flight ?? '', x.pnr ?? '', x.seat ?? '', SOURCE_LABEL[x.source], x.note ?? ''])
  void s
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
}

export function daysCsv(segments: Segment[], s: Settings, from: string, to: string, today: string): string {
  const p = computePresence(segments, s, [today, to].sort().pop()!)
  const head = ['Dato', 'Opphold (land)', 'Overnatting', `I ${countryName(s.postCountry)}`, `I ${countryName(s.homeCountry)}`]
  const rows = p.days
    .filter((d) => d.date >= from && d.date <= to)
    .map((d) => [d.date, d.countries.map(countryName).join(' + '), d.endOfDay === 'XX' ? 'Underveis' : countryName(d.endOfDay), d.countries.includes(s.postCountry) ? 1 : 0, d.countries.includes(s.homeCountry) ? 1 : 0])
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
}

/* ---------- Levering ---------- */

/** Deler filen via systemets delingsark (mobil) eller laster den ned. */
export async function deliverFile(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: blob.type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  return 'downloaded'
}
