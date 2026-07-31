/**
 * Purpose: Connector credentials at rest — AES-256-GCM with a key derived
 *          from the session secret. Protects the realistic leak paths (db
 *          backups, volume snapshots, stray copies) for zero extra ops.
 * Author(s): John Reed
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const SALT = Buffer.from('okrdokey-connector-secrets-v1');
const INFO = 'connector-credentials';

function deriveKey(sessionSecret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(sessionSecret), SALT, INFO, 32));
}

// iv ‖ tag ‖ ciphertext, base64
export function encryptSecret(plaintext: string, sessionSecret: string): string {
  const key = deriveKey(sessionSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decryptSecret(payload: string, sessionSecret: string): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(sessionSecret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
