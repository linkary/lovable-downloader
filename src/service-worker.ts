import JSZip from 'jszip'

// --- Constants ---

const LOVABLE_API = 'https://api.lovable.dev'
const CONCURRENCY = 5
const BATCH_DELAY_MS = 100

const DEFAULT_ICONS: Record<string, string> = {
  16: 'images/16.png',
  32: 'images/32.png',
  48: 'images/48.png',
  128: 'images/128.png',
}

// --- State ---

let isDownloading = false
let downloadController: AbortController | null = null

// --- Toast helper ---

async function ensureContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content-script.js'],
  })
}

async function sendToast(
  tabId: number,
  type: string,
  message: string,
  duration?: number,
  id?: string
): Promise<void> {
  const payload = { type: 'SHOW_TOAST', toast: { type, message, duration, id } }
  try {
    await chrome.tabs.sendMessage(tabId, payload)
  } catch {
    try {
      await ensureContentScript(tabId)
      await chrome.tabs.sendMessage(tabId, payload)
    } catch (err) {
      console.warn('Toast delivery failed:', err)
    }
  }
}

// --- webRequest: passively capture bearer token + git ref ---

chrome.webRequest.onSendHeaders.addListener(
  details => {
    const url = new URL(details.url)

    const projectMatch = url.pathname.match(/\/projects\/([^/]+)/)
    if (!projectMatch) return
    const projectId = projectMatch[1]

    const authHeader = details.requestHeaders?.find(h => h.name.toLowerCase() === 'authorization')
    if (authHeader?.value) {
      chrome.storage.local.set({ [`token:${projectId}`]: authHeader.value })
    }

    const ref = url.searchParams.get('ref')
    if (ref) {
      chrome.storage.local.set({ [`ref:${projectId}`]: ref })
    }
  },
  { urls: [`${LOVABLE_API}/*`] },
  ['requestHeaders', 'extraHeaders']
)

// --- Message handler: receive token from content script fallback ---

chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'SUPABASE_TOKEN' && message.token) {
    chrome.storage.local.set({ fallbackToken: `Bearer ${message.token}` })
  }
})

// --- action.onClicked: orchestrate download ---

chrome.action.onClicked.addListener(async tab => {
  if (!tab.url || !tab.id) return

  const tabId = tab.id
  const projectId = parseProjectId(tab.url)
  if (!projectId) {
    await sendToast(tabId, 'error', 'Not a valid Lovable project page.', 6000)
    return
  }

  if (isDownloading) {
    downloadController?.abort()
    await sendToast(tabId, 'info', 'Download cancelled.', 3000)
    return
  }

  isDownloading = true
  downloadController = new AbortController()
  const signal = downloadController.signal

  try {
    await sendToast(tabId, 'info', 'Resolving authentication...', 4000, 'status')
    let token = await resolveToken(projectId, tabId)
    if (!token) {
      await sendToast(
        tabId,
        'error',
        'Auth token not found. Please refresh the page.',
        6000,
        'status'
      )
      return
    }
    await sendToast(tabId, 'info', 'Token acquired.', 3000, 'status')

    const ref = await resolveRef(projectId)
    await sendToast(tabId, 'info', `Using ref: ${ref}`, 3000, 'status')

    await sendToast(tabId, 'info', 'Fetching file list...', 4000, 'status')

    let files: FileEntry[]
    try {
      files = await fetchFileList(projectId, token, ref, signal)
    } catch (err) {
      if (err instanceof Error && err.message.includes('401')) {
        await chrome.storage.local.remove([`token:${projectId}`, 'fallbackToken'])
        await sendToast(tabId, 'warning', 'Token expired, re-authenticating...', 4000, 'status')
        token = await requestTokenFromContentScript(tabId, projectId)
        if (!token) {
          await sendToast(
            tabId,
            'error',
            'Re-authentication failed. Please refresh and try again.',
            6000,
            'status'
          )
          throw new Error('Re-authentication failed')
        }
        files = await fetchFileList(projectId, token, ref, signal)
      } else {
        throw err
      }
    }

    await sendToast(
      tabId,
      'info',
      `Downloading ${files.length} files...`,
      4000,
      'download-progress'
    )

    const fileContents = await fetchAllFiles(
      projectId,
      files,
      token,
      ref,
      async (completed, total) => {
        await sendToast(
          tabId,
          'info',
          `Downloading files... (${completed}/${total})`,
          4000,
          'download-progress'
        )
      },
      signal
    )

    await updateProgressIcon(1)
    await sendToast(tabId, 'info', 'Creating ZIP archive...', 4000, 'status')
    setBadge('ZIP', '#4CAF50')

    const zip = new JSZip()
    for (const [path, content] of fileContents) {
      zip.file(path, content)
    }

    const base64 = await zip.generateAsync({ type: 'base64' })

    await chrome.downloads.download({
      url: `data:application/zip;base64,${base64}`,
      filename: `lovable_project_${projectId}.zip`,
      saveAs: true,
    })

    await sendToast(tabId, 'success', 'Project downloaded successfully!', 3000)
    setBadge('OK', '#4CAF50')
    setTimeout(() => resetIcon(), 3000)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      resetIcon()
    } else {
      console.error('Download failed:', err)
      const reason = err instanceof Error ? err.message : 'Unknown error'
      await sendToast(tabId, 'error', `Download failed: ${reason}`, 6000)
      setBadge('ERR', '#F44336')
      setTimeout(() => resetIcon(), 5000)
    }
  } finally {
    isDownloading = false
    downloadController = null
  }
})

