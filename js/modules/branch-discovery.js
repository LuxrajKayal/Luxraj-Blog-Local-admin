async function readTextFile(directoryHandle, filename) {
  try {
    const fileHandle = await directoryHandle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (error) {
    if (error?.name === "NotFoundError") return null;
    throw error;
  }
}

async function collectLooseBranches(refsDirectory, prefix = "") {
  const branches = [];
  for await (const [entryName, entryHandle] of refsDirectory.entries()) {
    if (entryName.endsWith(".lock")) continue;
    const branchPath = prefix ? prefix + "/" + entryName : entryName;
    if (entryHandle.kind === "directory") {
      branches.push(...await collectLooseBranches(entryHandle, branchPath));
      continue;
    }
    if (entryHandle.kind === "file") branches.push(branchPath);
  }
  return branches;
}

async function readLooseBranches(gitDirectory) {
  try {
    const refsDirectory = await gitDirectory.getDirectoryHandle("refs");
    const headsDirectory = await refsDirectory.getDirectoryHandle("heads");
    return await collectLooseBranches(headsDirectory);
  } catch (error) {
    if (error?.name === "NotFoundError") return [];
    throw error;
  }
}

async function readPackedBranches(gitDirectory) {
  const packedRefs = await readTextFile(gitDirectory, "packed-refs");
  if (!packedRefs) return [];
  return packedRefs.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("^"))
    .map((line) => line.split(/\s+/).at(1))
    .filter((ref) => typeof ref === "string" && ref.startsWith("refs/heads/"))
    .map((ref) => ref.slice("refs/heads/".length));
}

async function readCurrentBranch(gitDirectory) {
  const head = await readTextFile(gitDirectory, "HEAD");
  if (!head) return { currentBranch: null, detached: false };
  const match = head.trim().match(/^ref:\s+refs\/heads\/(.+)$/);
  if (match) return { currentBranch: match[1], detached: false };
  return { currentBranch: null, detached: true };
}

async function getGitDirectory(repositoryHandle) {
  try {
    return await repositoryHandle.getDirectoryHandle(".git");
  } catch (directoryError) {
    try {
      const gitFileHandle = await repositoryHandle.getFileHandle(".git");
      const gitFile = await gitFileHandle.getFile();
      const contents = (await gitFile.text()).trim();
      if (contents.startsWith("gitdir:")) {
        throw new Error("This repository uses a .git pointer (such as a linked worktree or submodule). This first version supports repositories with a .git directory directly inside the selected folder.");
      }
      throw new Error("The selected .git file is not a supported Git directory.");
    } catch (fileError) {
      if (fileError instanceof Error && fileError.message.includes("This repository uses")) throw fileError;
      if (fileError?.name === "NotFoundError") {
        throw new Error("This folder does not contain a .git directory. Select the root folder of a locally cloned Git repository.");
      }
      if (fileError?.name && fileError.name !== "NotFoundError") throw fileError;
      throw directoryError;
    }
  }
}

/**
 * Read-only inspection of standard local Git metadata.
 * This module never runs Git commands and never changes .git or working files.
 */
export async function discoverLocalBranches(repositoryHandle) {
  const gitDirectory = await getGitDirectory(repositoryHandle);
  const [looseBranches, packedBranches, head] = await Promise.all([
    readLooseBranches(gitDirectory),
    readPackedBranches(gitDirectory),
    readCurrentBranch(gitDirectory),
  ]);

  const branchNames = [...new Set([...looseBranches, ...packedBranches])].sort((a, b) => a.localeCompare(b));
  if (head.currentBranch && !branchNames.includes(head.currentBranch)) {
    branchNames.push(head.currentBranch);
    branchNames.sort((a, b) => a.localeCompare(b));
  }

  return {
    branchNames,
    currentBranch: head.currentBranch,
    detached: head.detached,
    repositoryName: repositoryHandle.name,
  };
}