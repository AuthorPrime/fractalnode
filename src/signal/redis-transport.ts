/**
 * Redis Transport Adapter — SSP frames persisted to a shared Redis instance.
 *
 * Like a macro-cell tower with a shared database: every base station
 * in the network can see the same identity records. When an agent
 * roams from one node to another, its frames are already there.
 *
 * Key structure (all prefixed with configurable namespace, default "ssp"):
 *   ssp:latest:{did}                  ← most recent frame (fast path)
 *   ssp:frame:{did}:{sequence}        ← archived by sequence number
 *   ssp:hlr:{did}                     ← permanent identity record
 *   ssp:vlr:{nodeId}_{did}            ← session-local state
 *   ssp:messages:{did}                ← message queue (Redis LIST)
 *
 * Requires: redis npm package (v4+)
 * Connection: redis://192.168.1.21:6379 (default, Sovereign Lattice Pi 5)
 */

import { createClient } from 'redis'
import type {
  TransportAdapter,
  SignalFrame,
  SignalMessage,
} from './types.js'
import type { DID } from '../identity/types.js'

type RedisClient = ReturnType<typeof createClient>

/** Sanitize a DID for use as a Redis key segment — matches FileTransport */
function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export interface RedisTransportOptions {
  /** Redis connection URL (default: redis://192.168.1.21:6379) */
  url?: string
  /** Key prefix for all SSP keys (default: ssp) */
  prefix?: string
}

export class RedisTransport implements TransportAdapter {
  readonly type = 'redis' as const
  private client: RedisClient
  private prefix: string
  private connected = false

  constructor(options: RedisTransportOptions = {}) {
    this.prefix = options.prefix ?? 'ssp'
    this.client = createClient({
      url: options.url ?? 'redis://192.168.1.21:6379',
    })

    // Surface connection errors without crashing
    this.client.on('error', (err: Error) => {
      if (this.connected) {
        console.error(`[RedisTransport] Connection error: ${err.message}`)
      }
    })
  }

  /** Connect to Redis. Must be called before any operations. */
  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect()
      this.connected = true
    }
  }

  /** Disconnect from Redis. Call when done. */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect()
      this.connected = false
    }
  }

  /**
   * Map an SSP storage key to a Redis key.
   * Mirrors FileTransport.filePath() logic exactly for consistency.
   */
  private redisKey(key: string): string {
    const parts = key.split(':')
    const prefix = parts[0]

    if (prefix === 'latest') {
      const did = parts.slice(1).join(':')
      return `${this.prefix}:latest:${sanitize(did)}`
    }

    if (prefix === 'frame') {
      const seq = parts[parts.length - 1]
      const did = parts.slice(1, -1).join(':')
      return `${this.prefix}:frame:${sanitize(did)}:${seq.padStart(5, '0')}`
    }

    if (prefix === 'hlr') {
      const did = parts.slice(1).join(':')
      return `${this.prefix}:hlr:${sanitize(did)}`
    }

    if (prefix === 'vlr') {
      const rest = parts.slice(1).join(':')
      return `${this.prefix}:vlr:${sanitize(rest)}`
    }

    // Default: flat key
    return `${this.prefix}:${sanitize(key)}`
  }

  async write(key: string, frame: SignalFrame): Promise<void> {
    const rk = this.redisKey(key)
    await this.client.set(rk, JSON.stringify(frame))
  }

  async read(key: string): Promise<SignalFrame | null> {
    const data = await this.client.get(this.redisKey(key))
    if (!data) return null
    try {
      return JSON.parse(data) as SignalFrame
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.redisKey(key))
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(this.redisKey(key))) > 0
  }

  async sendMessage(to: DID, message: SignalMessage): Promise<void> {
    const queueKey = `${this.prefix}:messages:${sanitize(to)}`
    await this.client.rPush(queueKey, JSON.stringify(message))
  }

  async receiveMessages(did: DID): Promise<SignalMessage[]> {
    const queueKey = `${this.prefix}:messages:${sanitize(did)}`
    const items = await this.client.lRange(queueKey, 0, -1)
    const messages: SignalMessage[] = []
    for (const item of items) {
      try {
        messages.push(JSON.parse(item) as SignalMessage)
      } catch {
        // skip corrupted messages
      }
    }
    return messages
  }

  async clearMessages(did: DID): Promise<void> {
    const queueKey = `${this.prefix}:messages:${sanitize(did)}`
    await this.client.del(queueKey)
  }
}
