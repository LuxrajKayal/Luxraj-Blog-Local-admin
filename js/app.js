import { discoverLocalBranches } from "./modules/branch-discovery.js";
import { chooseRepositoryFolder, ensureRepositoryPermission, supportsLocalFolderAccess } from "./modules/repository-picker.js";
import { getSavedWorkspace, saveSelectedBranch, saveWorkspace } from "./modules/workspace-store.js";

const elements = {
  repositoryButton: document.querySelector("#repository-button"),
  repositoryButtonLabel: document.querySelector("#repository-button-label"),
  branchControl: document.querySelector("#branch-control"),
  branchSelect: document.querySelector("#branch-select"),
  workspaceTitle: document.querySelector("#workspace-title"),
  workspaceDescription: document.querySelector("#workspace-description"),
  repositorySummary: document.querySelector("#repository-summary"),
  repositoryName: document.querySelector("#repository-name"),
  currentBranch: document.querySelector("#current-branch"),
  selectedBranch: document.querySelector("#selected-branch"),
  statusLine: document.querySelector("#status-line"),
  statusText: document.querySelector("#status-text"),
  compatibilityNote: document.querySelector("#compatibility-note"),
  toast: document.querySelector("#toast"),
};

let activeDirectoryHandle = null;
let savedHandleNeedsPermission = false;
let repositoryInfo = null;
let toastTimeout = null;

function setStatus(message, state = "idle") {
  elements.statusText.textContent = message;
  elements.statusLine.dataset.state = state;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => { elements.toast.hidden = true; }, 5200);
}

function setBusy(isBusy, label = "Select local folder") {
  elements.repositoryButton.disabled = isBusy;
  elements.repositoryButtonLabel.textContent = isBusy ? label : (savedHandleNeedsPermission ? "Restore folder access" : (activeDirectoryHandle ? "Change folder" : "Select local folder"));
}

function renderRepository(info, selectedBranch = info.currentBranch ?? "") {
  repositoryInfo = info;
  elements.repositoryButtonLabel.textContent = "Change folder";
  elements.workspaceTitle.textContent = "Repository connected";
  elements.workspaceDescription.textContent = "The CMS has inspected the selected folder and discovered its local branches. This starter workspace is read-only apart from remembering your branch selection.";
  elements.repositorySummary.hidden = false;
  elements.repositoryName.textContent = info.repositoryName;
  elements.currentBranch.textContent = info.detached ? "Detached HEAD" : (info.currentBranch || "Unknown");

  elements.branchControl.hidden = false;
  elements.branchSelect.replaceChildren();

  if (info.branchNames.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No local branches found";
    elements.branchSelect.append(option);
    elements.branchSelect.disabled = true;
    elements.selectedBranch.textContent = "None detected";
  } else {
    for (const branchName of info.branchNames) {
      const option = document.createElement("option");
      option.value = branchName;
      option.textContent = branchName;
      elements.branchSelect.append(option);
    }

    const chosenBranch = info.branchNames.includes(selectedBranch)
      ? selectedBranch
      : (info.currentBranch && info.branchNames.includes(info.currentBranch) ? info.currentBranch : info.branchNames[0]);
    elements.branchSelect.value = chosenBranch;
    elements.branchSelect.disabled = false;
    elements.selectedBranch.textContent = chosenBranch;
  }

  const branchCount = info.branchNames.length;
  setStatus("Connected · " + branchCount + " local branch" + (branchCount === 1 ? "" : "es") + " detected", "connected");
  elements.compatibilityNote.textContent = info.detached
    ? "The repository is currently in detached HEAD state. The branch list still shows local branch references."
    : "The CMS reads branch names from local .git metadata only. It does not run Git commands or switch branches.";
}

async function inspectAndConnect(directoryHandle, { requestPermission = false, savedBranch = "" } = {}) {
  const permission = await ensureRepositoryPermission(directoryHandle, requestPermission);
  if (permission !== "granted") {
    throw new Error("Folder access has not been granted. Select the folder again and allow read/write access when prompted.");
  }

  const info = await discoverLocalBranches(directoryHandle);
  activeDirectoryHandle = directoryHandle;
  savedHandleNeedsPermission = false;
  const initialBranch = savedBranch && info.branchNames.includes(savedBranch)
    ? savedBranch
    : (info.currentBranch ?? info.branchNames[0] ?? "");

  await saveWorkspace(directoryHandle, initialBranch);
  renderRepository(info, initialBranch);
}

