function getSupabaseToken(): string | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && /^sb-.*-auth-token$/.test(key)) {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const parsed = JSON.parse(raw)
        if (parsed.access_token) return parsed.access_token
      } catch {
        continue
      }
    }
  }
  return null
}

// Send token proactively on load
const token = getSupabaseToken()
if (token) {
  window.postMessage({ type: 'LOVEABLE_SUPABASE_TOKEN', token }, '*')
}

// Respond to explicit requests from content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.type !== 'LOVEABLE_REQUEST_TOKEN') return

  const t = getSupabaseToken()
  window.postMessage(
    { type: 'LOVEABLE_SUPABASE_TOKEN', token: t },
    '*',
  )
})
