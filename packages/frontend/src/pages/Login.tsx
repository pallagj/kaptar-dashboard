import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

declare global {
  interface Window { google?: any }
}

export function Login() {
  const { user, login } = useAuth()
  const [clientId, setClientId] = useState<string>('')
  const [err, setErr] = useState('')
  const [configLoading, setConfigLoading] = useState(true)
  const btnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.authConfig()
      .then(c => setClientId(c.google_client_id))
      .catch(() => setErr('Konfig betöltése sikertelen'))
      .finally(() => setConfigLoading(false))
  }, [])

  useEffect(() => {
    if (!clientId || user) return
    function init() {
      if (!window.google?.accounts?.id) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp: { credential: string }) => {
          setErr('')
          try { await login(resp.credential) }
          catch (e: any) { setErr(e.message) }
        },
      })
      if (btnRef.current) {
        btnRef.current.innerHTML = ''
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill',
        })
      }
      try { window.google.accounts.id.prompt() } catch { /* ignore */ }
    }
    const existing = document.getElementById('gis-script') as HTMLScriptElement | null
    if (existing) init()
    else {
      const s = document.createElement('script')
      s.id = 'gis-script'
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.defer = true
      s.onload = init
      document.head.appendChild(s)
    }
  }, [clientId, user, login])

  if (user) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card p-8 w-full max-w-md text-center space-y-6">
        <div>
          <div className="text-5xl mb-2">🐝</div>
          <h1 className="text-2xl font-bold bg-gradient-to-br from-honey-300 to-honey-500 bg-clip-text text-transparent">
            Kaptár Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-2">Jelentkezz be a Google fiókoddal.</p>
        </div>
        {configLoading && <p className="text-sm text-slate-400">Konfig betöltése…</p>}
        {!configLoading && !clientId && (
          <p className="text-sm text-amber-300">
            A Google bejelentkezés nincs beállítva a szerveren. Állítsd be a{' '}
            <code className="font-mono">GOOGLE_CLIENT_ID</code> környezeti változót.
          </p>
        )}
        {clientId && <div ref={btnRef} className="flex justify-center" />}
        {err && <p className="text-sm text-red-300">{err}</p>}
      </div>
    </div>
  )
}
