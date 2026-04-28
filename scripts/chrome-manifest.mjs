import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))

const icons = {
  16: 'images/16.png',
  32: 'images/32.png',
  48: 'images/48.png',
  128: 'images/128.png',
}

export default {
  manifest_version: 3,
  name: 'Lovable Downloader',
  description: 'Download Lovable.dev project source code as ZIP',
  version: pkg.version,

  permissions: [
    'activeTab',
    'scripting',
    'storage',
    'webRequest',
    'downloads',
  ],

  host_permissions: [
    '*://api.lovable.dev/*',
  ],

  background: {
    service_worker: 'service-worker.js',
  },

  content_scripts: [{
    matches: ['*://lovable.dev/projects/*'],
    js: ['content-script.js'],
    run_at: 'document_idle',
  }],

  web_accessible_resources: [{
    resources: ['inject.js'],
    matches: ['*://lovable.dev/*'],
  }],

  action: {
    default_icon: icons,
    default_title: 'Lovable Downloader',
  },

  icons,
}
