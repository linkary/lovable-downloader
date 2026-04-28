// Inject the page-context script to read localStorage
const script = document.createElement('script')
script.src = chrome.runtime.getURL('inject.js')
script.onload = () => script.remove()
;(document.head || document.documentElement).appendChild(script)

// Relay token from inject.js (page context) to service worker
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.type !== 'LOVEABLE_SUPABASE_TOKEN') return

  chrome.runtime.sendMessage({
    type: 'SUPABASE_TOKEN',
    token: event.data.token,
  })
})

// Handle explicit token requests from service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'REQUEST_TOKEN') return false

  window.postMessage({ type: 'LOVEABLE_REQUEST_TOKEN' }, '*')

  const handler = (event: MessageEvent) => {
    if (event.data?.type !== 'LOVEABLE_SUPABASE_TOKEN') return
    window.removeEventListener('message', handler)
    sendResponse({ token: event.data.token })
  }
  window.addEventListener('message', handler)

  // Timeout after 3 seconds
  setTimeout(() => {
    window.removeEventListener('message', handler)
    sendResponse({ token: null })
  }, 3000)

  return true // async response
})
