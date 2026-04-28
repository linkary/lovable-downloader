import { findSupabaseToken } from './utils'

const token = findSupabaseToken(localStorage)
if (token) {
  window.postMessage({ type: 'LOVEABLE_SUPABASE_TOKEN', token }, '*')
}

// Respond to explicit requests from content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.type !== 'LOVEABLE_REQUEST_TOKEN') return

  const t = findSupabaseToken(localStorage)
  window.postMessage(
    { type: 'LOVEABLE_SUPABASE_TOKEN', token: t },
    '*',
  )
})
