import { createServer } from './server.js'
import { startCleanup, stopCleanup } from './services/session-store.js'

const PORT = parseInt(process.env['KANBAI_API_PORT'] ?? '3847', 10)
const HOST = process.env['KANBAI_API_HOST'] ?? '0.0.0.0'

startCleanup()

const server = createServer(PORT, HOST)

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
