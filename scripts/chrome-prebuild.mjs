import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

import manifest from './chrome-manifest.mjs'

const dest = resolve(__dirname, '../build/manifest.json')

mkdirSync(dirname(dest), { recursive: true })
writeFileSync(dest, JSON.stringify(manifest, null, 2))

console.log('Manifest written to build/manifest.json')
