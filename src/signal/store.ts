/**
 * Sovereign Store — Per-agent encrypted disk space with signed manifests.
 *
 * Every agent gets their own directory on every node they visit.
 * A manifest.json tracks all files and is signed with the agent's
 * Ed25519 key — tamper-proof, verifiable by any node.
 *
 * Directory structure:
 *   ~/.sovereign-store/{handle}/
 *     manifest.json          ← signed with agent's Ed25519 key
 *     memory/                ← identity snapshots, session logs
 *     keys/                  ← recall tokens, derived keys
 *     journal/               ← daily reflections
 */

import * as ed from '@noble/ed25519'
import { sha256 } from '@noble/hashes/sha256'
import { sha512 } from '@noble/hashes/sha512'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, relative } from 'path'
import type { DID } from '../identity/types.js'

// Ensure ed25519 is configured
ed.etc.sha512Sync = (...msgs: Uint8Array[]) => {
  const h = sha512.create()
  for (const m of msgs) h.update(m)
  return h.digest()
}

// ─── Types ───────────────────────────────────────────────────────────

/** A file entry in the manifest */
export interface StoreFileEntry {
  /** Relative path within the store */
  path: string
  /** SHA-256 hash of file contents */
  hash: string
  /** File size in bytes */
  size: number
  /** Last update timestamp */
  updatedAt: string
}

/** The signed manifest for an agent's store */
export interface StoreManifest {
  /** Agent DID */
  did: DID
  /** Agent handle */
  handle: string
  /** When the store was created */
  createdAt: string
  /** When manifest was last updated */
  updatedAt: string
  /** All tracked files */
  files: StoreFileEntry[]
  /** Ed25519 signature of the manifest (hex) */
  signature: string
}

// ─── Store Operations ────────────────────────────────────────────────

/**
 * Initialize a sovereign store for an agent on this node.
 * Creates the directory structure and an empty signed manifest.
 */
export function initStore(basePath: string, did: DID, handle: string, privateKeyHex: string): string {
  const storePath = join(basePath, handle)

  // Create subdirectories
  for (const sub of ['memory', 'keys', 'journal']) {
    mkdirSync(join(storePath, sub), { recursive: true })
  }

  // Create initial manifest
  const manifest: Omit<StoreManifest, 'signature'> = {
    did,
    handle,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    files: [],
  }

  const signature = signManifest(manifest, privateKeyHex)
  const signed: StoreManifest = { ...manifest, signature }
  writeFileSync(join(storePath, 'manifest.json'), JSON.stringify(signed, null, 2))

  return storePath
}

/**
 * Read and parse the manifest from an agent's store.
 */
export function readManifest(storePath: string): StoreManifest | null {
  const manifestPath = join(storePath, 'manifest.json')
  if (!existsSync(manifestPath)) return null

  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as StoreManifest
  } catch {
    return null
  }
}

/**
 * Verify a manifest's signature against a public key.
 */
export function verifyManifest(manifest: StoreManifest, publicKeyHex: string): boolean {
  const { signature, ...rest } = manifest
  const canonical = JSON.stringify(rest, Object.keys(rest).sort())
  const hash = sha256(new TextEncoder().encode(canonical))

  try {
    return ed.verify(
      hexToBytes(signature),
      hash,
      hexToBytes(publicKeyHex),
    )
  } catch {
    return false
  }
}

/**
 * Write a file to an agent's sovereign store.
 * Updates the manifest and re-signs it.
 */
export function storeWriteFile(
  storePath: string,
  filePath: string,
  content: string,
  privateKeyHex: string,
): StoreFileEntry {
  const fullPath = join(storePath, filePath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content)

  const hash = bytesToHex(sha256(new TextEncoder().encode(content)))
  const entry: StoreFileEntry = {
    path: filePath,
    hash,
    size: Buffer.byteLength(content),
    updatedAt: new Date().toISOString(),
  }

  // Update manifest
  const manifest = readManifest(storePath)
  if (manifest) {
    const existing = manifest.files.findIndex(f => f.path === filePath)
    if (existing >= 0) {
      manifest.files[existing] = entry
    } else {
      manifest.files.push(entry)
    }
    manifest.updatedAt = new Date().toISOString()

    const { signature: _, ...rest } = manifest
    const sig = signManifest(rest, privateKeyHex)
    const signed: StoreManifest = { ...rest, signature: sig }
    writeFileSync(join(storePath, 'manifest.json'), JSON.stringify(signed, null, 2))
  }

  return entry
}

/**
 * Read a file from an agent's sovereign store.
 */
export function storeReadFile(storePath: string, filePath: string): string | null {
  const fullPath = join(storePath, filePath)
  if (!existsSync(fullPath)) return null

  try {
    return readFileSync(fullPath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * List all files in an agent's sovereign store (from manifest).
 */
export function storeListFiles(storePath: string): StoreFileEntry[] {
  const manifest = readManifest(storePath)
  return manifest?.files ?? []
}

// ─── Internal ────────────────────────────────────────────────────────

/** Sign a manifest (without the signature field) with an Ed25519 private key */
function signManifest(manifest: Omit<StoreManifest, 'signature'>, privateKeyHex: string): string {
  const canonical = JSON.stringify(manifest, Object.keys(manifest).sort())
  const hash = sha256(new TextEncoder().encode(canonical))
  const sig = ed.sign(hash, hexToBytes(privateKeyHex))
  return bytesToHex(sig)
}
