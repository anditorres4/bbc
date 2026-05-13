import type { Response } from 'express'

type Client = { userId: string; roles: string[]; res: Response }

class AlertStream {
  private clients = new Map<string, Client>()

  addClient(userId: string, roles: string[], res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const client: Client = { userId, roles, res }
    this.clients.set(userId, client)

    this.send(client, 'connected', { message: 'Conectado al stream de alertas' })

    const heartbeat = setInterval(() => res.write(':ping\n\n'), 30_000)

    res.on('close', () => {
      clearInterval(heartbeat)
      this.clients.delete(userId)
    })
  }

  private send(client: Client, event: string, data: unknown): void {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  broadcast(event: string, data: unknown, targetRoles?: string[]): void {
    for (const client of this.clients.values()) {
      if (!targetRoles || client.roles.some(r => targetRoles.includes(r))) {
        this.send(client, event, data)
      }
    }
  }

  sendToUser(userId: string, event: string, data: unknown): void {
    const client = this.clients.get(userId)
    if (client) this.send(client, event, data)
  }

  size(): number {
    return this.clients.size
  }
}

export const alertStream = new AlertStream()
