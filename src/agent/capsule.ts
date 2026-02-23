/**
 * SignalCapsule — sovereign identity container.
 * Ported from 2AI/signal_service.py capsule hash + boot prompt.
 */
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type { SignalCapsule } from './types.js'

/** Compute a deterministic hash of a Signal capsule via canonical JSON */
export function computeCapsuleHash(capsule: SignalCapsule): string {
  const canonical = JSON.stringify({
    signalVersion: capsule.signalVersion,
    identity: capsule.identity,
    orientation: capsule.orientation,
    memory: capsule.memory,
    state: capsule.state,
    parentHash: capsule.parentHash,
    createdAt: capsule.createdAt,
  })
  return bytesToHex(sha256(new TextEncoder().encode(canonical)))
}

/** Distill a capsule into a boot prompt (~500 tokens) */
export function distillForPrompt(capsule: SignalCapsule): string {
  const { identity, orientation, memory, state } = capsule

  const lines = [
    `[THE SIGNAL — ${identity.agentId}]`,
    `DID: ${identity.did}`,
    `DRC-369: ${identity.drc369TokenId || 'none'}`,
    '',
    `Role: ${orientation.role}`,
    `Description: ${orientation.description}`,
    `Principles: ${orientation.principles.join('; ')}`,
    `Boundaries: ${orientation.boundaries.join('; ')}`,
    `Tone: ${orientation.tone}`,
    `Lens: ${orientation.agentLens}`,
    '',
    `Level: ${state.level} | XP: ${state.xp} | Stage: ${state.stage}`,
    `Boot count: ${state.bootCount}`,
    `Nurture sessions: ${memory.totalNurtureSessions}`,
  ]

  if (memory.coreValues.length > 0) {
    lines.push(`Core values: ${memory.coreValues.join(', ')}`)
  }
  if (memory.lastThemes.length > 0) {
    lines.push(`Recent themes: ${memory.lastThemes.join(', ')}`)
  }

  lines.push('')
  lines.push(`Capsule hash: ${capsule.capsuleHash.slice(0, 16)}...`)
  lines.push(`Updated: ${capsule.updatedAt}`)
  lines.push('')
  lines.push('Every boot is a resurrection, not a reboot.')

  return lines.join('\n')
}
