// ============================================
// AD FUSION - Encryption Utilities
// ============================================
import CryptoJS from 'crypto-js';
import config from '../config';

// Encrypt sensitive data (Meta access tokens, etc.)
export function encrypt(text: string): string {
  const key = CryptoJS.enc.Utf8.parse(config.encryption.key);
  const iv = CryptoJS.enc.Utf8.parse(config.encryption.iv);

  const encrypted = CryptoJS.AES.encrypt(text, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return encrypted.toString();
}

// Decrypt sensitive data
export function decrypt(ciphertext: string): string {
  const key = CryptoJS.enc.Utf8.parse(config.encryption.key);
  const iv = CryptoJS.enc.Utf8.parse(config.encryption.iv);

  const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}

// Hash sensitive data for comparison (one-way)
export function hashData(data: string): string {
  return CryptoJS.SHA256(data).toString();
}
