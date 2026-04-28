export function parseProjectId(url: string): string | null {
  const match = url.match(
    /lovable\.dev\/projects\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/
  )
  return match?.[1] ?? null
}

export interface StorageLike {
  length: number
  key(index: number): string | null
  getItem(key: string): string | null
}

export function findSupabaseToken(storage: StorageLike): string | null {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key && /^sb-.*-auth-token$/.test(key)) {
      try {
        const raw = storage.getItem(key)
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
