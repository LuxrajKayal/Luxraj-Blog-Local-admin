export function supportsLocalFolderAccess() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export async function chooseRepositoryFolder() {
  if (!supportsLocalFolderAccess()) {
    throw new Error("Local folder selection is not supported in this browser. Use a recent desktop version of Chrome or Edge.");
  }

  return window.showDirectoryPicker({
    id: "luxraj-blog-repository",
    mode: "readwrite",
    startIn: "documents",
  });
}

export async function ensureRepositoryPermission(directoryHandle, request = false) {
  if (!directoryHandle || typeof directoryHandle.queryPermission !== "function") {
    return "denied";
  }

  let permission = await directoryHandle.queryPermission({ mode: "readwrite" });
  if (permission !== "granted" && request && typeof directoryHandle.requestPermission === "function") {
    permission = await directoryHandle.requestPermission({ mode: "readwrite" });
  }
  return permission;
}