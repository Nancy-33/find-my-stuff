import * as Crypto from 'expo-crypto';

// ── Storage Keys ─────────────────────────────────────────────────

/** All registered users: { id, username, passwordHash, salt, createdAt }[] */
export const USERS_KEY = '@find_my_stuff_users';

/** Current login session: { userId, username, loginTime } */
export const SESSION_KEY = '@find_my_stuff_session';

/** Global schema version key (unchanged from pre-auth era) */
export const VERSION_KEY = '@find_my_stuff_version';

/** Per-user items: @find_my_stuff_{userId}_items */
export const itemsKey = (userId: string) => `@find_my_stuff_${userId}_items`;

/** Per-user tags: @find_my_stuff_{userId}_tags */
export const tagsKey = (userId: string) => `@find_my_stuff_${userId}_tags`;

/** Per-user photo prefix: @find_my_stuff_{userId}_photo_ */
export const photoPrefix = (userId: string) => `@find_my_stuff_${userId}_photo_`;

/** Old flat keys — used only for legacy data migration */
export const LEGACY_ITEMS_KEY = '@find_my_stuff_items';
export const LEGACY_TAGS_KEY = '@find_my_stuff_tags';
export const LEGACY_PHOTO_PREFIX = '@find_my_stuff_photo_';

/** IndexedDB database name per user */
export const photoDBName = (userId: string) => `FindMyStuffPhotos_${userId}`;

// ── Validation ──────────────────────────────────────────────────

export const MIN_USERNAME_LENGTH = 2;
export const MIN_PASSWORD_LENGTH = 4;
export const SALT_LENGTH = 16;

// ── Password Hashing ────────────────────────────────────────────

function generateSalt(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let salt = '';
  for (let i = 0; i < SALT_LENGTH; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = generateSalt();
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    salt + password
  );
  return { hash, salt };
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    salt + password
  );
  return hash === expectedHash;
}
