// BitChat Message Model
// Port of the Swift BitchatMessage

export interface BitchatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
  isRelay: boolean;
  originalSender?: string;
  isPrivate: boolean;
  recipientNickname?: string;
  senderPeerID: string;
  mentions?: string[];
  channel?: string;
  encryptedContent?: Uint8Array;
  isEncrypted: boolean;
  deliveryStatus?: DeliveryStatus;
}

export enum DeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

export class BitchatMessageCodec {
  static toBinaryPayload(message: BitchatMessage): Uint8Array | null {
    // Try iOS binary format first for compatibility
    const iosPayload = BitchatMessageCodec.toIOSBinaryPayload(message);
    if (iosPayload) {
      return iosPayload;
    }

    // Fallback to JSON format for web-to-web compatibility
    try {
      const data: any = {
        id: message.id,
        sender: message.sender,
        content: message.content,
        timestamp: message.timestamp.getTime(),
        isRelay: message.isRelay,
        isPrivate: message.isPrivate,
        senderPeerID: message.senderPeerID,
        isEncrypted: message.isEncrypted
      };

      if (message.originalSender) {
        data.originalSender = message.originalSender;
      }
      if (message.recipientNickname) {
        data.recipientNickname = message.recipientNickname;
      }
      if (message.mentions) {
        data.mentions = message.mentions;
      }
      if (message.channel) {
        data.channel = message.channel;
      }
      if (message.encryptedContent) {
        data.encryptedContent = Array.from(message.encryptedContent);
      }

      const jsonString = JSON.stringify(data);
      return new TextEncoder().encode(jsonString);
    } catch (error) {
      console.error('Failed to encode message:', error);
      return null;
    }
  }

  // iOS-compatible binary format encoder (matches iOS toBinaryPayload)
  static toIOSBinaryPayload(message: BitchatMessage): Uint8Array | null {
    try {
      console.log('🍎 Encoding message in iOS binary format:', message);

      const data: number[] = [];

      // Flags (1 byte)
      let flags = 0;
      if (message.isRelay) flags |= 0x01;
      if (message.isPrivate) flags |= 0x02;
      if (message.originalSender) flags |= 0x04;
      if (message.recipientNickname) flags |= 0x08;
      if (message.senderPeerID) flags |= 0x10;
      if (message.mentions && message.mentions.length > 0) flags |= 0x20;
      if (message.channel) flags |= 0x40;
      if (message.isEncrypted) flags |= 0x80;

      data.push(flags);

      // Timestamp (8 bytes, big-endian, milliseconds)
      const timestampMillis = message.timestamp.getTime();
      for (let i = 7; i >= 0; i--) {
        data.push((timestampMillis >> (i * 8)) & 0xFF);
      }

      // Helper function to add length-prefixed string
      const addString = (str: string, maxLength: number = 255) => {
        const bytes = new TextEncoder().encode(str);
        const length = Math.min(bytes.length, maxLength);
        data.push(length);
        for (let i = 0; i < length; i++) {
          data.push(bytes[i]);
        }
      };

      // Helper function to add length-prefixed content (2 bytes length)
      const addContent = (str: string) => {
        const bytes = new TextEncoder().encode(str);
        const length = Math.min(bytes.length, 65535);
        data.push((length >> 8) & 0xFF);  // High byte
        data.push(length & 0xFF);         // Low byte
        for (let i = 0; i < length; i++) {
          data.push(bytes[i]);
        }
      };

      // ID
      addString(message.id);

      // Sender
      addString(message.sender);

      // Content or encrypted content
      if (message.isEncrypted && message.encryptedContent) {
        const length = Math.min(message.encryptedContent.length, 65535);
        data.push((length >> 8) & 0xFF);
        data.push(length & 0xFF);
        for (let i = 0; i < length; i++) {
          data.push(message.encryptedContent[i]);
        }
      } else {
        addContent(message.content);
      }

      // Optional fields
      if (message.originalSender) {
        addString(message.originalSender);
      }

      if (message.recipientNickname) {
        addString(message.recipientNickname);
      }

      if (message.senderPeerID) {
        addString(message.senderPeerID);
      }

      // Mentions array
      if (message.mentions && message.mentions.length > 0) {
        data.push(Math.min(message.mentions.length, 255));
        for (const mention of message.mentions.slice(0, 255)) {
          addString(mention);
        }
      }

      // Channel
      if (message.channel) {
        addString(message.channel);
      }

      const result = new Uint8Array(data);
      console.log('🍎 Encoded iOS binary payload:', result.length, 'bytes');
      return result;

    } catch (error) {
      console.error('🍎 Failed to encode iOS binary payload:', error);
      return null;
    }
  }