// --- URL parsing ---

function parseProjectId(url: string): string | null {
  const match = url.match(
    /lovable\.dev\/projects\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/
  )
  return match?.[1] ?? null
}

// --- Token resolution ---

async function resolveToken(projectId: string, tabId: number): Promise<string | null> {
  const stored = await chrome.storage.local.get([`token:${projectId}`, 'fallbackToken'])
  const projectToken = stored[`token:${projectId}`] as string | undefined
  if (projectToken) return projectToken
  const fallback = stored.fallbackToken as string | undefined
  if (fallback) return fallback

  return requestTokenFromContentScript(tabId, projectId)
}

async function requestTokenFromContentScript(
  tabId: number,
  projectId: string
): Promise<string | null> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'REQUEST_TOKEN' })
    if (response?.token) {
      const bearer = `Bearer ${response.token}`
      chrome.storage.local.set({ [`token:${projectId}`]: bearer })
      return bearer
    }
  } catch {
    // Content script not available
  }
  return null
}

// --- Ref resolution ---

async function resolveRef(projectId: string): Promise<string> {
  const stored = await chrome.storage.local.get(`ref:${projectId}`)
  return (stored[`ref:${projectId}`] as string | undefined) ?? 'main'
}

// --- Lovable API ---

interface FileEntry {
  path: string
}

async function fetchFileList(
  projectId: string,
  token: string,
  ref: string,
  signal?: AbortSignal
): Promise<FileEntry[]> {
  const url = `${LOVABLE_API}/projects/${encodeURIComponent(projectId)}/git/files?ref=${encodeURIComponent(ref)}`

  const response = await fetch(url, {
    headers: { Authorization: token, Accept: 'application/json' },
    signal,
  })

  if (response.status === 401) {
    throw new Error('Authentication failed (401)')
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch file list: HTTP ${response.status}`)
  }

  const data = await response.json()
  if (!data?.files || !Array.isArray(data.files)) {
    throw new Error('Invalid files response')
  }

  return data.files
}

async function fetchAllFiles(
  projectId: string,
  files: FileEntry[],
  token: string,
  ref: string,
  onProgress?: (completed: number, total: number) => Promise<void>,
  signal?: AbortSignal
): Promise<Map<string, ArrayBuffer>> {
  const results = new Map<string, ArrayBuffer>()
  let completed = 0
  const total = files.length

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY)

    const batchResults = await Promise.allSettled(
      batch.map(async file => {
        const url = `${LOVABLE_API}/projects/${encodeURIComponent(projectId)}/git/file?path=${encodeURIComponent(file.path)}&ref=${encodeURIComponent(ref)}`

        const response = await fetch(url, {
          headers: { Authorization: token, Accept: '*/*' },
          signal,
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${file.path}`)
        }

        return { path: file.path, content: await response.arrayBuffer() }
      })
    )

    for (const result of batchResults) {
      completed++
      if (result.status === 'fulfilled') {
        results.set(result.value.path, result.value.content)
      } else {
        console.error('File download failed:', result.reason)
      }
      await updateProgressIcon(completed / total)
    }

    if (onProgress) {
      await onProgress(completed, total)
    }

    if (i + CONCURRENCY < files.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }

  return results
}

// --- Progress icon rendering via OffscreenCanvas ---

let cachedIconBitmap: ImageBitmap | null = null

async function getIconBitmap(): Promise<ImageBitmap> {
  if (cachedIconBitmap) return cachedIconBitmap
  const response = await fetch(chrome.runtime.getURL('images/128.png'))
  const blob = await response.blob()
  cachedIconBitmap = await createImageBitmap(blob)
  return cachedIconBitmap
}

function renderProgressIcon(icon: ImageBitmap, progress: number): ImageData {
  const SIZE = 128
  const canvas = new OffscreenCanvas(SIZE, SIZE)
  const ctx = canvas.getContext('2d')!

  const center = SIZE / 2
  const outerRadius = SIZE / 2 - 4
  const ringWidth = 12

  ctx.drawImage(icon, 0, 0, SIZE, SIZE)

  // Track ring
  ctx.beginPath()
  ctx.arc(center, center, outerRadius - ringWidth / 2, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
  ctx.lineWidth = ringWidth
  ctx.stroke()

  // Progress arc
  if (progress > 0) {
    ctx.beginPath()
    ctx.arc(
      center,
      center,
      outerRadius - ringWidth / 2,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.min(progress, 1)
    )
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = ringWidth
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  return ctx.getImageData(0, 0, SIZE, SIZE)
}

async function updateProgressIcon(progress: number): Promise<void> {
  const icon = await getIconBitmap()
  const imageData = renderProgressIcon(icon, progress)
  await chrome.action.setIcon({
    imageData: { 128: imageData } as unknown as Record<string, ImageData>,
  })
}

// --- Badge and icon helpers ---

function setBadge(text: string, color: string): void {
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color })
}

function resetIcon(): void {
  chrome.action.setBadgeText({ text: '' })
  chrome.action.setIcon({ path: DEFAULT_ICONS })
}
