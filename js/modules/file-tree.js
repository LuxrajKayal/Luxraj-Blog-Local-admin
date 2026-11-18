const IGNORED_DIRECTORY_NAMES = new Set([".git", "node_modules"]);
const MAX_DEPTH = 32;

export async function walkHtmlFiles(directoryHandle, parent = "", depth = 0, results = []) {
  if (!directoryHandle || typeof directoryHandle.entries !== "function") {
    throw new Error("Connect a local repository folder before scanning HTML files.");
  }
  if (depth > MAX_DEPTH) throw new Error("Repository folders are nested too deeply to scan.");
  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind === "directory") {
      if (IGNORED_DIRECTORY_NAMES.has(name.toLowerCase())) continue;
      await walkHtmlFiles(handle, parent ? parent + "/" + name : name, depth + 1, results);
      continue;
    }
    if (handle.kind !== "file" || !/\.html?$/i.test(name)) continue;
    const relativePath = parent ? parent + "/" + name : name;
    results.push({ name, path: relativePath, directory: parent || ".", handle });
  }
  return results.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));
}

export async function getPageFileHandle(repositoryHandle, relativePath) {
  const segments = relativePath.split("/");
  if (!segments.length || segments.some(segment => !segment || segment === "." || segment === "..")) {
    throw new Error("Invalid repository file path.");
  }
  let directory = repositoryHandle;
  for (const segment of segments.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment);
  }
  return directory.getFileHandle(segments.at(-1));
}
