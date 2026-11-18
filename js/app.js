import { discoverLocalBranches } from "./modules/branch-discovery.js";
import { discoverHtmlPages } from "./modules/page-discovery.js";
import { chooseRepositoryFolder, ensureRepositoryPermission, supportsLocalFolderAccess } from "./modules/repository-picker.js";
import { getSavedWorkspace, saveSelectedBranch, saveWorkspace } from "./modules/workspace-store.js";

const elements = {
  repositoryButton: document.querySelector("#repository-button"),
  repositoryButtonLabel: document.querySelector("#repository-button-label"),
  branchControl: document.querySelector("#branch-control"),
  branchSelect: document.querySelector("#branch-select"),
  workspace: document.querySelector("#default-workspace"),
  workspaceTitle: document.querySelector("#workspace-title"),
  workspaceDescription: document.querySelector("#workspace-description"),
  repositorySummary: document.querySelector("#repository-summary"),
  repositoryName: document.querySelector("#repository-name"),
  currentBranch: document.querySelector("#current-branch"),
  selectedBranch: document.querySelector("#selected-branch"),
  statusLine: document.querySelector("#status-line"),
  statusText: document.querySelector("#status-text"),
  compatibilityNote: document.querySelector("#compatibility-note"),
  metadataNav: document.querySelector("#page-metadata-nav"),
  metadataPanel: document.querySelector("#page-metadata-panel"),
  pageBranchInfo: document.querySelector("#page-branch-info"),
  pageScanStatus: document.querySelector("#page-scan-status"),
  pageCount: document.querySelector("#page-count"),
  pagePickerTrigger: document.querySelector("#page-picker-trigger"),
  pagePickerMenu: document.querySelector("#page-picker-menu"),
  pagePickerValue: document.querySelector("#page-picker-value"),
  pageOptionsList: document.querySelector("#page-options-list"),
  pageSelectAll: document.querySelector("#page-select-all"),
  pageCancel: document.querySelector("#page-cancel"),
  pageDone: document.querySelector("#page-done"),
  pageSelectionSummary: document.querySelector("#page-selection-summary"),
  toast: document.querySelector("#toast"),
};

let activeDirectoryHandle = null;
let savedHandleNeedsPermission = false;
let repositoryInfo = null;
let toastTimeout = null;
let activeView = "home";
let discoveredPages = [];
let selectedPagePaths = new Set();
let draftPagePaths = new Set();

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
  elements.repositoryButtonLabel.textContent = isBusy
    ? label
    : (savedHandleNeedsPermission ? "Restore folder access" : (activeDirectoryHandle ? "Change folder" : "Select local folder"));
}

function setActiveView(view) {
  activeView = view;
  const showMetadata = view === "metadata";
  elements.workspace.hidden = showMetadata;
  elements.metadataPanel.hidden = !showMetadata;
  elements.metadataNav.setAttribute("aria-current", showMetadata ? "page" : "false");
}

function setPageScanStatus(message, state = "idle") {
  elements.pageScanStatus.textContent = message;
  elements.pageScanStatus.dataset.state = state;
}

function updatePageBranchInfo() {
  if (!repositoryInfo) {
    elements.pageBranchInfo.textContent = "Connect a repository to discover its HTML pages.";
    elements.pageBranchInfo.dataset.state = "idle";
    return;
  }

  const selectedBranch = elements.branchSelect.value;
  const actualBranch = repositoryInfo.currentBranch;

  if (!repositoryInfo.detached && actualBranch && selectedBranch === actualBranch) {
    elements.pageBranchInfo.textContent = "The selected CMS branch matches the local checkout (" + actualBranch + "). The list below reflects HTML files currently present in this local folder.";
    elements.pageBranchInfo.dataset.state = "success";
  } else {
    const actualLabel = repositoryInfo.detached ? "a detached HEAD" : (actualBranch || "an unknown local checkout");
    elements.pageBranchInfo.textContent = "The CMS branch selector is set to " + (selectedBranch || "no branch") + ", but this folder currently contains files from " + actualLabel + ". The page list reflects the local files on disk, not a separate Git branch snapshot. Switch branches in VS Code to change the files being scanned.";
    elements.pageBranchInfo.dataset.state = "warning";
  }
}

function renderPagePickerOptions() {
  elements.pageOptionsList.replaceChildren();

  if (discoveredPages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "page-options-empty";
    empty.textContent = "No HTML pages were found in this repository folder.";
    elements.pageOptionsList.append(empty);
    elements.pagePickerTrigger.disabled = true;
    elements.pagePickerValue.textContent = "No HTML pages detected";
    elements.pageCount.textContent = "0 pages";
    elements.pageSelectionSummary.textContent = "No pages available to select.";
    return;
  }

  for (const page of discoveredPages) {
    const label = document.createElement("label");
    label.className = "page-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "page-option-checkbox";
    checkbox.dataset.pagePath = page.path;
    checkbox.checked = draftPagePaths.has(page.path);

    const text = document.createElement("span");
    text.className = "page-option-path";
    text.textContent = page.path;
    text.title = page.path;

    label.append(checkbox, text);
    elements.pageOptionsList.append(label);
  }

  elements.pagePickerTrigger.disabled = false;
  elements.pageCount.textContent = discoveredPages.length + (discoveredPages.length === 1 ? " page" : " pages");
  updatePageSelectionDraftUI();
}

function updatePageSelectionDraftUI() {
  const selectedCount = draftPagePaths.size;
  const totalCount = discoveredPages.length;

  elements.pagePickerValue.textContent = selectedCount === 0
    ? "Select pages"
    : selectedCount === totalCount
      ? "All " + totalCount + " pages selected"
      : selectedCount + " of " + totalCount + " pages selected";

  elements.pageSelectionSummary.textContent = selectedCount + " of " + totalCount + " pages selected";

  for (const checkbox of elements.pageOptionsList.querySelectorAll(".page-option-checkbox")) {
    checkbox.checked = draftPagePaths.has(checkbox.dataset.pagePath);
  }
}

