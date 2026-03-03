import { app } from 'electron'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import os from 'os'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function getAssetsDir(): string {
  if (VITE_DEV_SERVER_URL) {
    return path.join(__dirname, '../../vendor/pixel-agents/webview-ui/public/assets')
  }
  // Prefer userData (runtime installs), fall back to bundled resources
  const userDataAssets = path.join(app.getPath('userData'), 'pixel-agents', 'assets')
  if (fsSync.existsSync(userDataAssets)) {
    return userDataAssets
  }
  return path.join(process.resourcesPath, 'pixel-agents', 'assets')
}

function getLayoutPath(): string {
  return path.join(os.homedir(), '.kanbai', 'pixel-agents', 'layout.json')
}

export interface PixelAgentsAssets {
  layout: unknown | null
  assetsAvailable: boolean
}

export async function loadPixelAgentsAssets(): Promise<PixelAgentsAssets> {
  const assetsDir = getAssetsDir()
  let assetsAvailable = false

  try {
    await fs.access(assetsDir)
    assetsAvailable = true
  } catch {
    assetsAvailable = false
  }

  let layout: unknown | null = null
  try {
    const layoutContent = await fs.readFile(getLayoutPath(), 'utf-8')
    layout = JSON.parse(layoutContent)
  } catch {
    // No saved layout — will use default
  }

  return { layout, assetsAvailable }
}
