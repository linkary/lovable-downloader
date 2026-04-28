import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))

function run() {
  execSync(`cd build && zip extension-${pkg.version}.zip -r ./`)
  console.log(`Packaged: build/extension-${pkg.version}.zip`)
}

run()
