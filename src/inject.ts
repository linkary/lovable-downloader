import { findSupabaseToken } from './utils'

const token = findSupabaseToken(localStorage)
if (token) {
  window.postMessage({ type: 'LOVABLE_SUPABASE_TOKEN', token }, '*')
}

// Respond to explicit requests from content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.type !== 'LOVABLE_REQUEST_TOKEN') return

  const t = findSupabaseToken(localStorage)
  window.postMessage(
    { type: 'LOVABLE_SUPABASE_TOKEN', token: t },
    '*',
  )
})
