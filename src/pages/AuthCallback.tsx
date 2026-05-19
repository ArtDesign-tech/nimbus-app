import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function AuthCallback() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('Menyelesaikan login...')

  useEffect(() => {
    let mounted = true

    // First, check if a session already exists (e.g. page refresh)
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return

      if (error) {
        setMessage('Login gagal. Mengarahkan kembali...')
        window.setTimeout(() => navigate('/login', { replace: true }), 800)
        return
      }

      if (data.session) {
        navigate('/chat', { replace: true })
      }
      // else: wait for the onAuthStateChange SIGNED_IN event below
    })

    // Listen for Supabase to finish parsing the hash fragment and emit SIGNED_IN.
    // This is the reliable way to handle OAuth callbacks.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      if (event === 'SIGNED_IN' && session) {
        navigate('/chat', { replace: true })
        return
      }

      if (event === 'SIGNED_OUT') {
        navigate('/login', { replace: true })
      }
    })

    // Fallback: if nothing happens after 5 seconds, redirect to login
    const timeout = window.setTimeout(() => {
      if (!mounted) return
      setMessage('Waktu habis. Mengarahkan kembali...')
      window.setTimeout(() => navigate('/login', { replace: true }), 800)
    }, 5000)

    return () => {
      mounted = false
      subscription.unsubscribe()
      window.clearTimeout(timeout)
    }
  }, [navigate])

  return (
    <main className="auth-callback-page">
      <div className="auth-callback-card">
        <div className="auth-callback-spinner" aria-hidden="true" />
        <p>{message}</p>
      </div>
    </main>
  )
}
