import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

export const ToastContext = createContext<(msg: string) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function useToastState(): { show: (msg: string) => void; node: ReactNode } {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 3200)
  }, [])
  return { show, node: msg ? <div className="toast" role="status">{msg}</div> : null }
}
