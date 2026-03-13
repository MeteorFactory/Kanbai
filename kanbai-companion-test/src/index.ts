import readline from 'readline'
import { ApiClient } from './api-client.js'
import { runCompanionConnect, runCheckStatus } from './commands/pair.js'
import { listTickets, getTicket, createTicket, updateTicket, deleteTicket } from './commands/tickets.js'

const client = new ApiClient(
  process.env['KANBAI_API_HOST'] ?? 'localhost',
  parseInt(process.env['KANBAI_API_PORT'] ?? '3847', 10),
)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

function printMenu(): void {
  console.log(`
=== Kanbai Companion Test CLI ===
  1. Connect with pairing code
  2. Check pairing status
  3. Connect WebSocket
  ---
  4. List tickets
  5. Get ticket by ID
  6. Create ticket
  7. Update ticket
  8. Delete ticket
  ---
  0. Quit
`)
}

async function handleChoice(choice: string): Promise<boolean> {
  switch (choice.trim()) {
    case '1': {
      const code = await prompt('Pairing code: ')
      await runCompanionConnect(client, code.trim())
      break
    }
    case '2': {
      const code = await prompt('Pairing code: ')
      await runCheckStatus(client, code.trim())
      break
    }
    case '3': {
      await client.connectWebSocket((msg) => {
        console.log('[WS]', JSON.stringify(msg))
      })
      console.log('WebSocket connected.')
      break
    }
    case '4':
      await listTickets(client)
      break
    case '5': {
      const id = await prompt('Ticket ID: ')
      await getTicket(client, id.trim())
      break
    }
    case '6': {
      const title = await prompt('Title: ')
      const desc = await prompt('Description (optional): ')
      const prio = await prompt('Priority (low/medium/high/critical, optional): ')
      await createTicket(client, title.trim(), desc.trim() || undefined, prio.trim() || undefined)
      break
    }
    case '7': {
      const id = await prompt('Ticket ID: ')
      const field = await prompt('Field to update (title/status/priority/description): ')
      const value = await prompt('New value: ')
      await updateTicket(client, id.trim(), { [field.trim()]: value.trim() })
      break
    }
    case '8': {
      const id = await prompt('Ticket ID: ')
      await deleteTicket(client, id.trim())
      break
    }
    case '0':
      client.disconnect()
      rl.close()
      return false
    default:
      console.log('Invalid choice.')
  }
  return true
}

async function main(): Promise<void> {
  console.log('Kanbai Companion Test CLI')

  // Auto-connect in dev mode
  const devCode = process.env['KANBAI_DEV_CODE']
  if (devCode) {
    console.log(`[DEV] Auto-connecting with code: ${devCode}`)
    const connected = await runCompanionConnect(client, devCode)
    if (connected) {
      try {
        await client.connectWebSocket((msg) => {
          console.log('[WS]', JSON.stringify(msg))
        })
        console.log('[DEV] WebSocket connected.')
      } catch (err) {
        console.error('[DEV] WebSocket failed:', (err as Error).message)
      }
    }
  }

  let running = true
  while (running) {
    printMenu()
    const choice = await prompt('Choice: ')
    try {
      running = await handleChoice(choice)
    } catch (err) {
      console.error('Error:', (err as Error).message)
    }
  }
}

main()
