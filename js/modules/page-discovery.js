import { walkHtmlFiles } from "./file-tree.js";
import { isSeoEligible } from "./seo-eligibility.js";

/** Read eligible source pages; the UI independently manages selected checkboxes. */
export async function discoverHtmlPages(repositoryHandle, options = {}) {
  const files = await walkHtmlFiles(repositoryHandle);
  const pages = [];
  for (const file of files) {
    const source = await (await file.handle.getFile()).text();
    if (!isSeoEligible(source, options.seoAttribute || "data-luxraj-seo")) continue;
    pages.push({ name: file.name, path: file.path, directory: file.directory });
  }
  return pages;
}
