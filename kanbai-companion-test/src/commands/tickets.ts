import type { ApiClient } from '../api-client.js'

export async function listTickets(client: ApiClient): Promise<void> {
  const { tickets } = await client.listTickets()
  if (tickets.length === 0) {
    console.log('No tickets found.')
    return
  }
  console.log(`\n${'ID'.padEnd(38)} ${'Status'.padEnd(10)} ${'Priority'.padEnd(10)} Title`)
  console.log('-'.repeat(90))
  for (const t of tickets) {
    console.log(`${t.id.padEnd(38)} ${t.status.padEnd(10)} ${(t.priority ?? '-').padEnd(10)} ${t.title}`)
  }
  console.log()
}

export async function getTicket(client: ApiClient, id: string): Promise<void> {
  const ticket = await client.getTicket(id)
  console.log(JSON.stringify(ticket, null, 2))
}

export async function createTicket(
  client: ApiClient,
  title: string,
  description?: string,
  priority?: string,
): Promise<void> {
  const ticket = await client.createTicket({ title, description, priority })
  console.log(`Created ticket: ${ticket.id} — ${ticket.title}`)
}

export async function updateTicket(client: ApiClient, id: string, data: Record<string, unknown>): Promise<void> {
  const ticket = await client.updateTicket(id, data)
  console.log(`Updated ticket: ${ticket.id} — ${ticket.title} [${ticket.status}]`)
}

export async function deleteTicket(client: ApiClient, id: string): Promise<void> {
  await client.deleteTicket(id)
  console.log(`Deleted ticket: ${id}`)
}