  static fromBinaryPayload(payload: Uint8Array): BitchatMessage | null {
    try {
      // First, try to decode as iOS binary format
      const iosMessage = BitchatMessageCodec.fromIOSBinaryPayload(payload);
      if (iosMessage) {
        return iosMessage;
      }

      // Fallback to JSON format (for web-to-web compatibility)
      const jsonString = new TextDecoder().decode(payload);

      // Add validation for JSON string
      if (!jsonString.trim()) {
        console.error('Empty payload received');
        return null;
      }

      // Check if it looks like JSON
      const trimmed = jsonString.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
        console.error('Payload does not appear to be JSON:', trimmed.substring(0, 100));
        return null;
      }

      const data = JSON.parse(jsonString);

      const message: BitchatMessage = {
        id: data.id,
        sender: data.sender,
        content: data.content,
        timestamp: new Date(data.timestamp),
        isRelay: data.isRelay || false,
        isPrivate: data.isPrivate || false,
        senderPeerID: data.senderPeerID,
        isEncrypted: data.isEncrypted || false
      };

      if (data.originalSender) {
        message.originalSender = data.originalSender;
      }
      if (data.recipientNickname) {
        message.recipientNickname = data.recipientNickname;
      }
      if (data.mentions) {
        message.mentions = data.mentions;
      }
      if (data.channel) {
        message.channel = data.channel;
      }
      if (data.encryptedContent) {
        message.encryptedContent = new Uint8Array(data.encryptedContent);
      }

      return message;
    } catch (error) {
      console.error('Failed to decode message:', error);
      return null;
    }
  }

  // iOS-compatible binary format decoder
  static fromIOSBinaryPayload(data: Uint8Array): BitchatMessage | null {
    try {
      console.log('🍎 Attempting to decode iOS binary payload:', data.length, 'bytes');

      if (data.length < 13) {
        console.log('🍎 Payload too short for iOS format');
        return null;
      }

      let offset = 0;

      // Flags (1 byte)
      const flags = data[offset++];
      const isRelay = (flags & 0x01) !== 0;
      const isPrivate = (flags & 0x02) !== 0;
      const hasOriginalSender = (flags & 0x04) !== 0;
      const hasRecipientNickname = (flags & 0x08) !== 0;
      const hasSenderPeerID = (flags & 0x10) !== 0;
      const hasMentions = (flags & 0x20) !== 0;
      const hasChannel = (flags & 0x40) !== 0;
      const isEncrypted = (flags & 0x80) !== 0;

      console.log('🍎 Flags:', {
        isRelay, isPrivate, hasOriginalSender, hasRecipientNickname,
        hasSenderPeerID, hasMentions, hasChannel, isEncrypted
      });

      // Timestamp (8 bytes, big-endian, milliseconds)
      if (offset + 8 > data.length) return null;
      let timestampMillis = 0;
      for (let i = 0; i < 8; i++) {
        timestampMillis = (timestampMillis << 8) | data[offset++];
      }
      const timestamp = new Date(timestampMillis);
      
      console.log('🍎 Parsed timestamp:', {
        timestampMillis,
        timestamp,
        formatted: timestamp.toISOString()
      });

      // ID
      if (offset >= data.length) return null;
      const idLength = data[offset++];
      if (offset + idLength > data.length) return null;
      const id = new TextDecoder().decode(data.slice(offset, offset + idLength));
      offset += idLength;

      // Sender
      if (offset >= data.length) return null;
      const senderLength = data[offset++];
      if (offset + senderLength > data.length) return null;
      const sender = new TextDecoder().decode(data.slice(offset, offset + senderLength));
      offset += senderLength;

      // Content (2 bytes length, big-endian)
      if (offset + 2 > data.length) return null;
      const contentLength = (data[offset] << 8) | data[offset + 1];
      offset += 2;
      if (offset + contentLength > data.length) return null;

      let content: string;
      let encryptedContent: Uint8Array | undefined;

      if (isEncrypted) {
        // Store encrypted content as binary
        encryptedContent = data.slice(offset, offset + contentLength);
        content = ""; // Placeholder
      } else {
        // Decode as UTF-8 string
        content = new TextDecoder().decode(data.slice(offset, offset + contentLength));
      }
      offset += contentLength;

      console.log('🍎 Decoded message:', { id, sender, content: content.substring(0, 50) });

      // Optional fields
      let originalSender: string | undefined;
      if (hasOriginalSender && offset < data.length) {
        const length = data[offset++];
        if (offset + length <= data.length) {
          originalSender = new TextDecoder().decode(data.slice(offset, offset + length));
          offset += length;
        }
      }

      let recipientNickname: string | undefined;
      if (hasRecipientNickname && offset < data.length) {
        const length = data[offset++];
        if (offset + length <= data.length) {
          recipientNickname = new TextDecoder().decode(data.slice(offset, offset + length));
          offset += length;
        }
      }

      let senderPeerID: string | undefined;
      if (hasSenderPeerID && offset < data.length) {
        const length = data[offset++];
        if (offset + length <= data.length) {
          senderPeerID = new TextDecoder().decode(data.slice(offset, offset + length));
          offset += length;
        }
      }

      let mentions: string[] | undefined;
      if (hasMentions && offset < data.length) {
        const mentionCount = data[offset++];
        mentions = [];
        for (let i = 0; i < mentionCount && offset < data.length; i++) {
          const length = data[offset++];
          if (offset + length <= data.length) {
            const mention = new TextDecoder().decode(data.slice(offset, offset + length));
            mentions.push(mention);
            offset += length;
          }
        }
      }

      let channel: string | undefined;
      if (hasChannel && offset < data.length) {
        const length = data[offset++];
        if (offset + length <= data.length) {
          channel = new TextDecoder().decode(data.slice(offset, offset + length));
          offset += length;
        }
      }

      const message: BitchatMessage = {
        id,
        sender,
        content,
        timestamp,
        isRelay,
        isPrivate,
        senderPeerID: senderPeerID || '',
        isEncrypted,
        originalSender,
        recipientNickname,
        mentions,
        channel,
        encryptedContent
      };

      console.log('🍎 SUCCESS: Decoded iOS message:', message);
      return message;

    } catch (error) {
      console.error('🍎 Failed to decode iOS binary payload:', error);
      return null;
    }
  }
}

