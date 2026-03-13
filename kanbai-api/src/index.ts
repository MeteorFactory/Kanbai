import { createServer } from './server.js'
import { startCleanup, stopCleanup } from './services/session-store.js'
import { registerDesktop } from './services/pairing-service.js'

const PORT = parseInt(process.env['KANBAI_API_PORT'] ?? '3847', 10)
const HOST = process.env['KANBAI_API_HOST'] ?? '0.0.0.0'

startCleanup()

const server = createServer(PORT, HOST)

// Dev mode: auto-register a session with a known code
const devCode = process.env['KANBAI_DEV_CODE']
const devWorkspace = process.env['KANBAI_DEV_WORKSPACE'] ?? 'default'
if (devCode) {
  try {
    const result = registerDesktop({ code: devCode, appId: 'desktop-dev', workspaceId: devWorkspace })
    console.log(`[DEV] Auto-registered session with code: ${devCode}, token: ${result.token}`)
  } catch (err) {
    console.error('[DEV] Failed to auto-register:', (err as Error).message)
  }
}

function shutdown(): void {
  console.log('\nShutting down...')
  stopCleanup()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
