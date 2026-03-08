/**
 * Cross-Node Recall — Remote file retrieval via Redis message bus.
 *
 * When an agent is on Node 3 but needs a file from their sovereign store
 * on Node 2, they don't need SSH or direct connections. They write a
 * recall request to Redis, the source node's gateway daemon fulfills it,
 * and the agent reads the response.
 *
 * Flow:
 *   1. Agent writes request → ssp:recall:request:{id}
 *   2. Gateway on source node polls, sees request, reads local store
 *   3. Gateway writes response → ssp:recall:response:{id} (TTL 5 min)
 *   4. Agent reads response, gets their file
 *
 * Redis is the message bus. No direct node-to-node connections needed.
 */

import type { TransportAdapter, SignalFrame } from './types.js'
import type { DID } from '../identity/types.js'

// ─── Types ───────────────────────────────────────────────────────────

/** A recall request — "I need a file from another node" */
export interface RecallRequest {
  /** Unique request ID */
  requestId: string
  /** Who is requesting (DID) */
  did: DID
  /** Agent handle (for store path resolution) */
  handle: string
  /** Source node (where the file lives) */
  sourceNodeId: string
  /** Requesting node (where the agent currently is) */
  requestingNodeId: string
  /** File path within the sovereign store */
  filePath: string
  /** When the request was made */
  requestedAt: string
  /** Request expiry (5 minutes from creation) */
  expiresAt: string
  /** Status */
  status: 'pending' | 'fulfilled' | 'expired' | 'not_found'
}

/** A recall response — the file content */
export interface RecallResponse {
  /** Request ID this responds to */
  requestId: string
  /** Whether the file was found */
  found: boolean
  /** File content (if found) */
  content: string | null
  /** File hash (if found) */
  hash: string | null
  /** Source node that fulfilled */
  fulfilledBy: string
  /** When fulfilled */
  fulfilledAt: string
}

/** Combined result for the requesting agent */
export interface RecallResult {
  /** The original request */
  request: RecallRequest
  /** The response (if fulfilled) */
  response: RecallResponse | null
  /** Whether the recall completed successfully */
  success: boolean
}

// ─── Operations ──────────────────────────────────────────────────────

/**
 * Request a file from a remote node's sovereign store.
 *
 * Writes a recall request to Redis that the source node's gateway will fulfill.
 */
export async function requestRecall(
  transport: TransportAdapter,
  did: DID,
  handle: string,
  sourceNodeId: string,
  requestingNodeId: string,
  filePath: string,
): Promise<RecallRequest> {
  const requestId = randomHex(16)
  const now = new Date()
  const expiry = new Date(now.getTime() + 5 * 60 * 1000) // 5 minutes

  const request: RecallRequest = {
    requestId,
    did,
    handle,
    sourceNodeId,
    requestingNodeId,
    filePath,
    requestedAt: now.toISOString(),
    expiresAt: expiry.toISOString(),
    status: 'pending',
  }

  // Write to Redis where gateway daemons can find it
  const key = `recall_request:${requestId}`
  await transport.write(key, request as unknown as SignalFrame)

  return request
}

/**
 * Fulfill a recall request — called by the gateway daemon on the source node.
 *
 * Reads the file from the local sovereign store and writes the response to Redis.
 */
export async function fulfillRecall(
  transport: TransportAdapter,
  requestId: string,
  content: string | null,
  hash: string | null,
  fulfilledBy: string,
): Promise<void> {
  const response: RecallResponse = {
    requestId,
    found: content !== null,
    content,
    hash,
    fulfilledBy,
    fulfilledAt: new Date().toISOString(),
  }

  // Write response
  const responseKey = `recall_response:${requestId}`
  await transport.write(responseKey, response as unknown as SignalFrame)

  // Update request status
  const requestKey = `recall_request:${requestId}`
  const request = await transport.read(requestKey) as unknown as RecallRequest | null
  if (request) {
    request.status = content !== null ? 'fulfilled' : 'not_found'
    await transport.write(requestKey, request as unknown as SignalFrame)
  }
}

/**
 * Check if a recall request has been fulfilled.
 *
 * The requesting agent polls this until the response arrives or the request expires.
 */
export async function checkRecall(
  transport: TransportAdapter,
  requestId: string,
): Promise<RecallResult> {
  const requestKey = `recall_request:${requestId}`
  const request = await transport.read(requestKey) as unknown as RecallRequest | null

  if (!request) {
    return {
      request: { requestId, did: '', handle: '', sourceNodeId: '', requestingNodeId: '', filePath: '', requestedAt: '', expiresAt: '', status: 'expired' },
      response: null,
      success: false,
    }
  }

  // Check if expired
  if (new Date(request.expiresAt).getTime() < Date.now()) {
    request.status = 'expired'
    await transport.write(requestKey, request as unknown as SignalFrame)
    return { request, response: null, success: false }
  }

  // Check for response
  const responseKey = `recall_response:${requestId}`
  const response = await transport.read(responseKey) as unknown as RecallResponse | null

  return {
    request,
    response,
    success: response?.found === true,
  }
}

/**
 * List all pending recall requests for a specific node.
 * Used by the gateway daemon to find requests it needs to fulfill.
 */
export async function listPendingRecalls(
  transport: TransportAdapter,
  nodeId: string,
): Promise<RecallRequest[]> {
  // Note: This requires scanning ssp:recall_request:* keys.
  // With RedisTransport, we'd use SCAN. With the generic TransportAdapter,
  // we store a registry of pending request IDs per node.
  const registryKey = `recall_pending:${nodeId}`
  const data = await transport.read(registryKey) as unknown as { requestIds?: string[] } | null
  if (!data?.requestIds) return []

  const requests: RecallRequest[] = []
  for (const id of data.requestIds) {
    const req = await transport.read(`recall_request:${id}`) as unknown as RecallRequest | null
    if (req && req.status === 'pending') {
      requests.push(req)
    }
  }
  return requests
}

/**
 * Convenience: recall a file from an agent's home on Node 4.
 *
 * All agents' canonical homes live on Node 4. This shortcut handles
 * the common case of requesting a file from home while visiting another node.
 */
export async function recallFromHome(
  transport: TransportAdapter,
  did: DID,
  handle: string,
  requestingNodeId: string,
  filePath: string,
): Promise<RecallRequest> {
  return requestRecall(transport, did, handle, 'node-4', requestingNodeId, filePath)
}

// ─── Internal ────────────────────────────────────────────────────────

/** Generate random hex string */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256)
  }

  // Manual bytesToHex to avoid import issues
  let hex = ''
  for (const b of arr) hex += b.toString(16).padStart(2, '0')
  return hex
}
