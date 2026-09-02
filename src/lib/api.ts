// Tynn klient mot PHP-API-et (samme opprinnelse, httpOnly-cookie).

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public payload: Record<string, unknown> = {},
  ) {
    super(code)
  }
}

export const API_BASE = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}api/`

interface Opts {
  method?: 'GET' | 'POST'
  body?: unknown
  form?: FormData
  query?: Record<string, string | number>
}

export async function api<T = Record<string, unknown>>(path: string, opts: Opts = {}): Promise<T> {
  const url = new URL(API_BASE + path, location.origin)
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v))
  const headers: Record<string, string> = { 'X-Traveldays': '1' }
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  const res = await fetch(url, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, credentials: 'same-origin', cache: 'no-store' })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new ApiError(res.status, 'bad_json', { text: text.slice(0, 200) })
  }
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? `http_${res.status}`), data)
  return data as T
}

export interface Status {
  installed: boolean
  authenticated: boolean
  email?: string | null
  totpEnabled?: boolean
  encrypted?: boolean
  https?: boolean
}

export const getStatus = () => api<Status>('status.php')
export const login = (email: string, password: string, code?: string) =>
  api<{ ok?: boolean; needCode?: boolean; email?: string; totpEnabled?: boolean }>('login.php', { body: { email, password, code } })
export const logout = () => api('logout.php', { body: {} })

export const ERROR_TEXT: Record<string, string> = {
  bad_credentials: 'Feil e-post eller passord.',
  bad_code: 'Feil engangskode.',
  too_many_attempts: 'For mange forsøk. Vent 15 minutter.',
  unauthenticated: 'Du er logget ut.',
  https_required: 'Krever HTTPS.',
  weak_password: 'Passordet må ha minst 12 tegn.',
  not_installed: 'Serveren er ikke satt opp ennå.',
  too_big: 'Filen er for stor.',
  bad_type: 'Filtypen støttes ikke.',
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return ERROR_TEXT[e.code] ?? `Serverfeil (${e.status}: ${e.code})`
  if (e instanceof TypeError) return 'Ingen kontakt med serveren.'
  return (e as Error)?.message ?? 'Ukjent feil'
}
