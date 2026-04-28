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

// --- declarativeContent: enable icon only on lovable.dev/projects/* ---

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.disable()

  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostEquals: 'lovable.dev', pathPrefix: '/projects/' },
        }),
      ],
      actions: [new chrome.declarativeContent.ShowAction()],
    }])
  })
})

// --- webRequest: passively capture bearer token + git ref ---

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const url = new URL(details.url)

    const projectMatch = url.pathname.match(/\/projects\/([^/]+)/)
    if (!projectMatch) return
    const projectId = projectMatch[1]

    const authHeader = details.requestHeaders?.find(
      (h) => h.name.toLowerCase() === 'authorization',
    )
    if (authHeader?.value) {
      chrome.storage.local.set({ [`token:${projectId}`]: authHeader.value })
    }

    const ref = url.searchParams.get('ref')
    if (ref) {
      chrome.storage.local.set({ [`ref:${projectId}`]: ref })
    }
  },
  { urls: [`${LOVABLE_API}/*`] },
  ['requestHeaders', 'extraHeaders'],
)

// --- Message handler: receive token from content script fallback ---

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SUPABASE_TOKEN' && message.token) {
    chrome.storage.local.set({ fallbackToken: `Bearer ${message.token}` })
  }
})

// --- action.onClicked: orchestrate download ---

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || !tab.id) return

  const projectId = parseProjectId(tab.url)
  if (!projectId) {
    setBadge('ERR', '#F44336')
    return
  }

  try {
    let token = await resolveToken(projectId, tab.id)
    if (!token) {
      setBadge('AUTH', '#F44336')
      return
    }

    const ref = await resolveRef(projectId)

    setBadge('...', '#2196F3')

    let files: FileEntry[]
    try {
      files = await fetchFileList(projectId, token, ref)
    } catch (err) {
      // On 401, retry with fresh token from content script
      if (err instanceof Error && err.message.includes('401')) {
        await chrome.storage.local.remove([`token:${projectId}`, 'fallbackToken'])
        token = await requestTokenFromContentScript(tab.id, projectId)
        if (!token) throw new Error('Re-authentication failed')
        files = await fetchFileList(projectId, token, ref)
      } else {
        throw err
      }
    }

    console.log(`Found ${files.length} files`)

    const fileContents = await fetchAllFiles(projectId, files, token, ref)

    await updateProgressIcon(1)
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

    setBadge('OK', '#4CAF50')
    setTimeout(() => resetIcon(), 3000)
  } catch (err) {
    console.error('Download failed:', err)
    setBadge('ERR', '#F44336')
    setTimeout(() => resetIcon(), 5000)
  }
})

// --- URL parsing ---

function parseProjectId(url: string): string | null {
  const match = url.match(/lovable\.dev\/projects\/([a-f0-9-]+)/)
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

async function requestTokenFromContentScript(tabId: number, projectId: string): Promise<string | null> {
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
): Promise<FileEntry[]> {
  const url =
    `${LOVABLE_API}/projects/${encodeURIComponent(projectId)}/git/files?ref=${encodeURIComponent(ref)}`

  const response = await fetch(url, {
    headers: { Authorization: token, Accept: 'application/json' },
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
): Promise<Map<string, ArrayBuffer>> {
  const results = new Map<string, ArrayBuffer>()
  let completed = 0
  const total = files.length

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY)

    const batchResults = await Promise.allSettled(
      batch.map(async (file) => {
        const url =
          `${LOVABLE_API}/projects/${encodeURIComponent(projectId)}/git/file?path=${encodeURIComponent(file.path)}&ref=${encodeURIComponent(ref)}`

        const response = await fetch(url, {
          headers: { Authorization: token, Accept: '*/*' },
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${file.path}`)
        }

        return { path: file.path, content: await response.arrayBuffer() }
      }),
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

    if (i + CONCURRENCY < files.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }

  return results
}

// --- Progress icon rendering via OffscreenCanvas ---

function renderProgressIcon(progress: number): ImageData {
  const SIZE = 128
  const canvas = new OffscreenCanvas(SIZE, SIZE)
  const ctx = canvas.getContext('2d')!

  const center = SIZE / 2
  const outerRadius = SIZE / 2 - 4
  const ringWidth = 12

  // Background circle
  ctx.beginPath()
  ctx.arc(center, center, outerRadius, 0, Math.PI * 2)
  ctx.fillStyle = '#f0f0f0'
  ctx.fill()

  // Track ring
  ctx.beginPath()
  ctx.arc(center, center, outerRadius - ringWidth / 2, 0, Math.PI * 2)
  ctx.strokeStyle = '#d0d0d0'
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
      -Math.PI / 2 + Math.PI * 2 * Math.min(progress, 1),
    )
    ctx.strokeStyle = '#4CAF50'
    ctx.lineWidth = ringWidth
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  // Center percentage text
  const pct = Math.round(progress * 100)
  ctx.fillStyle = '#333'
  ctx.font = `bold ${pct === 100 ? 28 : 32}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${pct}%`, center, center)

  return ctx.getImageData(0, 0, SIZE, SIZE)
}

async function updateProgressIcon(progress: number): Promise<void> {
  const imageData = renderProgressIcon(progress)
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
