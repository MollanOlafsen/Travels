// Små feiringer: konfetti når en ny region låses opp, og kartet som delbart bilde.

export function confetti(colors: string[] = ['#3b5bdb', '#ffffff', '#c0392b', '#c9a961']): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const canvas = document.createElement('canvas')
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '80' })
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  const parts = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 13 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    c: colors[Math.floor(Math.random() * colors.length)],
  }))
  const t0 = performance.now()
  const frame = (now: number) => {
    const t = now - t0
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    for (const p of parts) {
      p.vy += 0.32
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.r += p.vr
      ctx.save()
      ctx.globalAlpha = Math.max(0, 1 - t / 3200)
      ctx.translate(p.x, p.y)
      ctx.rotate(p.r)
      ctx.fillStyle = p.c
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)))
      ctx.restore()
    }
    if (t < 3200) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}

/** Lager et PNG-bilde (1080×1350) av kartet med tittel og fremdrift. */
export async function mapToPng(svg: SVGSVGElement, title: string, subtitle: string, footer: string): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const [, , w0, h0] = (svg.getAttribute('data-full') ?? '0 0 1000 965').split(' ').map(Number)
  clone.setAttribute('viewBox', `0 0 ${w0} ${h0}`)
  clone.setAttribute('width', String(w0))
  clone.setAttribute('height', String(h0))
  const xml = new XMLSerializer().serializeToString(clone)
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('Kunne ikke tegne kartet'))
      img.src = url
    })
    const W = 1080
    const H = 1350
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#f6f1e7'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#0f1b2d'
    ctx.fillRect(0, 0, W, 210)
    ctx.fillStyle = '#c9a961'
    ctx.font = '600 26px Inter, system-ui, sans-serif'
    ctx.fillText('TOUR DE FRANCE', 60, 78)
    ctx.fillStyle = '#f6f1e7'
    ctx.font = '500 64px "Playfair Display", Georgia, serif'
    ctx.fillText(title, 60, 152)
    ctx.fillStyle = '#c9a961'
    ctx.font = '500 28px Inter, system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(subtitle, W - 60, 152)
    ctx.textAlign = 'left'
    const mw = W - 80
    const mh = (mw * h0) / w0
    ctx.drawImage(img, 40, 240, mw, mh)
    ctx.fillStyle = '#6b6b6b'
    ctx.font = '400 26px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(footer, W / 2, H - 40)
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG feilet'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Deler via delingsarket (mobil) eller laster ned. */
export async function shareOrDownload(blob: Blob, filename: string, text: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared'
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  return 'downloaded'
}