// Delivery tracking
export interface DeliveryAck {
  messageID: string;
  recipientPeerID: string;
  recipientNickname: string;
  timestamp: Date;
  hopCount: number;
}

export interface ReadReceipt {
  messageID: string;
  readerPeerID: string;
  readerNickname: string;
  timestamp: Date;
}

export class DeliveryTracker {
  private static instance: DeliveryTracker;

  static getInstance(): DeliveryTracker {
    if (!DeliveryTracker.instance) {
      DeliveryTracker.instance = new DeliveryTracker();
    }
    return DeliveryTracker.instance;
  }

  generateAck(
    message: BitchatMessage,
    myPeerID: string,
    myNickname: string,
    hopCount: number
  ): DeliveryAck {
    return {
      messageID: message.id,
      recipientPeerID: myPeerID,
      recipientNickname: myNickname,
      timestamp: new Date(),
      hopCount
    };
  }

  generateReadReceipt(
    message: BitchatMessage,
    myPeerID: string,
    myNickname: string
  ): ReadReceipt {
    return {
      messageID: message.id,
      readerPeerID: myPeerID,
      readerNickname: myNickname,
      timestamp: new Date()
    };
  }
}

// Channel metadata
export interface ChannelMetadata {
  channel: string;
  name?: string;
  description?: string;
  creatorPeerID: string;
  createdAt: Date;
  isPasswordProtected: boolean;
  memberCount?: number;
}

export class ChannelMetadataCodec {
  static encode(metadata: ChannelMetadata): Uint8Array | null {
    try {
      const data = {
        channel: metadata.channel,
        name: metadata.name,
        description: metadata.description,
        creatorPeerID: metadata.creatorPeerID,
        createdAt: metadata.createdAt.getTime(),
        isPasswordProtected: metadata.isPasswordProtected,
        memberCount: metadata.memberCount
      };

      const jsonString = JSON.stringify(data);
      return new TextEncoder().encode(jsonString);
    } catch {
      return null;
    }
  }

  static decode(data: Uint8Array): ChannelMetadata | null {
    try {
      const jsonString = new TextDecoder().decode(data);
      const parsed = JSON.parse(jsonString);

      return {
        channel: parsed.channel,
        name: parsed.name,
        description: parsed.description,
        creatorPeerID: parsed.creatorPeerID,
        createdAt: new Date(parsed.createdAt),
        isPasswordProtected: parsed.isPasswordProtected,
        memberCount: parsed.memberCount
      };
    } catch {
      return null;
    }
  }
}

// Utility functions
export function generateMessageID(): string {
  return crypto.randomUUID ? crypto.randomUUID() : generateRandomString(36);
}

function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
