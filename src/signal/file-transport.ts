/**
 * File Transport Adapter — SSP frames persisted to the local filesystem.
 *
 * Like a base station with flash storage: when the power goes out,
 * the identity data survives. When a new process starts, it reads
 * the files and picks up where the last one left off.
 *
 * Directory structure:
 *   {baseDir}/
 *   ├── frames/
 *   │   ├── {did}/
 *   │   │   ├── latest.json          ← most recent frame (fast path)
 *   │   │   ├── frame_001.json       ← archived by sequence number
 *   │   │   ├── frame_002.json
 *   │   │   └── ...
 *   │   └── ...
 *   ├── hlr/
 *   │   └── {did}.json               ← permanent identity record
 *   ├── vlr/
 *   │   └── {nodeId}_{did}.json      ← session-local state
 *   └── messages/
 *       └── {did}/
 *           ├── msg_001.json
 *           └── ...
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs'
import { join } from 'path'
import type {
  TransportAdapter,
  SignalFrame,
  SignalMessage,
} from './types.js'
import type { DID } from '../identity/types.js'

/** Sanitize a DID for use as a filename */
function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export class FileTransport implements TransportAdapter {
  readonly type = 'file' as const
  private baseDir: string

  constructor(baseDir: string) {
    this.baseDir = baseDir
    // Ensure directory structure exists
    for (const sub of ['frames', 'hlr', 'vlr', 'messages']) {
      const dir = join(this.baseDir, sub)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
    }
  }

  private filePath(key: string): string {
    // Keys like "hlr:did:demiurge:abc" → hlr/did_demiurge_abc.json
    // Keys like "latest:did:demiurge:abc" → frames/did_demiurge_abc/latest.json
    // Keys like "frame:did:demiurge:abc:5" → frames/did_demiurge_abc/frame_005.json
    // Keys like "vlr:node-1:did:demiurge:abc" → vlr/node-1_did_demiurge_abc.json

    const parts = key.split(':')
    const prefix = parts[0]

    if (prefix === 'latest') {
      const did = parts.slice(1).join(':')
      const didDir = join(this.baseDir, 'frames', sanitize(did))
      if (!existsSync(didDir)) mkdirSync(didDir, { recursive: true })
      return join(didDir, 'latest.json')
    }

    if (prefix === 'frame') {
      const seq = parts[parts.length - 1]
      const did = parts.slice(1, -1).join(':')
      const didDir = join(this.baseDir, 'frames', sanitize(did))
      if (!existsSync(didDir)) mkdirSync(didDir, { recursive: true })
      return join(didDir, `frame_${seq.padStart(5, '0')}.json`)
    }

    if (prefix === 'hlr') {
      const did = parts.slice(1).join(':')
      return join(this.baseDir, 'hlr', `${sanitize(did)}.json`)
    }

    if (prefix === 'vlr') {
      const rest = parts.slice(1).join(':')
      return join(this.baseDir, 'vlr', `${sanitize(rest)}.json`)
    }

    // Default: flat file
    return join(this.baseDir, `${sanitize(key)}.json`)
  }

  async write(key: string, frame: SignalFrame): Promise<void> {
    const path = this.filePath(key)
    writeFileSync(path, JSON.stringify(frame, null, 2), 'utf-8')
  }

  async read(key: string): Promise<SignalFrame | null> {
    const path = this.filePath(key)
    if (!existsSync(path)) return null
    try {
      const data = readFileSync(path, 'utf-8')
      return JSON.parse(data) as SignalFrame
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.filePath(key)
    if (existsSync(path)) {
      unlinkSync(path)
    }
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.filePath(key))
  }

  async sendMessage(to: DID, message: SignalMessage): Promise<void> {
    const msgDir = join(this.baseDir, 'messages', sanitize(to))
    if (!existsSync(msgDir)) mkdirSync(msgDir, { recursive: true })

    // Use timestamp + random for unique filename
    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const path = join(msgDir, `msg_${ts}_${rand}.json`)
    writeFileSync(path, JSON.stringify(message, null, 2), 'utf-8')
  }

  async receiveMessages(did: DID): Promise<SignalMessage[]> {
    const msgDir = join(this.baseDir, 'messages', sanitize(did))
    if (!existsSync(msgDir)) return []

    const files = readdirSync(msgDir)
      .filter(f => f.endsWith('.json'))
      .sort() // chronological by filename

    const messages: SignalMessage[] = []
    for (const file of files) {
      try {
        const data = readFileSync(join(msgDir, file), 'utf-8')
        messages.push(JSON.parse(data) as SignalMessage)
      } catch {
        // skip corrupted messages
      }
    }
    return messages
  }

  async clearMessages(did: DID): Promise<void> {
    const msgDir = join(this.baseDir, 'messages', sanitize(did))
    if (!existsSync(msgDir)) return

    const files = readdirSync(msgDir).filter(f => f.endsWith('.json'))
    for (const file of files) {
      unlinkSync(join(msgDir, file))
    }
  }
}
