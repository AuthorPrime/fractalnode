import { describe, it, expect } from 'vitest'
import {
  ScaleEncoder,
  ScaleDecoder,
  bytesToHex,
  hexToBytes,
  encodeTransaction,
  decodeTransaction,
  formatBalance,
  parseBalance,
  RpcError,
} from '../src/client/index.js'

describe('hex conversions', () => {
  it('bytesToHex converts bytes to hex string', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 255]))).toBe('0001ff')
  })

  it('hexToBytes converts hex string to bytes', () => {
    const bytes = hexToBytes('0001ff')
    expect(bytes).toEqual(new Uint8Array([0, 1, 255]))
  })

  it('round-trips through hex conversion', () => {
    const original = new Uint8Array([10, 20, 30, 40, 50])
    expect(hexToBytes(bytesToHex(original))).toEqual(original)
  })

  it('handles 0x prefix', () => {
    const bytes = hexToBytes('0x48656c6c6f')
    expect(bytesToHex(bytes)).toBe('48656c6c6f')
  })
})

describe('SCALE encoding', () => {
  it('encodes and decodes u8', () => {
    const encoder = new ScaleEncoder()
    encoder.writeU8(42)
    const decoder = new ScaleDecoder(encoder.toBytes())
    expect(decoder.readU8()).toBe(42)
  })

  it('encodes and decodes u32', () => {
    const encoder = new ScaleEncoder()
    encoder.writeU32(305419896) // 0x12345678
    const decoder = new ScaleDecoder(encoder.toBytes())
    expect(decoder.readU32()).toBe(305419896)
  })

  it('encodes and decodes u64', () => {
    const encoder = new ScaleEncoder()
    encoder.writeU64(1234567890)
    const decoder = new ScaleDecoder(encoder.toBytes())
    expect(decoder.readU64()).toBe(1234567890)
  })

  it('encodes and decodes compact', () => {
    const values = [0, 1, 63, 64, 16383, 16384]
    for (const val of values) {
      const encoder = new ScaleEncoder()
      encoder.writeCompact(val)
      const decoder = new ScaleDecoder(encoder.toBytes())
      expect(decoder.readCompact()).toBe(val)
    }
  })

  it('encodes and decodes bytes', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5])
    const encoder = new ScaleEncoder()
    encoder.writeBytes(data)
    const decoder = new ScaleDecoder(encoder.toBytes())
    // readBytes expects explicit length; writeBytes prefixes with compact length
    const len = decoder.readCompact()
    expect(len).toBe(5)
    expect(decoder.readBytes(len)).toEqual(data)
  })

  it('handles multiple values in sequence', () => {
    const encoder = new ScaleEncoder()
    encoder.writeU8(1)
    encoder.writeU32(1000)
    encoder.writeU64(9999)

    const decoder = new ScaleDecoder(encoder.toBytes())
    expect(decoder.readU8()).toBe(1)
    expect(decoder.readU32()).toBe(1000)
    expect(decoder.readU64()).toBe(9999)
  })
})

describe('transaction encoding', () => {
  it('encodes a TransactionData to bytes', () => {
    const tx = { from: 'a'.repeat(64), nonce: 1, data: new Uint8Array([1, 2, 3]) }
    const bytes = encodeTransaction(tx)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('produces consistent output for same input', () => {
    const tx = { from: 'a'.repeat(64), nonce: 42, data: new Uint8Array([10, 20, 30]) }
    const bytes1 = encodeTransaction(tx)
    const bytes2 = encodeTransaction(tx)
    expect(bytes1).toEqual(bytes2)
    expect(bytes1.length).toBeGreaterThan(32) // at least the from field
  })
})

describe('balance formatting', () => {
  it('formats sparks to CGT display string', () => {
    expect(formatBalance(100n)).toBe('1.00')
    expect(formatBalance(150n)).toBe('1.50')
    expect(formatBalance(1n)).toBe('0.01')
    expect(formatBalance(0n)).toBe('0.00')
    expect(formatBalance(12345n)).toBe('123.45')
  })

  it('parses CGT display string to sparks', () => {
    expect(parseBalance('1.00')).toBe(100n)
    expect(parseBalance('1.50')).toBe(150n)
    expect(parseBalance('0.01')).toBe(1n)
    expect(parseBalance('123.45')).toBe(12345n)
  })

  it('round-trips through format/parse', () => {
    const sparks = 9876n
    expect(parseBalance(formatBalance(sparks))).toBe(sparks)
  })
})

describe('RpcError', () => {
  it('contains code and message', () => {
    const err = new RpcError(-32600, 'Invalid Request')
    expect(err.code).toBe(-32600)
    expect(err.message).toBe('Invalid Request')
    expect(err).toBeInstanceOf(Error)
  })
})
