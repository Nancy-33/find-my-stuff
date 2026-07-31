import * as Crypto from 'expo-crypto';

// ── Security Question Presets ─────────────────────────────────

export const SECURITY_QUESTIONS: readonly string[] = [
  '你的出生城市是哪里？',
  '你小时候最喜欢的动画片是什么？',
  '你的第一所学校的名字是什么？',
  '你的母亲叫什么名字？',
  '你最喜欢的食物是什么？',
];

// ── Answer Hashing ────────────────────────────────────────────

const SALT_LENGTH = 16;

function generateSalt(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let salt = '';
  for (let i = 0; i < SALT_LENGTH; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
}

/**
 * Hash a security answer with a random salt.
 * Answers are trimmed and lowercased before hashing for case-insensitive comparison.
 */
export async function hashSecurityAnswer(answer: string): Promise<{ hash: string; salt: string }> {
  const salt = generateSalt();
  const normalized = answer.trim().toLowerCase();
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    salt + normalized
  );
  return { hash, salt };
}

/**
 * Verify a security answer against a stored hash and salt.
 */
export async function verifySecurityAnswer(
  answer: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  const normalized = answer.trim().toLowerCase();
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    salt + normalized
  );
  return hash === expectedHash;
}
