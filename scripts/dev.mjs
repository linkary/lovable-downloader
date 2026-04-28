import { context } from 'esbuild'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

async function run() {
  console.log('Running initial setup...')

  execSync('node scripts/chrome-prebuild.mjs', { cwd: root, stdio: 'inherit' })

  const iconSource = resolve(root, 'public/cactus-round.png')
  if (existsSync(iconSource)) {
    try {
      execSync('bash scripts/chrome-generate-image.sh', { cwd: root, stdio: 'inherit' })
    } catch {
      console.warn('Icon generation skipped (ImageMagick not available)')
    }
  }

  const ctx = await context({
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
    minify: false,
    sourcemap: true,
    logLevel: 'info',
  })

  await ctx.watch()
  console.log('Watching for changes...')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
