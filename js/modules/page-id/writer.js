import { getPageFileHandle } from "../file-tree.js";
import { readPageId, replacePageId } from "./reader.js";

/** Recheck every source snapshot before writing and attempt rollback if a later write fails. */
export async function applyPageIdChanges(repositoryHandle, changes, profile) {
  if (!changes.length) return { written: 0 };
  const prepared = [];
  const seen = new Set();
  for (const change of changes) {
    if (seen.has(change.path)) throw new Error("Duplicate change for " + change.path);
    seen.add(change.path);
    const handle = await getPageFileHandle(repositoryHandle, change.path);
    const current = await (await handle.getFile()).text();
    if (current !== change.original) throw new Error(change.path + " changed since preview. Rescan before applying.");
    const currentId = readPageId(current, profile);
    if (currentId.status !== "placeholder" && !(change.allowAssigned && currentId.status === "assigned")) {
      throw new Error(change.path + ": Page ID is not editable in this operation.");
    }
    const updated = replacePageId(current, profile, change.nextValue, Boolean(change.allowAssigned));
    prepared.push({ handle, path: change.path, original: current, updated });
  }
  const written = [];
  try {
    for (const item of prepared) {
      const writable = await item.handle.createWritable();
      try { await writable.write(item.updated); await writable.close(); }
      catch (error) { try { await writable.abort(); } catch {} throw error; }
      written.push(item);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const item of [...written].reverse()) {
      try {
        const writable = await item.handle.createWritable();
        await writable.write(item.original);
        await writable.close();
      } catch (rollbackError) { rollbackErrors.push(item.path + ": " + rollbackError.message); }
    }
    const suffix = rollbackErrors.length ? " Recovery failed for " + rollbackErrors.join("; ") : " Earlier written files were restored.";
    throw new Error("Page ID write failed: " + error.message + "." + suffix);
  }
  return { written: written.length };
}
