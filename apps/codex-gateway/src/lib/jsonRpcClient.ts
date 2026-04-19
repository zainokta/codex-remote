export type JsonRpcMessage = {
  id?: string
  method?: string
  params?: unknown
  result?: unknown
  error?: { message?: string }
}

export type JsonRpcHandler = (message: JsonRpcMessage) => void

export class JsonRpcClient {
  private socket: WebSocket | null = null
  private requestId = 0
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()

  constructor(
    private readonly url: string,
    private readonly onNotification: JsonRpcHandler,
    private readonly onServerRequest: JsonRpcHandler,
  ) {}

  async connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return
    const socket = new WebSocket(this.url)
    this.socket = socket

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', (event) => reject(event), { once: true })
    })

    socket.addEventListener('message', async (event) => {
      const raw = typeof event.data === 'string'
        ? event.data
        : Buffer.from(await event.data.arrayBuffer()).toString('utf8')
      const message = JSON.parse(raw) as JsonRpcMessage

      if (message.id && message.method) {
        this.onServerRequest(message)
        return
      }

      if (message.method) {
        this.onNotification(message)
        return
      }

      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error.message ?? 'Unknown JSON-RPC error'))
        } else {
          pending.resolve(message.result)
        }
      }
    })
  }

  sendNotification(method: string, params?: unknown) {
    this.assertOpen()
    this.socket!.send(JSON.stringify({ method, params }))
  }

  request<T>(method: string, params: unknown) {
    this.assertOpen()
    const id = String(++this.requestId)
    this.socket!.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    })
  }

  respond(id: string, result: unknown) {
    this.assertOpen()
    this.socket!.send(JSON.stringify({ jsonrpc: '2.0', id, result }))
  }

  private assertOpen() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('JSON-RPC socket is not connected')
    }
  }
}
