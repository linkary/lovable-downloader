# Lovable Downloader

[中文](./README.zh.md)

A Chrome extension for downloading [Lovable.dev](https://lovable.dev) project source code as a ZIP archive — instantly, with one click.

Lovable.dev supports exporting project source code, but it requires connecting a GitHub repository. This extension skips that entirely — click the icon, get a ZIP of your entire project in seconds. No GitHub, no setup, no waiting.

![](https://img.alicdn.com/imgextra/i1/O1CN01bPzMcU1XkBt6ZRgzh_!!6000000002961-1-tps-1248-664.gif)

## Install

### From Chrome Web Store (Recommended)

Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/lovable-downloader/cnemhgoighlimfpldmdiblekokblokho).

### From GitHub Releases

1. Download the latest `extension-*.zip` from [Releases](../../releases)
2. Unzip the file
3. Open `chrome://extensions`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the unzipped folder

### Build from source

```bash
npm install
npm run build
```

Load the `build/` directory as an unpacked extension in Chrome:

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `build/` folder

## Usage

1. Navigate to any project on [lovable.dev](https://lovable.dev)
2. Click the Lovable Downloader icon in the toolbar
3. Wait for the progress ring to complete
4. Save the ZIP file when prompted

To cancel a download in progress, click the icon again.

## Development

```bash
npm run dev
```

Watches for file changes and rebuilds automatically. Reload the extension in Chrome after each rebuild.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Watch mode with auto-rebuild |
| `npm run build` | Production build to `build/` |
| `npm run build:zip` | Build and package as `.zip` |
| `npm run typecheck` | TypeScript type checking |
| `bash scripts/trim-icon.sh [padding%]` | Trim icon padding (default 5%, max 40%) |

## Architecture

```
src/
  service-worker.ts    # Background service worker — API calls, download orchestration, progress icon
  content-script.ts    # Toast notification UI (Shadow DOM), token relay
  inject.ts            # Page-context script to read Supabase auth token from localStorage

scripts/
  build.mjs            # esbuild production build
  dev.mjs              # esbuild watch mode
  chrome-manifest.mjs  # Manifest v3 definition
  chrome-prebuild.mjs  # Copies manifest + static assets to build/
  chrome-generate-image.sh  # Generates icon sizes via ImageMagick
  chrome-zip.mjs       # Packages build/ as .zip
  trim-icon.sh         # Trims and pads the source icon

public/
  icon.png             # Extension icon (192x192, used as source for all sizes)
  icon-original.png    # Untouched original for idempotent trimming
```

## How It Works

1. The extension passively captures Lovable API auth tokens via `webRequest`
2. When the user clicks the extension icon on a Lovable project page, it:
   - Resolves authentication (intercepted token or Supabase localStorage fallback)
   - Fetches the project file list from the Lovable API
   - Downloads all files concurrently (batches of 5)
   - Bundles everything into a ZIP and triggers a browser download
3. Progress is shown via a circular ring on the extension icon and toast notifications

## License

MIT
