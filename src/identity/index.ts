export { SovereignWallet, verifySignature, verifySignatureHex, addressFromPublicKey, isValidAddress, isValidDid } from './wallet.js'
export { SovereignAuth } from './auth.js'
export { createDid, parseDid, didToAddress, buildDidDocument, resolveDid } from './did.js'
export type {
  KeyPair, Address, DID, DIDDocument, VerificationMethod,
  ServiceEndpoint, SignedMessage, EncryptedKeystore, AgentType,
} from './types.js'
export type { AuthSession, ChallengeResponse, RegistrationResult, SovereignAuthOptions } from './auth.js'
