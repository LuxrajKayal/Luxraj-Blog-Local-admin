import { walkHtmlFiles } from "../file-tree.js";
import { readPageId } from "./reader.js";

/** Scan all HTML Page IDs (including pages excluded from the SEO selector) for uniqueness. */
export async function scanPageIdRecords(repositoryHandle, profile) {
  const files = await walkHtmlFiles(repositoryHandle);
  const records = [];
  for (const file of files) {
    const source = await (await file.handle.getFile()).text();
    records.push({ path: file.path, name: file.name, source, pageId: readPageId(source, profile) });
  }
  return records;
}
