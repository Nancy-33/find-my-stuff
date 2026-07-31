import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { Item } from '../types';
import { itemsKey, tagsKey, photoPrefix, photoDBName, VERSION_KEY, LEGACY_ITEMS_KEY, LEGACY_TAGS_KEY, LEGACY_PHOTO_PREFIX } from '../auth/authConfig';

// ── IndexedDB helpers (web only) ──────────────────────────────────

let photoDB: IDBDatabase | null = null;
let photoDBUserId: string | null = null;

function openPhotoDB(userId: string): Promise<IDBDatabase> {
  if (photoDB && photoDBUserId === userId) return Promise.resolve(photoDB);
  // Different user — close existing connection
  if (photoDB) {
    try { photoDB.close(); } catch { /* ignore */ }
    photoDB = null;
    photoDBUserId = null;
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(photoDBName(userId), 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('photos', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      photoDB = request.result;
      photoDBUserId = userId;
      resolve(photoDB);
    };
    request.onerror = () => reject(request.error);
  });
}

async function savePhotoToIDB(userId: string, id: string, dataUri: string): Promise<void> {
  const db = await openPhotoDB(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').put({ id, data: dataUri });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getPhotoFromIDB(userId: string, id: string): Promise<string | null> {
  const db = await openPhotoDB(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly');
    const req = tx.objectStore('photos').get(id);
    req.onsuccess = () => resolve(req.result?.data ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function deletePhotoFromIDB(userId: string, id: string): Promise<void> {
  const db = await openPhotoDB(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const CURRENT_VERSION = 1;

let cache: Item[] | null = null;
let cacheUserId: string | null = null;

function invalidateCache() {
  cache = null;
  cacheUserId = null;
}

// ── Version & Migration ──────────────────────────────────────────

async function getVersion(): Promise<number> {
  const v = await AsyncStorage.getItem(VERSION_KEY);
  return v ? parseInt(v, 10) : 0;
}

async function setVersion(v: number): Promise<void> {
  await AsyncStorage.setItem(VERSION_KEY, String(v));
}

async function runMigrations(): Promise<void> {
  const v = await getVersion();
  if (v < CURRENT_VERSION) {
    // v0 → v1: no structural changes yet, just stamp version
    await setVersion(CURRENT_VERSION);
  }
}

// ── File helpers ──────────────────────────────────────────────────

export async function deletePhotoFile(uri: string): Promise<void> {
  try {
    const exists = await FileSystem.getInfoAsync(uri);
    if (exists.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // File may already be gone — not an error worth surfacing
  }
}

// ── CRUD ──────────────────────────────────────────────────────────

export async function getAllItems(userId: string): Promise<Item[]> {
  await runMigrations();
  if (cache && cacheUserId === userId) return cache.map(cloneItem);
  const json = await AsyncStorage.getItem(itemsKey(userId));
  const items: Item[] = json ? JSON.parse(json) : [];
  cache = await resolvePhotoUris(userId, items);
  cacheUserId = userId;
  return cache.map(cloneItem);
}

export async function saveItem(userId: string, item: Item): Promise<void> {
  const items = await getAllItemsRaw(userId);

  // Separate large base64 photo data from the JSON payload
  // to avoid exceeding AsyncStorage / localStorage size limits on web
  if (item.photoUri.startsWith('data:')) {
    if (item.photoUri.length > 3 * 1024 * 1024) {
      console.warn(`[db] photoUri is ${(item.photoUri.length / 1024 / 1024).toFixed(1)}MB, may exceed storage limits`);
    }
    try {
      if (Platform.OS === 'web') {
        await savePhotoToIDB(userId, item.id, item.photoUri);
      } else {
        await AsyncStorage.setItem(photoPrefix(userId) + item.id, item.photoUri);
      }
      item = { ...item, photoUri: photoPrefix(userId) + item.id };
    } catch (e) {
      console.warn('[db] Failed to save photo data separately, keeping embedded base64:', String(e));
    }
  }

  const idx = items.findIndex(i => i.id === item.id);

  if (idx >= 0) {
    items[idx] = item;
  } else {
    items.push(item);
  }
  await persist(userId, items);
}

export async function deleteItem(userId: string, id: string): Promise<void> {
  console.log('[db] deleteItem called with id:', id);
  const items = await getAllItemsRaw(userId);
  console.log('[db] deleteItem - items before:', items.length);
  const target = items.find(i => i.id === id);
  const filtered = items.filter(i => i.id !== id);
  console.log('[db] deleteItem - items after filter:', filtered.length);
  await persist(userId, filtered);
  console.log('[db] deleteItem - persist done');

  // Clean up separate large photo data (IndexedDB on web, AsyncStorage on native).
  // Do this first so even if file cleanup below throws, the binary blob is gone.
  try {
    if (Platform.OS === 'web') {
      console.log('[db] deleteItem - deleting photo from IndexedDB:', id);
      await deletePhotoFromIDB(userId, id);
    } else {
      console.log('[db] deleteItem - removing photo from AsyncStorage:', id);
      await AsyncStorage.removeItem(photoPrefix(userId) + id);
    }
    console.log('[db] deleteItem - photo data cleanup done');
  } catch {
    console.warn('[db] deleteItem - photo data cleanup failed (non-critical)');
    // Key may not exist or store may be unavailable — not a critical error
  }

  // Clean up photo file on native.
  // Skip on web: expo-file-system is a shim there and photos live in IndexedDB.
  // Also skip data: URIs and unresolved photo references — FileSystem cannot
  // delete those; they were already cleaned up by the block above.
  if (target?.photoUri && Platform.OS !== 'web') {
    const isDataUri = target.photoUri.startsWith('data:');
    const isPhotoRef = target.photoUri.startsWith(photoPrefix(userId));
    if (!isDataUri && !isPhotoRef) {
      try {
        console.log('[db] deleteItem - deleting photo file:', target.photoUri);
        await deletePhotoFile(target.photoUri);
      } catch {
        // File may already be gone — not an error worth surfacing
      }
    }
  }

  console.log('[db] deleteItem - complete for id:', id);
}

export async function getItemById(userId: string, id: string): Promise<Item | undefined> {
  const items = await getAllItems(userId);
  const found = items.find(i => i.id === id);
  return found ? cloneItem(found) : undefined;
}

export async function searchItems(userId: string, query: string): Promise<Item[]> {
  const items = await getAllItems(userId);
  const q = query.toLowerCase().trim();
  if (!q) return items;
  return items.filter(item => {
    if (item.note.toLowerCase().includes(q)) return true;
    if (item.tags.some(t => t.toLowerCase().includes(q))) return true;
    if (item.annotations.some(a => a.label.toLowerCase().includes(q))) return true;
    return false;
  });
}

export async function getAllTags(userId: string): Promise<string[]> {
  const json = await AsyncStorage.getItem(tagsKey(userId));
  return json ? JSON.parse(json) : [];
}

export async function addTag(userId: string, tag: string): Promise<void> {
  const tags = await getAllTags(userId);
  if (!tags.includes(tag)) {
    tags.push(tag);
    await AsyncStorage.setItem(tagsKey(userId), JSON.stringify(tags));
  }
}

// ── Import / Bulk ─────────────────────────────────────────────────

export async function importItems(userId: string, items: Item[]): Promise<{ imported: number; skipped: number }> {
  const existing = await getAllItemsRaw(userId);
  const existingIds = new Set(existing.map(i => i.id));
  let imported = 0;
  let skipped = 0;

  for (const item of items) {
    if (!isValidItem(item)) {
      skipped++;
      continue;
    }
    item.userId = userId;
    if (existingIds.has(item.id)) {
      // Update existing
      const idx = existing.findIndex(i => i.id === item.id);
      existing[idx] = item;
    } else {
      existing.push(item);
    }
    imported++;
  }

  await persist(userId, existing);
  return { imported, skipped };
}

// ── Legacy Migration ──────────────────────────────────────────────

export async function migrateLegacyData(userId: string): Promise<number> {
  // Check if legacy data exists
  const legacyJson = await AsyncStorage.getItem(LEGACY_ITEMS_KEY);
  if (!legacyJson) return 0;

  // Check if user already has their own data (already migrated or created fresh)
  const userJson = await AsyncStorage.getItem(itemsKey(userId));
  if (userJson) return 0; // Already has data, don't overwrite

  const legacyItems: Item[] = JSON.parse(legacyJson);
  if (legacyItems.length === 0) return 0;

  // Copy legacy tags
  const legacyTags = await AsyncStorage.getItem(LEGACY_TAGS_KEY);
  if (legacyTags) {
    await AsyncStorage.setItem(tagsKey(userId), legacyTags);
  }

  // Resolve photos from legacy storage
  const resolved = await resolveLegacyPhotoUris(legacyItems);

  // Migrate photos to per-user IndexedDB (web) or AsyncStorage (native)
  for (const item of resolved) {
    if (item.photoUri.startsWith('data:')) {
      try {
        if (Platform.OS === 'web') {
          await savePhotoToIDB(userId, item.id, item.photoUri);
        } else {
          await AsyncStorage.setItem(photoPrefix(userId) + item.id, item.photoUri);
        }
        item.photoUri = photoPrefix(userId) + item.id;
      } catch { /* keep as-is */ }
    }
  }

  // Save to user-scoped storage
  await AsyncStorage.setItem(itemsKey(userId), JSON.stringify(resolved));

  // Update in-memory cache
  cache = resolved;
  cacheUserId = userId;

  return resolved.length;
}

// Helper: resolve photos using legacy keys (for migration only)
async function resolveLegacyPhotoUris(items: Item[]): Promise<Item[]> {
  const resolved: Item[] = [];
  for (const item of items) {
    if (item.photoUri.startsWith(LEGACY_PHOTO_PREFIX)) {
      const photoId = item.photoUri.replace(LEGACY_PHOTO_PREFIX, '');
      let photoData: string | null = null;
      try {
        if (Platform.OS === 'web') {
          // Try old IndexedDB
          photoData = await getLegacyPhotoFromIDB(photoId);
          if (!photoData) {
            photoData = await AsyncStorage.getItem(LEGACY_PHOTO_PREFIX + photoId);
          }
        } else {
          photoData = await AsyncStorage.getItem(item.photoUri);
        }
      } catch { /* ignore */ }
      resolved.push({ ...item, photoUri: photoData || item.photoUri });
    } else {
      resolved.push(item);
    }
  }
  return resolved;
}

// Helper: get photo from old non-user-scoped IndexedDB
async function getLegacyPhotoFromIDB(id: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('FindMyStuffPhotos', 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('photos', 'readonly');
        const req = tx.objectStore('photos').get(id);
        req.onsuccess = () => resolve(req.result?.data ?? null);
        req.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// ── Internal ──────────────────────────────────────────────────────

/** Reconstruct full photo data URIs from separate storage (IndexedDB on web, AsyncStorage on native) */
async function resolvePhotoUris(userId: string, items: Item[]): Promise<Item[]> {
  const resolved: Item[] = [];
  for (const item of items) {
    if (item.photoUri.startsWith(photoPrefix(userId))) {
      const photoId = item.photoUri.replace(photoPrefix(userId), '');
      let photoData: string | null = null;
      try {
        if (Platform.OS === 'web') {
          photoData = await getPhotoFromIDB(userId, photoId);
          if (!photoData) {
            // Fallback: try AsyncStorage for photos saved before IndexedDB migration
            try {
              photoData = await AsyncStorage.getItem(photoPrefix(userId) + photoId);
              if (photoData) {
                // Migrate to IndexedDB for future loads
                try {
                  await savePhotoToIDB(userId, photoId, photoData);
                  await AsyncStorage.removeItem(photoPrefix(userId) + photoId);
                } catch { /* migration failed silently, will retry next time */ }
              }
            } catch { /* ignore */ }
          }
        } else {
          photoData = await AsyncStorage.getItem(item.photoUri);
        }
      } catch {
        // ignore
      }
      resolved.push({ ...item, photoUri: photoData || item.photoUri });
    } else if (item.photoUri.startsWith(LEGACY_PHOTO_PREFIX)) {
      // Fallback: resolve from legacy storage for items that haven't been fully migrated yet
      const photoId = item.photoUri.replace(LEGACY_PHOTO_PREFIX, '');
      let photoData: string | null = null;
      try {
        if (Platform.OS === 'web') {
          photoData = await getLegacyPhotoFromIDB(photoId);
          if (!photoData) {
            photoData = await AsyncStorage.getItem(LEGACY_PHOTO_PREFIX + photoId);
          }
        } else {
          photoData = await AsyncStorage.getItem(item.photoUri);
        }
      } catch { /* ignore */ }
      resolved.push({ ...item, photoUri: photoData || item.photoUri });
    } else {
      resolved.push(item);
    }
  }
  return resolved;
}

/** Return raw cache without cloning — caller must not mutate */
async function getAllItemsRaw(userId: string): Promise<Item[]> {
  await runMigrations();
  if (cache && cacheUserId === userId) return cache;
  const json = await AsyncStorage.getItem(itemsKey(userId));
  const items: Item[] = json ? JSON.parse(json) : [];
  cache = await resolvePhotoUris(userId, items);
  cacheUserId = userId;
  return cache;
}

async function persist(userId: string, items: Item[]): Promise<void> {
  console.log(`[db] Persisting ${items.length} items`);

  // Ensure no base64 data URIs are embedded in the serialized JSON.
  // Old items (saved before this fix) may still have embedded base64 —
  // migrate them automatically so the combined JSON stays small.
  const serializableItems: Item[] = [];
  for (const item of items) {
    if (item.photoUri.startsWith('data:')) {
      try {
        if (Platform.OS === 'web') {
          await savePhotoToIDB(userId, item.id, item.photoUri);
        } else {
          await AsyncStorage.setItem(photoPrefix(userId) + item.id, item.photoUri);
        }
        serializableItems.push({ ...item, photoUri: photoPrefix(userId) + item.id });
      } catch (e) {
        console.warn('[db] Failed to save photo data separately, keeping embedded base64:', String(e));
        serializableItems.push(item);
      }
    } else {
      serializableItems.push(item);
    }
  }

  const json = JSON.stringify(serializableItems);
  console.log(`[db] JSON size: ${(json.length / 1024).toFixed(1)}KB`);
  if (json.length > 5 * 1024 * 1024) {
    console.warn(`[db] Data size ${(json.length / 1024 / 1024).toFixed(1)}MB approaching AsyncStorage limit`);
  }

  const tagSet = new Set(await getAllTags(userId));
  items.forEach(item => item.tags.forEach(t => tagSet.add(t)));

  await AsyncStorage.setItem(tagsKey(userId), JSON.stringify([...tagSet]));
  await AsyncStorage.setItem(itemsKey(userId), json);

  // Only update in-memory cache after persistence is confirmed,
  // so a failed write doesn't leave cache out of sync with storage.
  // Resolve photo URIs so cached items always carry usable URIs
  // (file paths or full data URIs), never internal @photo_ references.
  cache = await resolvePhotoUris(userId, serializableItems.map(cloneItem));
  cacheUserId = userId;
}

function cloneItem(item: Item): Item {
  return {
    ...item,
    annotations: item.annotations.map(a => ({ ...a })),
    tags: [...item.tags],
  };
}

export function isValidItem(item: unknown): item is Item {
  if (!item || typeof item !== 'object') return false;
  const i = item as Record<string, unknown>;
  return (
    typeof i.id === 'string' && i.id.length > 0 &&
    typeof i.photoUri === 'string' && i.photoUri.length > 0 &&
    typeof i.createdAt === 'number' && i.createdAt > 0 &&
    Array.isArray(i.annotations) &&
    Array.isArray(i.tags)
  );
}
