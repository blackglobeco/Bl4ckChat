// Basic crypto utilities for BitChat Web
// This provides essential cryptographic functions using Web Crypto API

export class CryptoUtil {
  /**
   * Generate a random hex string of specified length
   */
  static generateRandomHex(length: number): string {
    const bytes = new Uint8Array(length / 2);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Generate a secure random ID
   */
  static generateSecureID(): string {
    if (crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older browsers
    return this.generateRandomHex(32);
  }

  /**
   * Hash data using SHA-256
   */
  static async sha256(data: string | Uint8Array): Promise<string> {
    const encoder = new TextEncoder();
    const dataBytes = typeof data === 'string' ? encoder.encode(data) : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Generate AES-GCM key
   */
  static async generateAESKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data using AES-GCM
   */
  static async encryptAES(
    data: string | Uint8Array,
    key: CryptoKey
  ): Promise<{ encrypted: Uint8Array; iv: Uint8Array }> {
    const encoder = new TextEncoder();
    const dataBytes = typeof data === 'string' ? encoder.encode(data) : data;

    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      dataBytes
    );

    return {
      encrypted: new Uint8Array(encrypted),
      iv: iv
    };
  }

  /**
   * Decrypt data using AES-GCM
   */
  static async decryptAES(
    encryptedData: Uint8Array,
    key: CryptoKey,
    iv: Uint8Array
  ): Promise<Uint8Array> {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encryptedData
    );

    return new Uint8Array(decrypted);
  }

  /**
   * Derive key from password using PBKDF2
   */
  static async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array,
    iterations: number = 100000
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256'
      },
      passwordKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Generate salt for key derivation
   */
  static generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16));
  }

  /**
   * Convert CryptoKey to raw bytes (for storage/transmission)
   */
  static async exportKey(key: CryptoKey): Promise<Uint8Array> {
    const exported = await crypto.subtle.exportKey('raw', key);
    return new Uint8Array(exported);
  }

  /**
   * Import raw bytes as CryptoKey
   */
  static async importKey(keyData: Uint8Array): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      'AES-GCM',
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Constant-time comparison to prevent timing attacks
   */
  static constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }

    return result === 0;
  }

  /**
   * Secure random number between 0 and max (exclusive)
   */
  static secureRandom(max: number): number {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] % max;
  }

  /**
   * Generate a fingerprint from public key data
   */
  static async generateFingerprint(publicKeyData: Uint8Array): Promise<string> {
    const hash = await this.sha256(publicKeyData);
    // Format as readable fingerprint (groups of 4 characters)
    return hash.match(/.{4}/g)?.join(' ') || hash;
  }
}

// Utility for managing encryption states
export enum EncryptionStatus {
  NONE = 'none',
  PENDING = 'pending',
  ENCRYPTED = 'encrypted',
  FAILED = 'failed'
}

// Simple key-value store using localStorage with encryption
export class SecureStorage {
  private static keyPrefix = 'bitchat_secure_';

  static async store(key: string, value: string, password?: string): Promise<void> {
    const storageKey = this.keyPrefix + key;

    if (password) {
      // Encrypt the value
      const salt = CryptoUtil.generateSalt();
      const derivedKey = await CryptoUtil.deriveKeyFromPassword(password, salt);
      const { encrypted, iv } = await CryptoUtil.encryptAES(value, derivedKey);

      // Store salt + iv + encrypted data
      const combined = new Uint8Array(salt.length + iv.length + encrypted.length);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(encrypted, salt.length + iv.length);

      localStorage.setItem(storageKey, btoa(String.fromCharCode(...combined)));
    } else {
      // Store as plaintext
      localStorage.setItem(storageKey, value);
    }
  }

  static async retrieve(key: string, password?: string): Promise<string | null> {
    const storageKey = this.keyPrefix + key;
    const stored = localStorage.getItem(storageKey);

    if (!stored) {
      return null;
    }

    if (password) {
      try {
        // Decrypt the value
        const combined = new Uint8Array(atob(stored).split('').map(c => c.charCodeAt(0)));
        const salt = combined.slice(0, 16);
        const iv = combined.slice(16, 28);
        const encrypted = combined.slice(28);

        const derivedKey = await CryptoUtil.deriveKeyFromPassword(password, salt);
        const decrypted = await CryptoUtil.decryptAES(encrypted, derivedKey, iv);

        return new TextDecoder().decode(decrypted);
      } catch (error) {
        console.error('Failed to decrypt stored value:', error);
        return null;
      }
    } else {
      return stored;
    }
  }

  static remove(key: string): void {
    const storageKey = this.keyPrefix + key;
    localStorage.removeItem(storageKey);
  }

  static clear(): void {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(this.keyPrefix)) {
        localStorage.removeItem(key);
      }
    });
  }
}
