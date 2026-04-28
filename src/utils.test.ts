import { describe, it, expect } from 'vitest'
import { parseProjectId, findSupabaseToken, StorageLike } from './utils'

describe('parseProjectId', () => {
  it('extracts UUID from valid lovable.dev project URL', () => {
    expect(
      parseProjectId('https://lovable.dev/projects/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    ).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
  })

  it('extracts UUID when URL has extra path segments', () => {
    expect(
      parseProjectId('https://lovable.dev/projects/a1b2c3d4-e5f6-7890-abcd-ef1234567890/settings')
    ).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
  })

  it('returns null for non-lovable.dev URL', () => {
    expect(
      parseProjectId('https://example.com/projects/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    ).toBeNull()
  })

  it('returns null when UUID format is invalid', () => {
    expect(parseProjectId('https://lovable.dev/projects/not-a-uuid')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseProjectId('')).toBeNull()
  })
})

function createMockStorage(entries: Record<string, string>): StorageLike {
  const keys = Object.keys(entries)
  return {
    length: keys.length,
    key: (i: number) => keys[i] ?? null,
    getItem: (key: string) => entries[key] ?? null,
  }
}

describe('findSupabaseToken', () => {
  it('returns access_token from matching sb-*-auth-token key', () => {
    const storage = createMockStorage({
      'sb-myproject-auth-token': JSON.stringify({ access_token: 'my-token-123' }),
    })
    expect(findSupabaseToken(storage)).toBe('my-token-123')
  })

  it('finds correct key among multiple entries', () => {
    const storage = createMockStorage({
      'unrelated-key': 'some-value',
      'sb-proj-auth-token': JSON.stringify({ access_token: 'found-it' }),
      'another-key': 'another-value',
    })
    expect(findSupabaseToken(storage)).toBe('found-it')
  })

  it('returns null when matching key has invalid JSON', () => {
    const storage = createMockStorage({
      'sb-proj-auth-token': 'not-json{{{',
    })
    expect(findSupabaseToken(storage)).toBeNull()
  })

  it('returns null when parsed object has no access_token', () => {
    const storage = createMockStorage({
      'sb-proj-auth-token': JSON.stringify({ refresh_token: 'abc' }),
    })
    expect(findSupabaseToken(storage)).toBeNull()
  })

  it('returns null for empty storage', () => {
    const storage = createMockStorage({})
    expect(findSupabaseToken(storage)).toBeNull()
  })
})
