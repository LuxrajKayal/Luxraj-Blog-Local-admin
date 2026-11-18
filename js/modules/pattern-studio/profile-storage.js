import { cloneProfile, createLuxrajProfile } from "../page-id/default-profile.js";

const DB_NAME = "luxraj-page-id-patterns";
const STORE = "profiles";

function withDatabase(callback) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error || new Error("Cannot access pattern storage."));
    request.onsuccess = async () => {
      const db = request.result;
      try { resolve(await callback(db)); }
      catch (error) { reject(error); }
      finally { db.close(); }
    };
  });
}

function readProfiles(db) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get("all");
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function sameHandle(a, b) {
  return Boolean(a && b && typeof a.isSameEntry === "function" && await a.isSameEntry(b));
}

export async function loadRepositoryProfile(directoryHandle) {
  const saved = await withDatabase(async db => {
    const records = await readProfiles(db);
    for (const record of records) if (await sameHandle(record.directoryHandle, directoryHandle)) return record.profile;
    return null;
  });
  return { profile: cloneProfile(saved || createLuxrajProfile()), saved: Boolean(saved) };
}

export async function saveRepositoryProfile(directoryHandle, profile) {
  return withDatabase(async db => {
    const records = await readProfiles(db);
    let found = false;
    for (const record of records) {
      if (await sameHandle(record.directoryHandle, directoryHandle)) {
        record.profile = cloneProfile(profile);
        found = true;
        break;
      }
    }
    if (!found) records.push({ directoryHandle, profile: cloneProfile(profile) });
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(records, "all");
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  });
}
