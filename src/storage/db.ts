import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Item } from '../types';

const STORAGE_KEY = '@find_my_stuff_items';
const TAGS_KEY = '@find_my_stuff_tags';
const VERSION_KEY = '@find_my_stuff_version';

const CURRENT_VERSION = 1;

let cache: Item[] | null = null;

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

export async function getAllItems(): Promise<Item[]> {
  await runMigrations();
  if (cache) return cache.map(cloneItem);
  const json = await AsyncStorage.getItem(STORAGE_KEY);
  const items: Item[] = json ? JSON.parse(json) : [];
  cache = items;
  return items.map(cloneItem);
}

export async function saveItem(item: Item): Promise<void> {
  const items = await getAllItemsRaw();
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) {
    items[idx] = item;
  } else {
    items.push(item);
  }
  await persist(items);
}

export async function deleteItem(id: string): Promise<void> {
  const items = await getAllItemsRaw();
  const target = items.find(i => i.id === id);
  const filtered = items.filter(i => i.id !== id);
  await persist(filtered);
  // Clean up photo file
  if (target?.photoUri) {
    await deletePhotoFile(target.photoUri);
  }
}

export async function getItemById(id: string): Promise<Item | undefined> {
  const items = await getAllItems();
  const found = items.find(i => i.id === id);
  return found ? cloneItem(found) : undefined;
}

export async function searchItems(query: string): Promise<Item[]> {
  const items = await getAllItems();
  const q = query.toLowerCase().trim();
  if (!q) return items;
  return items.filter(item => {
    if (item.note.toLowerCase().includes(q)) return true;
    if (item.tags.some(t => t.toLowerCase().includes(q))) return true;
    if (item.annotations.some(a => a.label.toLowerCase().includes(q))) return true;
    return false;
  });
}

export async function getAllTags(): Promise<string[]> {
  const json = await AsyncStorage.getItem(TAGS_KEY);
  return json ? JSON.parse(json) : [];
}

export async function addTag(tag: string): Promise<void> {
  const tags = await getAllTags();
  if (!tags.includes(tag)) {
    tags.push(tag);
    await AsyncStorage.setItem(TAGS_KEY, JSON.stringify(tags));
  }
}

// ── Import / Bulk ─────────────────────────────────────────────────

export async function importItems(items: Item[]): Promise<{ imported: number; skipped: number }> {
  const existing = await getAllItemsRaw();
  const existingIds = new Set(existing.map(i => i.id));
  let imported = 0;
  let skipped = 0;

  for (const item of items) {
    if (!isValidItem(item)) {
      skipped++;
      continue;
    }
    if (existingIds.has(item.id)) {
      // Update existing
      const idx = existing.findIndex(i => i.id === item.id);
      existing[idx] = item;
    } else {
      existing.push(item);
    }
    imported++;
  }

  await persist(existing);
  return { imported, skipped };
}

// ── Internal ──────────────────────────────────────────────────────

/** Return raw cache without cloning — caller must not mutate */
async function getAllItemsRaw(): Promise<Item[]> {
  await runMigrations();
  if (cache) return cache;
  const json = await AsyncStorage.getItem(STORAGE_KEY);
  const items: Item[] = json ? JSON.parse(json) : [];
  cache = items;
  return items;
}

async function persist(items: Item[]): Promise<void> {
  // Size check
  const json = JSON.stringify(items);
  if (json.length > 5 * 1024 * 1024) {
    // >5MB — warn, don't reject
    console.warn(`[db] Data size ${(json.length / 1024 / 1024).toFixed(1)}MB approaching AsyncStorage limit`);
  }

  cache = items.map(cloneItem);
  const tagSet = new Set(await getAllTags());
  items.forEach(item => item.tags.forEach(t => tagSet.add(t)));

  await AsyncStorage.setItem(TAGS_KEY, JSON.stringify([...tagSet]));
  await AsyncStorage.setItem(STORAGE_KEY, json);
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
