import { build } from 'esbuild'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const isProduction = process.env.NODE_ENV === 'production'

async function run() {
  console.log(`Building in ${isProduction ? 'production' : 'development'} mode...`)

  await build({
    entryPoints: [
      resolve(root, 'src/service-worker.ts'),
      resolve(root, 'src/content-script.ts'),
      resolve(root, 'src/inject.ts'),
    ],
    outdir: resolve(root, 'build'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    minify: isProduction,
    sourcemap: !isProduction,
    logLevel: 'info',
  })

  // Generate manifest
  execSync('node scripts/chrome-prebuild.mjs', { cwd: root, stdio: 'inherit' })

  // Generate icons if ImageMagick is available and source icon exists
  const iconSource = resolve(root, 'public/icon.png')
  if (existsSync(iconSource)) {
    try {
      execSync('bash scripts/chrome-generate-image.sh', { cwd: root, stdio: 'inherit' })
    } catch {
      console.warn('Icon generation skipped (ImageMagick not available)')
    }
  } else {
    console.warn('Icon source not found, skipping icon generation')
  }

  console.log('Build complete.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
