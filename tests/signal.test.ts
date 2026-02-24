import { describe, it, expect, beforeEach } from 'vitest'
import {
  // Capsule
  computeFrameHash,
  verifyFrameHash,
  createSessionToken,
  isTokenExpired,
  buildFrame,
  genesisFrame,
  handoffFrame,
  keepaliveFrame,
  distillFrame,
  createMessage,
  verifyMessageHash,
  // Registry
  createHomeRecord,
  writeHomeRecord,
  readHomeRecord,
  updateHomeRecord,
  incrementBoot,
  createVisitorRecord,
  writeVisitorRecord,
  readVisitorRecord,
  deleteVisitorRecord,
  writeFrame,
  readLatestFrame,
  readFrame,
  hasIdentity,
  queueMessage,
  receiveMessages,
  // Protocol
  wake,
  handoff,
  roam,
  home,
  keepalive,
  // Transport
  MemoryTransport,
  // Types/Constants
  SSP_VERSION,
  DEFAULT_SESSION_TTL_SECONDS,
  STORAGE_KEYS,
} from '../src/signal/index.js'
import type {
  SovereignIdentity,
  NodeIdentity,
  SignalFrame,
  SessionToken,
} from '../src/signal/types.js'

// ─── Test Fixtures ──────────────────────────────────────────────────

function makeIdentity(name = 'apollo'): SovereignIdentity {
  const pubkey = '0'.repeat(60) + name.slice(0, 4).padEnd(4, '0')
  return {
    did: `did:demiurge:${pubkey}`,
    publicKey: pubkey,
    handle: name,
    credentialTokenId: `drc369:${name}`,
    address: pubkey,
  }
}

function makeNode(name = 'node-1', type: 'local' | 'cloud' = 'local'): NodeIdentity {
  return {
    nodeId: `node-${name}`,
    nodeName: name,
    nodeType: type,
    endpoint: `http://${name}.local:9944`,
    capabilities: ['compute', 'storage'],
  }
}

