const DATABASE_NAME = "luxraj-local-cms";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace";
const WORKSPACE_KEY = "active-repository";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("This browser does not support IndexedDB, so the repository folder cannot be remembered."));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the workspace store."));
  });
}

async function withStore(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let request;

    try {
      request = operation(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }

    transaction.oncomplete = () => {
      database.close();
      resolve(request?.result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? request?.error ?? new Error("Workspace storage failed."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Workspace storage was interrupted."));
    };
  });
}

export async function getSavedWorkspace() {
  try {
    return (await withStore("readonly", (store) => store.get(WORKSPACE_KEY))) ?? null;
  } catch (error) {
    console.warn("Could not restore the saved workspace:", error);
    return null;
  }
}

export async function saveWorkspace(directoryHandle, selectedBranch = "") {
  const record = {
    directoryHandle,
    directoryName: directoryHandle.name,
    selectedBranch,
    savedAt: new Date().toISOString(),
  };
  await withStore("readwrite", (store) => store.put(record, WORKSPACE_KEY));
  return record;
}

export async function saveSelectedBranch(selectedBranch) {
  const existing = await getSavedWorkspace();
  if (!existing?.directoryHandle) return;
  await saveWorkspace(existing.directoryHandle, selectedBranch);
}

export async function clearSavedWorkspace() {
  await withStore("readwrite", (store) => store.delete(WORKSPACE_KEY));
}