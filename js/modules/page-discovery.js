const IGNORED_DIRECTORY_NAMES = new Set([".git", "node_modules"]);
const HTML_PAGE_EXTENSION = /\.(html?|HTML?)$/;

async function scanDirectory(directoryHandle, parentPath = "", depth = 0, pages = []) {
  if (depth > 32) {
    throw new Error("The repository folder structure is nested too deeply to scan safely.");
  }

  for await (const [entryName, entryHandle] of directoryHandle.entries()) {
    if (entryHandle.kind === "directory") {
      if (IGNORED_DIRECTORY_NAMES.has(entryName)) continue;
      await scanDirectory(
        entryHandle,
        parentPath ? parentPath + "/" + entryName : entryName,
        depth + 1,
        pages,
      );
      continue;
    }

    if (entryHandle.kind !== "file" || !HTML_PAGE_EXTENSION.test(entryName)) continue;

    const relativePath = parentPath ? parentPath + "/" + entryName : entryName;
    pages.push({
      name: entryName,
      path: relativePath,
      directory: parentPath || ".",
    });
  }

  return pages;
}

/**
 * Discover HTML documents in the currently selected local working tree.
 * This is a filesystem scan, not a Git branch/tree lookup.
 */
export async function discoverHtmlPages(repositoryHandle) {
  if (!repositoryHandle || typeof repositoryHandle.entries !== "function") {
    throw new Error("Connect a local repository folder before scanning its pages.");
  }

  const pages = await scanDirectory(repositoryHandle);
  return pages.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));
}