function openPagePicker() {
  draftPagePaths = new Set(selectedPagePaths);
  updatePageSelectionDraftUI();
  elements.pagePickerMenu.hidden = false;
  elements.pagePickerTrigger.setAttribute("aria-expanded", "true");
}

function closePagePicker() {
  elements.pagePickerMenu.hidden = true;
  elements.pagePickerTrigger.setAttribute("aria-expanded", "false");
}

async function loadPages() {
  if (!activeDirectoryHandle) {
    discoveredPages = [];
    selectedPagePaths.clear();
    draftPagePaths.clear();
    renderPagePickerOptions();
    setPageScanStatus("Connect a local repository folder before scanning pages.", "warning");
    updatePageBranchInfo();
    return;
  }

  const permission = await ensureRepositoryPermission(activeDirectoryHandle, false);
  if (permission !== "granted") {
    setPageScanStatus("Repository access needs to be restored. Use the folder button in the topbar.", "warning");
    return;
  }

  setPageScanStatus("Scanning local HTML pages…", "loading");
  elements.pagePickerTrigger.disabled = true;

  try {
    const pages = await discoverHtmlPages(activeDirectoryHandle);
    discoveredPages = pages;

    const availablePaths = new Set(pages.map((page) => page.path));
    selectedPagePaths = new Set([...selectedPagePaths].filter((path) => availablePaths.has(path)));
    draftPagePaths = new Set(selectedPagePaths);

    renderPagePickerOptions();
    setPageScanStatus(
      pages.length + (pages.length === 1 ? " HTML page discovered in the selected folder." : " HTML pages discovered in the selected folder."),
      pages.length > 0 ? "success" : "warning",
    );
    updatePageBranchInfo();
  } catch (error) {
    console.error("Page discovery failed:", error);
    discoveredPages = [];
    selectedPagePaths.clear();
    draftPagePaths.clear();
    renderPagePickerOptions();
    setPageScanStatus(error instanceof Error ? error.message : "Could not scan HTML pages.", "error");
  }
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
    option.textContent = "No branches found";
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

  updatePageBranchInfo();
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

  discoveredPages = [];
  selectedPagePaths.clear();
  draftPagePaths.clear();
  renderPagePickerOptions();
  setPageScanStatus("Open Page Metadata Filler to discover HTML pages in this folder.", "idle");

  if (activeView === "metadata") await loadPages();
}

async function handleRepositoryButton() {
  if (elements.repositoryButton.disabled) return;
  setBusy(true, "Opening folder…");

  try {
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
    updatePageBranchInfo();
  } catch (error) {
    console.error("Could not save the selected branch:", error);
    showToast("The branch was selected for this session, but the selection could not be saved in browser storage.");
  }
}

function handlePageOptionChange(event) {
  const checkbox = event.target.closest(".page-option-checkbox");
  if (!checkbox) return;

  if (checkbox.checked) draftPagePaths.add(checkbox.dataset.pagePath);
  else draftPagePaths.delete(checkbox.dataset.pagePath);
  updatePageSelectionDraftUI();
}

function handleSelectAllPages() {
  draftPagePaths = new Set(discoveredPages.map((page) => page.path));
  updatePageSelectionDraftUI();
}

function handleCancelPageSelection() {
  draftPagePaths = new Set(selectedPagePaths);
  updatePageSelectionDraftUI();
  closePagePicker();
}

function handleDonePageSelection() {
  selectedPagePaths = new Set(draftPagePaths);
  updatePageSelectionDraftUI();
  closePagePicker();
  showToast(selectedPagePaths.size + (selectedPagePaths.size === 1 ? " page selected." : " pages selected."));
}

async function refreshLocalBranchSnapshot() {
  if (!activeDirectoryHandle) return;

  const permission = await ensureRepositoryPermission(activeDirectoryHandle, false);
  if (permission !== "granted") {
    throw new Error("Repository access needs to be restored before the local branch and page list can be refreshed.");
  }

  const previousSelection = elements.branchSelect.value;
  const refreshedInfo = await discoverLocalBranches(activeDirectoryHandle);
  renderRepository(refreshedInfo, previousSelection);

  const refreshedSelection = elements.branchSelect.value;
  if (refreshedSelection && refreshedSelection !== previousSelection) {
    await saveSelectedBranch(refreshedSelection);
  }
}

async function handlePageMetadataNavigation() {
  setActiveView("metadata");

  try {
    await refreshLocalBranchSnapshot();
  } catch (error) {
    console.error("Could not refresh local branch metadata:", error);
    setPageScanStatus(error instanceof Error ? error.message : "Could not refresh the local repository.", "warning");
    return;
  }

  await loadPages();
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
elements.metadataNav.addEventListener("click", handlePageMetadataNavigation);
elements.pagePickerTrigger.addEventListener("click", () => {
  if (elements.pagePickerMenu.hidden) openPagePicker();
  else closePagePicker();
});
elements.pageOptionsList.addEventListener("change", handlePageOptionChange);
elements.pageSelectAll.addEventListener("click", handleSelectAllPages);
elements.pageCancel.addEventListener("click", handleCancelPageSelection);
elements.pageDone.addEventListener("click", handleDonePageSelection);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.pagePickerMenu.hidden) {
    handleCancelPageSelection();
    elements.pagePickerTrigger.focus();
  }
});

restoreSavedWorkspace().catch((error) => {
  console.error("Workspace restoration failed:", error);
  setStatus("Could not restore saved workspace", "warning");
});