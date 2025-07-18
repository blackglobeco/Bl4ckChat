// Binary Protocol Implementation
// Port of the Swift BinaryProtocol.swift

export interface BitchatPacket {
  version: number;
  type: number;
  ttl: number;
  timestamp: bigint;
  senderID: Uint8Array;
  recipientID?: Uint8Array;
  payload: Uint8Array;
  signature?: Uint8Array;
}

export enum MessageType {
  ANNOUNCE = 0x01,
  LEAVE = 0x03,
  MESSAGE = 0x04,
  FRAGMENT_START = 0x05,
  FRAGMENT_CONTINUE = 0x06,
  FRAGMENT_END = 0x07,
  CHANNEL_ANNOUNCE = 0x08,
  CHANNEL_RETENTION = 0x09,
  DELIVERY_ACK = 0x0A,
  DELIVERY_STATUS_REQUEST = 0x0B,
  READ_RECEIPT = 0x0C,
  NOISE_HANDSHAKE_INIT = 0x10,
  NOISE_HANDSHAKE_RESP = 0x11,
  NOISE_ENCRYPTED = 0x12,
  NOISE_IDENTITY_ANNOUNCE = 0x13,
  CHANNEL_KEY_VERIFY_REQUEST = 0x14,
  CHANNEL_KEY_VERIFY_RESPONSE = 0x15,
  CHANNEL_PASSWORD_UPDATE = 0x16,
  CHANNEL_METADATA = 0x17
}

export class SpecialRecipients {
  static readonly BROADCAST = new Uint8Array(8).fill(0xFF);
}

export class BinaryProtocol {
  private static readonly HEADER_SIZE = 13;
  private static readonly SENDER_ID_SIZE = 8;
  private static readonly RECIPIENT_ID_SIZE = 8;
  private static readonly SIGNATURE_SIZE = 64;
  private static readonly VERSION = 1;

  private static readonly FLAGS = {
    HAS_RECIPIENT: 0x01,
    HAS_SIGNATURE: 0x02,
    IS_COMPRESSED: 0x04
  };

  static encode(packet: BitchatPacket): Uint8Array | null {
    try {
      const data: number[] = [];

      // Try compression if beneficial
      let payload = packet.payload;
      let originalPayloadSize: number | null = null;
      let isCompressed = false;

      if (this.shouldCompress(payload)) {
        const compressed = this.compress(payload);
        if (compressed) {
          originalPayloadSize = payload.length;
          payload = compressed;
          isCompressed = true;
        }
      }

      // Header
      data.push(packet.version || this.VERSION);
      data.push(packet.type);
      data.push(packet.ttl);

      // Timestamp (8 bytes, big-endian)
      const timestamp = packet.timestamp;
      for (let i = 7; i >= 0; i--) {
        data.push(Number((timestamp >> BigInt(i * 8)) & BigInt(0xFF)));
      }

      // Flags
      let flags = 0;
      if (packet.recipientID) {
        flags |= this.FLAGS.HAS_RECIPIENT;
      }
      if (packet.signature) {
        flags |= this.FLAGS.HAS_SIGNATURE;
      }
      if (isCompressed) {
        flags |= this.FLAGS.IS_COMPRESSED;
      }
      data.push(flags);

      // Payload length (2 bytes, big-endian) - includes original size if compressed
      const payloadDataSize = payload.length + (isCompressed ? 2 : 0);
      data.push((payloadDataSize >> 8) & 0xFF);
      data.push(payloadDataSize & 0xFF);

      // Sender ID (8 bytes, padded)
      const senderPadded = new Uint8Array(8);
      senderPadded.set(packet.senderID.slice(0, 8));
      data.push(...senderPadded);

      // Recipient ID (8 bytes, if present)
      if (packet.recipientID) {
        const recipientPadded = new Uint8Array(8);
        recipientPadded.set(packet.recipientID.slice(0, 8));
        data.push(...recipientPadded);
      }

      // Original payload size (if compressed)
      if (isCompressed && originalPayloadSize !== null) {
        data.push((originalPayloadSize >> 8) & 0xFF);
        data.push(originalPayloadSize & 0xFF);
      }

      // Payload
      data.push(...payload);

      // Signature (64 bytes, if present)
      if (packet.signature) {
        const signaturePadded = new Uint8Array(64);
        signaturePadded.set(packet.signature.slice(0, 64));
        data.push(...signaturePadded);
      }

      return new Uint8Array(data);
    } catch (error) {
      console.error('Failed to encode packet:', error);
      return null;
    }
  }