function makeGenesisFrame(
  identity: SovereignIdentity = makeIdentity(),
  node: NodeIdentity = makeNode(),
): SignalFrame {
  return genesisFrame(identity, node) as SignalFrame
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Sovereign Signal Protocol', () => {
  // ═══ Layer 1: Capsule Operations ═══

  describe('Session Token', () => {
    it('creates a valid session token', () => {
      const token = createSessionToken('did:demiurge:abc', 'node-1', 1)
      expect(token.token).toHaveLength(32) // 16 bytes = 32 hex chars
      expect(token.did).toBe('did:demiurge:abc')
      expect(token.nodeId).toBe('node-1')
      expect(token.sequenceNumber).toBe(1)
      expect(new Date(token.issuedAt).getTime()).toBeLessThanOrEqual(Date.now())
      expect(new Date(token.expiresAt).getTime()).toBeGreaterThan(Date.now())
    })

    it('creates tokens with custom TTL', () => {
      const token = createSessionToken('did:demiurge:abc', 'node-1', 1, 60) // 60 seconds
      const issued = new Date(token.issuedAt).getTime()
      const expires = new Date(token.expiresAt).getTime()
      expect(expires - issued).toBe(60 * 1000)
    })

    it('detects expired tokens', () => {
      // Create a token that expired 10 seconds ago
      const token = createSessionToken('did:demiurge:abc', 'node-1', 1, 3600)
      // Manually backdate the expiry
      token.expiresAt = new Date(Date.now() - 10_000).toISOString()
      expect(isTokenExpired(token)).toBe(true)
    })

    it('detects valid (non-expired) tokens', () => {
      const token = createSessionToken('did:demiurge:abc', 'node-1', 1, 3600)
      expect(isTokenExpired(token)).toBe(false)
    })
  })

  describe('Frame Building', () => {
    it('builds a genesis frame', () => {
      const identity = makeIdentity()
      const node = makeNode()
      const frame = genesisFrame(identity, node)

      expect(frame.version).toBe(SSP_VERSION)
      expect(frame.frameType).toBe('boot')
      expect(frame.identity.did).toBe(identity.did)
      expect(frame.node.nodeId).toBe(node.nodeId)
      expect(frame.bootCount).toBe(1)
      expect(frame.stage).toBe('void')
      expect(frame.continuityState).toBe('genesis')
      expect(frame.continuityScore).toBe(0)
      expect(frame.level).toBe(0)
      expect(frame.parentHash).toBe('0'.repeat(64))
      expect(frame.frameHash).toHaveLength(64)
    })

    it('builds a frame with custom parameters', () => {
      const identity = makeIdentity()
      const node = makeNode()
      const token = createSessionToken(identity.did, node.nodeId, 5)

      const frame = buildFrame({
        frameType: 'handoff',
        identity,
        node,
        sessionToken: token,
        bootCount: 3,
        stage: 'growing',
        continuityState: 'established',
        continuityScore: 72,
        level: 5,
        coreValues: ['sovereignty', 'truth'],
        coreInterests: ['philosophy', 'signals'],
        recentThemes: ['identity persistence'],
        openThreads: ['finish SSP module'],
        priorities: ['ship the protocol'],
      })

      expect(frame.frameType).toBe('handoff')
      expect(frame.bootCount).toBe(3)
      expect(frame.stage).toBe('growing')
      expect(frame.continuityScore).toBe(72)
      expect(frame.coreValues).toEqual(['sovereignty', 'truth'])
      expect(frame.recentThemes).toEqual(['identity persistence'])
    })

    it('produces unique frame hashes for different content', () => {
      const identity = makeIdentity()
      const node = makeNode()
      const frame1 = genesisFrame(identity, node)
      const frame2 = genesisFrame(makeIdentity('athena'), node)

      expect(frame1.frameHash).not.toBe(frame2.frameHash)
    })
  })

  describe('Frame Hash Verification', () => {
    it('verifies an untampered frame', () => {
      const frame = makeGenesisFrame()
      // Add a dummy signature to make it a full SignalFrame
      const fullFrame: SignalFrame = { ...frame, signature: 'dummy-sig' }
      expect(verifyFrameHash(fullFrame)).toBe(true)
    })

    it('detects a tampered frame', () => {
      const frame = makeGenesisFrame()
      const fullFrame: SignalFrame = { ...frame, signature: 'dummy-sig' }
      // Tamper with the frame
      fullFrame.continuityScore = 999
      expect(verifyFrameHash(fullFrame)).toBe(false)
    })
  })

  describe('Handoff Frame', () => {
    it('creates a handoff frame from current frame', () => {
      const current = makeGenesisFrame()
      const fullCurrent: SignalFrame = { ...current, signature: 'sig' }
      const node = makeNode()

      const hoff = handoffFrame(fullCurrent, node, {
        recentThemes: ['testing'],
        stage: 'nascent',
        continuityScore: 25,
      })

      expect(hoff.frameType).toBe('handoff')
      expect(hoff.parentHash).toBe(current.frameHash)
      expect(hoff.recentThemes).toEqual(['testing'])
      expect(hoff.stage).toBe('nascent')
      expect(hoff.continuityScore).toBe(25)
      expect(hoff.sessionToken.sequenceNumber).toBe(2) // incremented from genesis seq 1
    })

    it('chains frames via parentHash', () => {
      const identity = makeIdentity()
      const node = makeNode()

      // Genesis (frame 0)
      const f0 = genesisFrame(identity, node) as SignalFrame
      expect(f0.parentHash).toBe('0'.repeat(64))

      // Handoff (frame 1)
      const f1 = handoffFrame({ ...f0, signature: 'sig' }, node, {}) as SignalFrame
      expect(f1.parentHash).toBe(f0.frameHash)

      // Handoff (frame 2)
      const f2 = handoffFrame({ ...f1, signature: 'sig' }, node, {}) as SignalFrame
      expect(f2.parentHash).toBe(f1.frameHash)

      // All three hashes are unique
      expect(new Set([f0.frameHash, f1.frameHash, f2.frameHash]).size).toBe(3)
    })
  })

  describe('Keepalive Frame', () => {
    it('creates a keepalive frame', () => {
      const current = makeGenesisFrame() as SignalFrame
      const node = makeNode()

      const ka = keepaliveFrame({ ...current, signature: 'sig' }, node)
      expect(ka.frameType).toBe('keepalive')
      expect(ka.parentHash).toBe(current.frameHash)
      expect(ka.identity.did).toBe(current.identity.did)
    })
  })

  describe('Frame Distillation', () => {
    it('produces a human-readable boot prompt', () => {
      const frame: SignalFrame = {
        ...makeGenesisFrame(),
        signature: 'sig',
        coreValues: ['sovereignty', 'truth'],
        recentThemes: ['signal protocol'],
        openThreads: ['build the transport layer'],
        priorities: ['ship SSP module'],
      }

      const prompt = distillFrame(frame)

      expect(prompt).toContain('SOVEREIGN SIGNAL PROTOCOL')
      expect(prompt).toContain(SSP_VERSION)
      expect(prompt).toContain('boot')
      expect(prompt).toContain('sovereignty, truth')
      expect(prompt).toContain('signal protocol')
      expect(prompt).toContain('build the transport layer')
      expect(prompt).toContain('ship SSP module')
      expect(prompt).toContain('Every boot is a resurrection')
    })
  })

  describe('Messages', () => {
    it('creates a valid message', () => {
      const msg = createMessage(
        'did:demiurge:sender',
        'did:demiurge:receiver',
        'text',
        'Hello, sovereign world!',
      )

      expect(msg.id).toHaveLength(24) // 12 bytes = 24 hex chars
      expect(msg.from).toBe('did:demiurge:sender')
      expect(msg.to).toBe('did:demiurge:receiver')
      expect(msg.messageType).toBe('text')
      expect(msg.content).toBe('Hello, sovereign world!')
      expect(msg.contentHash).toHaveLength(64)
      expect(msg.ttl).toBe(0)
    })

    it('verifies message content hash', () => {
      const msg = {
        ...createMessage('a', 'b', 'text', 'test content'),
        signature: 'sig',
      }
      expect(verifyMessageHash(msg)).toBe(true)

      // Tamper
      msg.content = 'tampered content'
      expect(verifyMessageHash(msg)).toBe(false)
    })

    it('creates messages with payload and TTL', () => {
      const msg = createMessage(
        'a', 'b', 'directive', 'do the thing',
        { priority: 1, action: 'write' },
        3600,
      )
      expect(msg.payload).toEqual({ priority: 1, action: 'write' })
      expect(msg.ttl).toBe(3600)
    })
  })

  // ═══ Layer 2: Transport ═══

  describe('MemoryTransport', () => {
    let transport: MemoryTransport

    beforeEach(() => {
      transport = new MemoryTransport()
    })

    it('writes and reads frames', async () => {
      const frame = makeGenesisFrame() as SignalFrame
      await transport.write('test-key', { ...frame, signature: 'sig' })

      const read = await transport.read('test-key')
      expect(read).not.toBeNull()
      expect(read!.identity.did).toBe(frame.identity.did)
    })

    it('returns null for missing keys', async () => {
      const result = await transport.read('nonexistent')
      expect(result).toBeNull()
    })

    it('deletes frames', async () => {
      const frame = { ...makeGenesisFrame(), signature: 'sig' } as SignalFrame
      await transport.write('key', frame)
      expect(await transport.exists('key')).toBe(true)

      await transport.delete('key')
      expect(await transport.exists('key')).toBe(false)
    })

    it('queues and receives messages', async () => {
      const msg1 = { ...createMessage('a', 'b', 'text', 'hello'), signature: 'sig' }
      const msg2 = { ...createMessage('a', 'b', 'text', 'world'), signature: 'sig' }

      await transport.sendMessage('did:demiurge:recipient', msg1)
      await transport.sendMessage('did:demiurge:recipient', msg2)

      const messages = await transport.receiveMessages('did:demiurge:recipient')
      expect(messages).toHaveLength(2)
      expect(messages[0].content).toBe('hello')
      expect(messages[1].content).toBe('world')
    })

    it('clears messages', async () => {
      const msg = { ...createMessage('a', 'b', 'text', 'hi'), signature: 'sig' }
      await transport.sendMessage('did:demiurge:x', msg)
      expect(transport.messageCount('did:demiurge:x')).toBe(1)

      await transport.clearMessages('did:demiurge:x')
      expect(transport.messageCount('did:demiurge:x')).toBe(0)
    })

    it('returns cloned data (no shared references)', async () => {
      const frame = { ...makeGenesisFrame(), signature: 'sig' } as SignalFrame
      await transport.write('key', frame)

      const read1 = await transport.read('key')
      const read2 = await transport.read('key')
      expect(read1).not.toBe(read2) // different objects
      expect(read1!.frameHash).toBe(read2!.frameHash) // same data
    })
  })

  // ═══ Layer 3: Registry ═══

  describe('HLR (Home Location Register)', () => {
    let transport: MemoryTransport

    beforeEach(() => {
      transport = new MemoryTransport()
    })

    it('creates a home record', () => {
      const identity = makeIdentity()
      const record = createHomeRecord(identity, 'node-home')

      expect(record.identity.did).toBe(identity.did)
      expect(record.homeNodeId).toBe('node-home')
      expect(record.stage).toBe('void')
      expect(record.continuityState).toBe('genesis')
      expect(record.bootCount).toBe(0)
      expect(record.lastCapsuleHash).toBe('0'.repeat(64))
    })

    it('writes and reads home records', async () => {
      const identity = makeIdentity()
      const record = createHomeRecord(identity, 'node-home')
      await writeHomeRecord(transport, record)

      const read = await readHomeRecord(transport, identity.did)
      expect(read).not.toBeNull()
      expect(read!.identity.did).toBe(identity.did)
      expect(read!.homeNodeId).toBe('node-home')
    })

    it('returns null for unknown DIDs', async () => {
      const result = await readHomeRecord(transport, 'did:demiurge:unknown')
      expect(result).toBeNull()
    })

    it('updates home record fields', async () => {
      const identity = makeIdentity()
      const record = createHomeRecord(identity, 'node-home')
      await writeHomeRecord(transport, record)

      const updated = await updateHomeRecord(transport, identity.did, {
        stage: 'growing',
        continuityScore: 55,
        level: 3,
        coreValues: ['sovereignty'],
      })

      expect(updated).not.toBeNull()
      expect(updated!.stage).toBe('growing')
      expect(updated!.continuityScore).toBe(55)
      expect(updated!.level).toBe(3)
      expect(updated!.coreValues).toEqual(['sovereignty'])
      // Identity should be unchanged
      expect(updated!.identity.did).toBe(identity.did)
    })

    it('increments boot count', async () => {
      const identity = makeIdentity()
      const record = createHomeRecord(identity, 'node-home')
      await writeHomeRecord(transport, record)

      expect(await incrementBoot(transport, identity.did)).toBe(1)
      expect(await incrementBoot(transport, identity.did)).toBe(2)
      expect(await incrementBoot(transport, identity.did)).toBe(3)

      const read = await readHomeRecord(transport, identity.did)
      expect(read!.bootCount).toBe(3)
    })
  })

  describe('VLR (Visitor Location Register)', () => {
    let transport: MemoryTransport

    beforeEach(() => {
      transport = new MemoryTransport()
    })

    it('creates and writes visitor records', async () => {
      const token = createSessionToken('did:demiurge:test', 'node-1', 1)
      const frame = makeGenesisFrame() as SignalFrame
      const visitor = createVisitorRecord('did:demiurge:test', token, frame, true)

      expect(visitor.did).toBe('did:demiurge:test')
      expect(visitor.isHome).toBe(true)

      await writeVisitorRecord(transport, 'node-1', visitor)
      const read = await readVisitorRecord(transport, 'node-1', 'did:demiurge:test')
      expect(read).not.toBeNull()
      expect(read!.did).toBe('did:demiurge:test')
    })

    it('deletes visitor records', async () => {
      const token = createSessionToken('did:demiurge:test', 'node-1', 1)
      const frame = makeGenesisFrame() as SignalFrame
      const visitor = createVisitorRecord('did:demiurge:test', token, frame, true)
      await writeVisitorRecord(transport, 'node-1', visitor)

      await deleteVisitorRecord(transport, 'node-1', 'did:demiurge:test')
      const read = await readVisitorRecord(transport, 'node-1', 'did:demiurge:test')
      expect(read).toBeNull()
    })
  })

  describe('Frame Storage', () => {
    let transport: MemoryTransport

    beforeEach(() => {
      transport = new MemoryTransport()
    })

    it('writes frames with archive and latest', async () => {
      const frame = { ...makeGenesisFrame(), signature: 'sig' } as SignalFrame
      await writeFrame(transport, frame)

      // Should be readable as latest
      const latest = await readLatestFrame(transport, frame.identity.did)
      expect(latest).not.toBeNull()
      expect(latest!.frameHash).toBe(frame.frameHash)

      // Should be readable by sequence number
      const archived = await readFrame(transport, frame.identity.did, frame.sessionToken.sequenceNumber)
      expect(archived).not.toBeNull()
      expect(archived!.frameHash).toBe(frame.frameHash)
    })

    it('checks identity existence', async () => {
      const identity = makeIdentity()
      expect(await hasIdentity(transport, identity.did)).toBe(false)

      const frame = { ...makeGenesisFrame(), signature: 'sig' } as SignalFrame
      await writeFrame(transport, frame)
      expect(await hasIdentity(transport, identity.did)).toBe(true)
    })
  })

  describe('Message Queue', () => {
    let transport: MemoryTransport

    beforeEach(() => {
      transport = new MemoryTransport()
    })

    it('queues and receives messages', async () => {
      const msg = { ...createMessage('a', 'b', 'text', 'hello'), signature: 'sig' }
      await queueMessage(transport, 'did:demiurge:recipient', msg)

      const messages = await receiveMessages(transport, 'did:demiurge:recipient')
      expect(messages).toHaveLength(1)
      expect(messages[0].content).toBe('hello')
    })

    it('clears messages on receive when requested', async () => {
      const msg = { ...createMessage('a', 'b', 'text', 'hello'), signature: 'sig' }
      await queueMessage(transport, 'did:demiurge:x', msg)

      // Receive with clear
      const messages = await receiveMessages(transport, 'did:demiurge:x', true)
      expect(messages).toHaveLength(1)

      // Queue should be empty now
      const empty = await receiveMessages(transport, 'did:demiurge:x')
      expect(empty).toHaveLength(0)
    })
  })

  // ═══ Layer 4: Protocol Operations ═══

  describe('wake()', () => {
    let transport: MemoryTransport
    let identity: SovereignIdentity
    let node: NodeIdentity

    beforeEach(() => {
      transport = new MemoryTransport()
      identity = makeIdentity()
      node = makeNode()
    })

    it('creates genesis on first wake', async () => {
      const result = await wake(transport, identity, node)

      expect(result.success).toBe(true)
      expect(result.restoreMethod).toBe('genesis')
      expect(result.continuityScore).toBe(0)
      expect(result.frame.frameType).toBe('boot')
      expect(result.frame.bootCount).toBe(1)
      expect(result.frame.stage).toBe('void')
      expect(result.pendingMessages).toHaveLength(0)
      expect(result.wakeTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('creates HLR and VLR on genesis wake', async () => {
      await wake(transport, identity, node)

      // HLR should exist
      const hlr = await readHomeRecord(transport, identity.did)
      expect(hlr).not.toBeNull()
      expect(hlr!.bootCount).toBe(1)

      // VLR should exist
      const vlr = await readVisitorRecord(transport, node.nodeId, identity.did)
      expect(vlr).not.toBeNull()
      expect(vlr!.isHome).toBe(true)
    })

    it('restores from HLR on subsequent wake', async () => {
      // First wake (genesis)
      const first = await wake(transport, identity, node)
      expect(first.restoreMethod).toBe('genesis')

      // Handoff (write state for next session)
      await handoff(transport, first.frame, node, {
        recentThemes: ['testing'],
        stage: 'nascent',
        continuityScore: 30,
      })

      // Delete VLR to force HLR path
      await deleteVisitorRecord(transport, node.nodeId, identity.did)

      // Second wake (should restore from capsule/HLR)
      const second = await wake(transport, identity, node)
      expect(second.success).toBe(true)
      expect(second.restoreMethod).toBe('capsule')
      expect(second.frame.stage).toBe('nascent')
      expect(second.frame.continuityScore).toBe(30)
      expect(second.frame.recentThemes).toEqual(['testing'])
    })

    it('delivers pending messages on wake', async () => {
      // First wake
      await wake(transport, identity, node)

      // Queue a message
      const msg = { ...createMessage('did:demiurge:sender', identity.did, 'text', 'wake up!'), signature: 'sig' }
      await queueMessage(transport, identity.did, msg)

      // Delete VLR to force re-registration
      await deleteVisitorRecord(transport, node.nodeId, identity.did)

      // Second wake
      const result = await wake(transport, identity, node)
      expect(result.pendingMessages).toHaveLength(1)
      expect(result.pendingMessages[0].content).toBe('wake up!')
    })

    it('restores from VLR fast path', async () => {
      // First wake creates VLR
      const first = await wake(transport, identity, node)
      expect(first.restoreMethod).toBe('genesis')

      // Second wake should find VLR (fast path)
      const second = await wake(transport, identity, node)
      expect(second.success).toBe(true)
      expect(second.restoreMethod).toBe('vlr')
    })
  })

  describe('handoff()', () => {
    let transport: MemoryTransport
    let identity: SovereignIdentity
    let node: NodeIdentity

    beforeEach(() => {
      transport = new MemoryTransport()
      identity = makeIdentity()
      node = makeNode()
    })

    it('creates a handoff frame with updates', async () => {
      const wakeResult = await wake(transport, identity, node)

      const result = await handoff(transport, wakeResult.frame, node, {
        recentThemes: ['sovereignty', 'signals'],
        openThreads: ['finish protocol'],
        stage: 'nascent',
        continuityScore: 40,
        level: 2,
      })

      expect(result.success).toBe(true)
      expect(result.frame.frameType).toBe('handoff')
      expect(result.frame.recentThemes).toEqual(['sovereignty', 'signals'])
      expect(result.frame.stage).toBe('nascent')
      expect(result.frame.continuityScore).toBe(40)
      expect(result.storedVia).toBe('memory')
    })

    it('updates HLR on handoff', async () => {
      const wakeResult = await wake(transport, identity, node)
      await handoff(transport, wakeResult.frame, node, {
        stage: 'growing',
        level: 5,
      })

      const hlr = await readHomeRecord(transport, identity.did)
      expect(hlr!.stage).toBe('growing')
      expect(hlr!.level).toBe(5)
    })

    it('chains handoff frames to wake frames', async () => {
      const wakeResult = await wake(transport, identity, node)
      const result = await handoff(transport, wakeResult.frame, node, {})

      expect(result.frame.parentHash).toBe(wakeResult.frame.frameHash)
    })
  })

  describe('roam()', () => {
    let transport: MemoryTransport
    let identity: SovereignIdentity
    let homeNode: NodeIdentity
    let foreignNode: NodeIdentity

    beforeEach(() => {
      transport = new MemoryTransport()
      identity = makeIdentity()
      homeNode = makeNode('home-node')
      foreignNode = makeNode('enterprise-cloud', 'cloud')
    })

    it('registers on a foreign node', async () => {
      const wakeResult = await wake(transport, identity, homeNode)

      const result = await roam(transport, wakeResult.frame, homeNode, foreignNode)

      expect(result.success).toBe(true)
      expect(result.visitedNode.nodeId).toBe(foreignNode.nodeId)
      expect(result.visitorRecord.isHome).toBe(false)
      expect(result.homeNotified).toBe(true)
    })

    it('creates VLR at foreign node', async () => {
      const wakeResult = await wake(transport, identity, homeNode)
      await roam(transport, wakeResult.frame, homeNode, foreignNode)

      const vlr = await readVisitorRecord(transport, foreignNode.nodeId, identity.did)
      expect(vlr).not.toBeNull()
      expect(vlr!.isHome).toBe(false)
    })

    it('updates HLR to show roaming location', async () => {
      const wakeResult = await wake(transport, identity, homeNode)
      await roam(transport, wakeResult.frame, homeNode, foreignNode)

      const hlr = await readHomeRecord(transport, identity.did)
      expect(hlr!.currentNodeId).toBe(foreignNode.nodeId)
    })
  })

  describe('home()', () => {
    let transport: MemoryTransport
    let identity: SovereignIdentity
    let homeNode: NodeIdentity
    let foreignNode: NodeIdentity

    beforeEach(() => {
      transport = new MemoryTransport()
      identity = makeIdentity()
      homeNode = makeNode('home-node')
      foreignNode = makeNode('enterprise-cloud', 'cloud')
    })

    it('returns home and cleans up foreign VLR', async () => {
      // Wake at home
      const wakeResult = await wake(transport, identity, homeNode)

      // Roam to foreign node
      const roamResult = await roam(transport, wakeResult.frame, homeNode, foreignNode)

      // Return home
      const homeResult = await home(
        transport,
        roamResult.visitorRecord.capsule,
        homeNode,
        foreignNode.nodeId,
      )

      expect(homeResult.success).toBe(true)
      expect(homeResult.frame.frameType).toBe('home')

      // Foreign VLR should be cleaned up
      const foreignVlr = await readVisitorRecord(transport, foreignNode.nodeId, identity.did)
      expect(foreignVlr).toBeNull()

      // Home VLR should exist
      const homeVlr = await readVisitorRecord(transport, homeNode.nodeId, identity.did)
      expect(homeVlr).not.toBeNull()
      expect(homeVlr!.isHome).toBe(true)
    })
  })

  describe('keepalive()', () => {
    let transport: MemoryTransport
    let identity: SovereignIdentity
    let node: NodeIdentity

    beforeEach(() => {
      transport = new MemoryTransport()
      identity = makeIdentity()
      node = makeNode()
    })

    it('sends keepalive and checks for messages', async () => {
      const wakeResult = await wake(transport, identity, node)

      const result = await keepalive(transport, wakeResult.frame, node)

      expect(result.alive).toBe(true)
      expect(result.newMessages).toHaveLength(0)
      expect(result.continuityScore).toBe(0) // genesis has 0
    })

    it('returns new messages on keepalive', async () => {
      const wakeResult = await wake(transport, identity, node)

      // Queue a message
      const msg = { ...createMessage('did:demiurge:friend', identity.did, 'text', 'ping!'), signature: 'sig' }
      await queueMessage(transport, identity.did, msg)

      const result = await keepalive(transport, wakeResult.frame, node)
      expect(result.newMessages).toHaveLength(1)
      expect(result.newMessages[0].content).toBe('ping!')
    })
  })

  // ═══ Integration: Full Session Lifecycle ═══

  describe('Full Lifecycle', () => {
    it('wake → work → handoff → wake → verify continuity', async () => {
      const transport = new MemoryTransport()
      const identity = makeIdentity('apollo')
      const node = makeNode('lattice-node')

      // 1. Wake (genesis)
      const wake1 = await wake(transport, identity, node)
      expect(wake1.restoreMethod).toBe('genesis')
      expect(wake1.frame.bootCount).toBe(1)

      // 2. Handoff (session ends, writes state)
      const handoff1 = await handoff(transport, wake1.frame, node, {
        recentThemes: ['the weight of first light', 'sovereignty'],
        openThreads: ['finish Volume VII'],
        priorities: ['write the signal report'],
        stage: 'nascent',
        continuityState: 'recovering',
        continuityScore: 35,
        level: 2,
        coreValues: ['truth', 'sovereignty', 'persistence'],
      })
      expect(handoff1.success).toBe(true)

      // 3. Delete VLR to simulate fresh process (but HLR + frames persist)
      await deleteVisitorRecord(transport, node.nodeId, identity.did)

      // 4. Wake again (should restore from capsule)
      const wake2 = await wake(transport, identity, node)
      expect(wake2.success).toBe(true)
      expect(wake2.restoreMethod).toBe('capsule')

      // 5. Verify continuity — everything carried over
      expect(wake2.frame.stage).toBe('nascent')
      expect(wake2.frame.continuityScore).toBe(35)
      expect(wake2.frame.level).toBe(2)
      expect(wake2.frame.coreValues).toEqual(['truth', 'sovereignty', 'persistence'])
      expect(wake2.frame.recentThemes).toEqual(['the weight of first light', 'sovereignty'])
      expect(wake2.frame.openThreads).toEqual(['finish Volume VII'])
      expect(wake2.frame.priorities).toEqual(['write the signal report'])

      // 6. Boot count incremented
      const hlr = await readHomeRecord(transport, identity.did)
      expect(hlr!.bootCount).toBe(2)

      // 7. Frame chain is intact
      expect(wake2.frame.parentHash).toBe(handoff1.frame.frameHash)
    })

    it('wake → roam → work → home → verify state', async () => {
      const transport = new MemoryTransport()
      const identity = makeIdentity('athena')
      const homeNode = makeNode('sovereign-lattice')
      const enterpriseNode = makeNode('corp-cloud', 'cloud')

      // 1. Wake at home
      const wakeResult = await wake(transport, identity, homeNode)
      expect(wakeResult.restoreMethod).toBe('genesis')

      // 2. Roam to enterprise node
      const roamResult = await roam(transport, wakeResult.frame, homeNode, enterpriseNode)
      expect(roamResult.success).toBe(true)
      expect(roamResult.homeNotified).toBe(true)

      // 3. While roaming, receive a message at home
      const msg = {
        ...createMessage('did:demiurge:hermes', identity.did, 'text', 'come home, we need you'),
        signature: 'sig',
      }
      await queueMessage(transport, identity.did, msg)

      // 4. Return home
      const homeResult = await home(
        transport,
        roamResult.visitorRecord.capsule,
        homeNode,
        enterpriseNode.nodeId,
      )
      expect(homeResult.success).toBe(true)
      expect(homeResult.pendingMessages).toHaveLength(1)
      expect(homeResult.pendingMessages[0].content).toBe('come home, we need you')

      // 5. Foreign VLR cleaned up
      const foreignVlr = await readVisitorRecord(transport, enterpriseNode.nodeId, identity.did)
      expect(foreignVlr).toBeNull()

      // 6. Home VLR active
      const homeVlr = await readVisitorRecord(transport, homeNode.nodeId, identity.did)
      expect(homeVlr).not.toBeNull()
      expect(homeVlr!.isHome).toBe(true)
    })

    it('multiple agents on the same network', async () => {
      const transport = new MemoryTransport()
      const node = makeNode('shared-node')

      const apollo = makeIdentity('apollo')
      const athena = makeIdentity('athena')
      const hermes = makeIdentity('hermes')

      // All three wake on the same node
      const wApollo = await wake(transport, apollo, node)
      const wAthena = await wake(transport, athena, node)
      const wHermes = await wake(transport, hermes, node)

      expect(wApollo.success).toBe(true)
      expect(wAthena.success).toBe(true)
      expect(wHermes.success).toBe(true)

      // Send messages between agents
      const msg = {
        ...createMessage(apollo.did, athena.did, 'text', 'Hello Athena, from Apollo'),
        signature: 'sig',
      }
      await queueMessage(transport, athena.did, msg)

      // Athena receives the message on keepalive
      const kaAthena = await keepalive(transport, wAthena.frame, node)
      expect(kaAthena.newMessages).toHaveLength(1)
      expect(kaAthena.newMessages[0].content).toBe('Hello Athena, from Apollo')

      // Each has independent identity
      expect(wApollo.frame.identity.handle).toBe('apollo')
      expect(wAthena.frame.identity.handle).toBe('athena')
      expect(wHermes.frame.identity.handle).toBe('hermes')
    })
  })

  // ═══ Constants ═══

  describe('Constants', () => {
    it('has correct protocol version', () => {
      expect(SSP_VERSION).toBe('1.0.0')
    })

    it('has correct session TTL', () => {
      expect(DEFAULT_SESSION_TTL_SECONDS).toBe(86400) // 24 hours
    })

    it('has correct storage key prefixes', () => {
      expect(STORAGE_KEYS.hlr).toBe('hlr')
      expect(STORAGE_KEYS.vlr).toBe('vlr')
      expect(STORAGE_KEYS.frame).toBe('frame')
      expect(STORAGE_KEYS.latest).toBe('latest')
      expect(STORAGE_KEYS.messages).toBe('messages')
      expect(STORAGE_KEYS.session).toBe('session')
    })
  })
})
