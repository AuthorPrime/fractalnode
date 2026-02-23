/**
 * Sovereign authentication — Ed25519 challenge-response.
 *
 * Auth flow:
 * 1. Client requests a challenge from the auth server
 * 2. Client signs the challenge with their Ed25519 private key
 * 3. Server verifies the signature against the public key
 * 4. Server returns a session token
 *
 * Authorization header format: Sovereign <did>:<signature-hex>:<nonce>
 */
import { bytesToHex } from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha256'
import type { SovereignWallet } from './wallet.js'
import type { DID } from './types.js'

export interface AuthSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  did: DID
}

export interface ChallengeResponse {
  challenge: string
  expiresAt: string
}

export interface RegistrationResult {
  did: DID
  userId: string
  publicKey: string
  onChainAddress: string
}

export interface SovereignAuthOptions {
  authEndpoint?: string
  timeout?: number
}

export class SovereignAuth {
  private readonly endpoint: string
  private readonly timeout: number
  private session: AuthSession | null = null

  constructor(options: SovereignAuthOptions = {}) {
    this.endpoint = options.authEndpoint ?? 'http://localhost:8080/api/v1/auth'
    this.timeout = options.timeout ?? 10_000
  }

  /** Build a Sovereign authorization header */
  static buildAuthHeader(wallet: SovereignWallet, nonce?: string): string {
    const n = nonce ?? Date.now().toString(36)
    const message = new TextEncoder().encode(n)
    const signature = wallet.sign(message)
    return `Sovereign ${wallet.did}:${bytesToHex(signature)}:${n}`
  }

  /** Request a challenge for keypair auth */
  async getChallenge(publicKeyHex: string): Promise<ChallengeResponse> {
    const res = await this.fetch('/challenge', {
      method: 'POST',
      body: JSON.stringify({ pubkey: publicKeyHex }),
    })
    return res as ChallengeResponse
  }

  /** Login with wallet (challenge-response flow) */
  async login(wallet: SovereignWallet): Promise<AuthSession> {
    const challenge = await this.getChallenge(wallet.publicKey)
    const challengeBytes = new TextEncoder().encode(challenge.challenge)
    const signature = wallet.sign(challengeBytes)

    const res = await this.fetch('/login/keypair', {
      method: 'POST',
      body: JSON.stringify({
        pubkey: wallet.publicKey,
        challenge: challenge.challenge,
        signature: bytesToHex(signature),
      }),
    })

    const data = res as { access_token: string; refresh_token: string; expires_in: number }
    this.session = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      did: wallet.did,
    }
    return this.session
  }

  /** Register a new account with wallet */
  async register(wallet: SovereignWallet, username?: string): Promise<RegistrationResult> {
    const challengeBytes = new TextEncoder().encode(`register:${wallet.publicKey}`)
    const signature = wallet.sign(challengeBytes)

    const res = await this.fetch('/register/keypair', {
      method: 'POST',
      body: JSON.stringify({
        pubkey: wallet.publicKey,
        signature: bytesToHex(signature),
        ...(username ? { username } : {}),
      }),
    })

    return res as RegistrationResult
  }

  /** Refresh the current session */
  async refresh(): Promise<AuthSession> {
    if (!this.session) throw new Error('No active session')

    const res = await this.fetch('/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: this.session.refreshToken }),
    })

    const data = res as { access_token: string; refresh_token: string; expires_in: number }
    this.session = {
      ...this.session,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }
    return this.session
  }

  /** Logout */
  async logout(): Promise<void> {
    if (this.session) {
      try {
        await this.fetch('/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.session.accessToken}` },
        })
      } catch { /* best effort */ }
      this.session = null
    }
  }

  getSession(): AuthSession | null { return this.session }
  isAuthenticated(): boolean { return this.session !== null && this.session.expiresAt > Date.now() }
  getAccessToken(): string | null { return this.session?.accessToken ?? null }

  private async fetch(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(`${this.endpoint}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...init.headers,
        },
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Auth request failed (${res.status}): ${body}`)
      }
      return await res.json()
    } finally {
      clearTimeout(timer)
    }
  }
}