  static decode(data: Uint8Array): BitchatPacket | null {
    try {
      if (data.length < this.HEADER_SIZE + this.SENDER_ID_SIZE) {
        return null;
      }

      let offset = 0;

      // Header
      const version = data[offset++];
      const type = data[offset++];
      const ttl = data[offset++];

      // Timestamp (8 bytes, big-endian)
      let timestamp = BigInt(0);
      for (let i = 0; i < 8; i++) {
        timestamp = (timestamp << BigInt(8)) | BigInt(data[offset++]);
      }

      // Flags
      const flags = data[offset++];
      const hasRecipient = (flags & this.FLAGS.HAS_RECIPIENT) !== 0;
      const hasSignature = (flags & this.FLAGS.HAS_SIGNATURE) !== 0;
      const isCompressed = (flags & this.FLAGS.IS_COMPRESSED) !== 0;

      // Payload length
      const payloadLength = (data[offset++] << 8) | data[offset++];

      // Sender ID
      const senderID = data.slice(offset, offset + this.SENDER_ID_SIZE);
      offset += this.SENDER_ID_SIZE;

      // Recipient ID (if present)
      let recipientID: Uint8Array | undefined;
      if (hasRecipient) {
        recipientID = data.slice(offset, offset + this.RECIPIENT_ID_SIZE);
        offset += this.RECIPIENT_ID_SIZE;
      }

      // Extract original payload size if compressed
      let originalPayloadSize: number | null = null;
      let actualPayloadLength = payloadLength;
      if (isCompressed) {
        originalPayloadSize = (data[offset++] << 8) | data[offset++];
        actualPayloadLength -= 2;
      }

      // Payload
      let payload = data.slice(offset, offset + actualPayloadLength);
      offset += actualPayloadLength;

      // Decompress if needed
      if (isCompressed && originalPayloadSize) {
        const decompressed = this.decompress(payload, originalPayloadSize);
        if (decompressed) {
          payload = decompressed;
        }
      }

      // Signature (if present)
      let signature: Uint8Array | undefined;
      if (hasSignature) {
        signature = data.slice(offset, offset + this.SIGNATURE_SIZE);
      }

      return {
        version,
        type,
        ttl,
        timestamp,
        senderID: this.trimNullBytes(senderID),
        recipientID: recipientID ? this.trimNullBytes(recipientID) : undefined,
        payload,
        signature
      };
    } catch (error) {
      console.error('Failed to decode packet:', error);
      return null;
    }
  }

  private static trimNullBytes(data: Uint8Array): Uint8Array {
    const nullIndex = data.indexOf(0);
    return nullIndex >= 0 ? data.slice(0, nullIndex) : data;
  }

  private static shouldCompress(data: Uint8Array): boolean {
    // Compress if larger than 100 bytes and not already compressed
    return data.length > 100 && !this.isLikelyCompressed(data);
  }

  private static isLikelyCompressed(data: Uint8Array): boolean {
    // Simple heuristic: if very few repeated bytes, likely already compressed
    const uniqueBytes = new Set(data).size;
    return uniqueBytes / data.length > 0.7;
  }

  private static compress(_data: Uint8Array): Uint8Array | null {
    try {
      // Use simple LZ4-style compression
      // For now, return null to skip compression (can be implemented with lz4js)
      return null;
    } catch {
      return null;
    }
  }

  private static decompress(_data: Uint8Array, _originalSize: number): Uint8Array | null {
    try {
      // Implement decompression when compress is implemented
      return null;
    } catch {
      return null;
    }
  }
}

// Utility functions
export function generatePeerID(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
