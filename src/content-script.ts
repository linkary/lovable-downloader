// --- Toast notification system (Shadow DOM) ---

interface ToastOptions {
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
  duration?: number
  id?: string
}

interface ToastEntry {
  el: HTMLElement
  timer: ReturnType<typeof setTimeout>
}

let toastHost: HTMLElement | null = null
let toastContainer: HTMLElement | null = null
const activeToasts = new Map<string, ToastEntry>()

const TOAST_STYLES: Record<string, { bg: string; text: string }> = {
  info: { bg: '#e6f4ff', text: '#0958d9' },
  success: { bg: '#f6ffed', text: '#389e0d' },
  warning: { bg: '#fffbe6', text: '#d48806' },
  error: { bg: '#fff2f0', text: '#cf1322' },
}

function ensureToastContainer(): HTMLElement {
  if (toastHost?.isConnected && toastContainer) return toastContainer

  toastHost = document.createElement('div')
  document.body.appendChild(toastHost)
  const shadow = toastHost.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = `
    .toast-container {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .toast {
      padding: 10px 16px;
      border-radius: 10px;
      font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      max-width: 360px;
      min-width: 200px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
      pointer-events: auto;
      overflow: hidden;
      max-height: 80px;
      animation: toast-enter 0.3s cubic-bezier(0.215, 0.61, 0.355, 1);
      transition: all 0.3s cubic-bezier(0.215, 0.61, 0.355, 1);
    }
    @keyframes toast-enter {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `
  shadow.appendChild(style)

  toastContainer = document.createElement('div')
  toastContainer.className = 'toast-container'
  shadow.appendChild(toastContainer)

  return toastContainer
}

function showToast({ type, message, duration = 4000, id }: ToastOptions): void {
  const style = TOAST_STYLES[type] ?? TOAST_STYLES.info

  if (id && activeToasts.has(id)) {
    const entry = activeToasts.get(id)!
    entry.el.textContent = message
    entry.el.style.backgroundColor = style.bg
    entry.el.style.color = style.text
    clearTimeout(entry.timer)
    entry.timer = scheduleDismiss(entry.el, duration, id)
    return
  }

  const container = ensureToastContainer()
  const el = document.createElement('div')
  el.className = 'toast'
  el.style.backgroundColor = style.bg
  el.style.color = style.text
  el.textContent = message
  container.appendChild(el)

  const timer = scheduleDismiss(el, duration, id)
  if (id) {
    activeToasts.set(id, { el, timer })
  }
}

function scheduleDismiss(el: HTMLElement, duration: number, id?: string): ReturnType<typeof setTimeout> {
  return setTimeout(() => dismissToast(el, id), duration)
}

function dismissToast(el: HTMLElement, id?: string): void {
  if (id) activeToasts.delete(id)

  // Phase 1: slide up + fade
  el.style.opacity = '0'
  el.style.transform = 'translateY(-100%)'

  // Phase 2: collapse space
  setTimeout(() => {
    el.style.maxHeight = '0'
    el.style.paddingTop = '0'
    el.style.paddingBottom = '0'
    setTimeout(() => el.remove(), 300)
  }, 300)
}

// --- Inject page-context script to read localStorage ---

const script = document.createElement('script')
script.src = chrome.runtime.getURL('inject.js')
script.onload = () => script.remove()
;(document.head || document.documentElement).appendChild(script)

// --- Relay token from inject.js (page context) to service worker ---

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.type !== 'LOVABLE_SUPABASE_TOKEN') return

  chrome.runtime.sendMessage({
    type: 'SUPABASE_TOKEN',
    token: event.data.token,
  })
})

// --- Handle messages from service worker ---

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SHOW_TOAST' && message.toast) {
    showToast(message.toast)
    return false
  }

  if (message.type !== 'REQUEST_TOKEN') return false

  window.postMessage({ type: 'LOVABLE_REQUEST_TOKEN' }, '*')

  const handler = (event: MessageEvent) => {
    if (event.data?.type !== 'LOVABLE_SUPABASE_TOKEN') return
    window.removeEventListener('message', handler)
    sendResponse({ token: event.data.token })
  }
  window.addEventListener('message', handler)

  setTimeout(() => {
    window.removeEventListener('message', handler)
    sendResponse({ token: null })
  }, 3000)

  return true
})