async function handleRepositoryButton() {
  if (elements.repositoryButton.disabled) return;
  setBusy(true, "Opening folder…");

  try {
    // After a page reload, first let the user restore permission to the saved folder.
    // Once connected, the same button opens the picker so a different folder can be selected.
    if (activeDirectoryHandle && savedHandleNeedsPermission) {
      const permission = await ensureRepositoryPermission(activeDirectoryHandle, true);
      if (permission === "granted") {
        const savedWorkspace = await getSavedWorkspace();
        await inspectAndConnect(activeDirectoryHandle, { requestPermission: false, savedBranch: savedWorkspace?.selectedBranch ?? "" });
        showToast("Reconnected to " + activeDirectoryHandle.name + ".");
        return;
      }

      savedHandleNeedsPermission = false;
      elements.repositoryButtonLabel.textContent = "Change folder";
      showToast("Access was not restored. Click Change folder again to choose a repository.");
      return;
    }

    const directoryHandle = await chooseRepositoryFolder();
    await inspectAndConnect(directoryHandle, { requestPermission: false });
    showToast("Connected to " + directoryHandle.name + ".");
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error("Repository connection failed:", error);
    setStatus("Could not connect repository", "error");
    showToast(error instanceof Error ? error.message : "An unexpected error occurred while connecting the folder.");
  } finally {
    setBusy(false);
  }
}

async function handleBranchChange(event) {
  const nextBranch = event.currentTarget.value;
  if (!nextBranch || !repositoryInfo) return;

  elements.selectedBranch.textContent = nextBranch;
  try {
    await saveSelectedBranch(nextBranch);
    if (nextBranch === repositoryInfo.currentBranch) {
      setStatus("CMS context set to " + nextBranch + " · matches local branch", "connected");
    } else {
      setStatus("CMS context set to " + nextBranch + " · local files unchanged", "warning");
    }
  } catch (error) {
    console.error("Could not save the selected branch:", error);
    showToast("The branch was selected for this session, but the selection could not be saved in browser storage.");
  }
}

async function restoreSavedWorkspace() {
  if (!supportsLocalFolderAccess()) {
    elements.repositoryButton.disabled = true;
    setStatus("Local folder access is unavailable in this browser", "warning");
    elements.compatibilityNote.textContent = "Open this CMS in a recent desktop version of Chrome or Edge, using HTTPS or localhost, to select a local folder.";
    return;
  }

  const savedWorkspace = await getSavedWorkspace();
  if (!savedWorkspace?.directoryHandle) return;

  const permission = await ensureRepositoryPermission(savedWorkspace.directoryHandle, false);
  if (permission === "granted") {
    try {
      await inspectAndConnect(savedWorkspace.directoryHandle, { savedBranch: savedWorkspace.selectedBranch ?? "" });
      setStatus("Restored " + savedWorkspace.directoryHandle.name, "connected");
    } catch (error) {
      console.warn("Could not restore saved repository:", error);
      activeDirectoryHandle = savedWorkspace.directoryHandle;
      savedHandleNeedsPermission = false;
      elements.repositoryButtonLabel.textContent = "Change folder";
      setStatus("Saved folder found · permission or repository check needed", "warning");
    }
    return;
  }

  activeDirectoryHandle = savedWorkspace.directoryHandle;
  savedHandleNeedsPermission = true;
  elements.repositoryButtonLabel.textContent = "Restore folder access";
  setStatus("Saved folder found · access permission needed for " + savedWorkspace.directoryName, "warning");
}

elements.repositoryButton.addEventListener("click", handleRepositoryButton);
elements.branchSelect.addEventListener("change", handleBranchChange);

restoreSavedWorkspace().catch((error) => {
  console.error("Workspace restoration failed:", error);
  setStatus("Could not restore saved workspace", "warning");
});