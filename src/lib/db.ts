import { openDB, type IDBPDatabase } from "idb";
import type { ZineRecord } from "../types";

const DB_NAME = "zine-maker";
const DB_VERSION = 1;
const ZINES_STORE = "zines";
const IMAGES_STORE = "images";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(ZINES_STORE)) {
          db.createObjectStore(ZINES_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(IMAGES_STORE)) {
          db.createObjectStore(IMAGES_STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function listZines(): Promise<ZineRecord[]> {
  const db = await getDb();
  const all = (await db.getAll(ZINES_STORE)) as ZineRecord[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getZine(id: string): Promise<ZineRecord | undefined> {
  const db = await getDb();
  return db.get(ZINES_STORE, id);
}

export async function saveZine(zine: ZineRecord): Promise<void> {
  const db = await getDb();
  await db.put(ZINES_STORE, zine);
}

export async function deleteZine(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(ZINES_STORE, id);
}

export async function saveImage(id: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put(IMAGES_STORE, blob, id);
}

export async function getImage(id: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get(IMAGES_STORE, id);
}

export async function deleteImage(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(IMAGES_STORE, id);
}
