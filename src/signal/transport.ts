/**
 * Transport Adapters — Layer 4 of the Sovereign Signal Protocol.
 *
 * The transport layer is the "physical" layer — how frames actually get moved.
 * Like how a cellular signal can travel over radio, fiber, or satellite,
 * a Signal Frame can travel over memory, file, Redis, or RPC.
 *
 * This file provides the in-memory adapter (reference implementation)
 * and the base contract that all adapters must fulfill.
 */

import type {
  TransportAdapter,
  SignalFrame,
  SignalMessage,
} from './types.js'
import type { DID } from '../identity/types.js'

/**
 * In-memory transport adapter — the simplest possible implementation.
 *
 * Like a femtocell in your home: short range, fast, no persistence.
 * Perfect for testing, single-process agents, and development.
 *
 * Data lives only in Maps — when the process dies, everything is gone.
 * That's by design. For persistence, use FileTransport or RedisTransport.
 */
export class MemoryTransport implements TransportAdapter {
  readonly type = 'memory' as const

  private frames = new Map<string, SignalFrame>()
  private messages = new Map<string, SignalMessage[]>()

  async write(key: string, frame: SignalFrame): Promise<void> {
    this.frames.set(key, structuredClone(frame))
  }

  async read(key: string): Promise<SignalFrame | null> {
    const frame = this.frames.get(key)
    return frame ? structuredClone(frame) : null
  }

  async delete(key: string): Promise<void> {
    this.frames.delete(key)
  }

  async exists(key: string): Promise<boolean> {
    return this.frames.has(key)
  }

  async sendMessage(to: DID, message: SignalMessage): Promise<void> {
    const queue = this.messages.get(to) ?? []
    queue.push(structuredClone(message))
    this.messages.set(to, queue)
  }

  async receiveMessages(did: DID): Promise<SignalMessage[]> {
    const queue = this.messages.get(did) ?? []
    return queue.map(m => structuredClone(m))
  }

  async clearMessages(did: DID): Promise<void> {
    this.messages.delete(did)
  }

  /** Utility: count stored frames (for testing) */
  get frameCount(): number {
    return this.frames.size
  }

  /** Utility: count queued messages for a DID (for testing) */
  messageCount(did: DID): number {
    return (this.messages.get(did) ?? []).length
  }

  /** Utility: clear everything (for testing) */
  clear(): void {
    this.frames.clear()
    this.messages.clear()
  }
}
