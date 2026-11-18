import { scanPageIdRecords } from "../modules/page-id/workspace-scanner.js";
import { planBulkPageIds } from "../modules/page-id/generator.js";
import { validateManualId } from "../modules/page-id/validator.js";
import { applyPageIdChanges } from "../modules/page-id/writer.js";

function el(id) { return document.getElementById(id); }
function button(text, className, callback) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = text;
  element.className = className;
  element.addEventListener("click", callback);
  return element;
}

/** Owns the second selector, manual edits, bulk preview and explicit write confirmation. */
export function createPageIdSelector({ getRoot, getProfile, getSelectedPaths, assertWritable, notify }) {
  const ui = {
    trigger: el("page-id-picker-trigger"), menu: el("page-id-picker-menu"),
    value: el("page-id-picker-value"), summary: el("page-id-summary"),
    list: el("page-id-options"), count: el("page-id-count"),
    selectAll: el("page-id-select-all"), clear: el("page-id-clear"),
    refresh: el("page-id-refresh"), bulk: el("page-id-bulk"),
    editor: el("page-id-editor"), editorPath: el("page-id-editor-path"),
    editorInput: el("page-id-editor-input"), editorError: el("page-id-editor-error"),
    editorSave: el("page-id-editor-save"), editorCancel: el("page-id-editor-cancel"),
    preview: el("page-id-preview"), previewRows: el("page-id-preview-rows"),
    previewErrors: el("page-id-preview-errors"), apply: el("page-id-preview-apply"),
    dismiss: el("page-id-preview-cancel")
  };

  let records = [], visible = [], bulkPaths = new Set(), previousEligible = new Set();
  let editingPath = null, plan = null, busy = false;

  function closeMenu() {
    ui.menu.hidden = true;
    ui.trigger.setAttribute("aria-expanded", "false");
  }
  function hidePreview() { plan = null; ui.preview.hidden = true; }
  function hideEditor() { editingPath = null; ui.editor.hidden = true; ui.editorError.textContent = ""; }
  function setBusy(value) {
    busy = value;
    ui.refresh.disabled = value;
    ui.bulk.disabled = value || bulkPaths.size === 0;
    ui.apply.disabled = value || !plan || plan.errors.length > 0 || !plan.proposals.length;
    ui.editorSave.disabled = value;
  }
  function render() {
    ui.list.replaceChildren();
    const eligible = visible.filter(record => record.pageId.status === "placeholder");
    ui.count.textContent = visible.length + " passed · " + eligible.length + " placeholders";
    ui.value.textContent = visible.length ? bulkPaths.size + " of " + eligible.length + " placeholders selected" : "No pages passed from SEO selection";
    ui.summary.textContent = eligible.length + " placeholders · " + (visible.length - eligible.length) + " already filled or unavailable";
    ui.trigger.disabled = !visible.length;
    for (const record of visible) {
      const status = record.pageId.status;
      const pending = status === "placeholder";
      const row = document.createElement("div");
      row.className = "id-option" + (status === "assigned" ? " id-option--filled" : "");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "id-option-checkbox";
      checkbox.checked = pending && bulkPaths.has(record.path);
      checkbox.disabled = !pending;
      checkbox.title = pending ? "Include in bulk Page ID generation" : "Only placeholder pages can be bulk-filled";
      checkbox.setAttribute("aria-label", "Bulk-fill " + record.path);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) bulkPaths.add(record.path);
        else bulkPaths.delete(record.path);
        hidePreview();
        render();
      });
      const details = document.createElement("div");
      details.className = "id-option-details";
      const path = document.createElement("strong");
      path.textContent = record.path;
      const value = document.createElement("small");
      value.textContent = pending ? "Placeholder · eligible" : status === "assigned" ? "Filled: " + record.pageId.value : "Needs review: " + record.pageId.reason;
      details.append(path, value);
      const edit = button("✎", "id-edit-button", () => showEditor(record.path));
      edit.title = "Manually edit Page ID";
      edit.setAttribute("aria-label", "Edit Page ID for " + record.path);
      edit.disabled = status === "missing" || status === "invalid";
      row.append(checkbox, details, edit);
      ui.list.append(row);
    }
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "page-options-empty";
      empty.textContent = "Select pages in the SEO dropdown to populate this list.";
      ui.list.append(empty);
    }
    ui.bulk.disabled = busy || bulkPaths.size === 0;
  }
  function reset() {
    records = [];
    visible = [];
    bulkPaths = new Set();
    previousEligible = new Set();
    hidePreview();
    hideEditor();
    closeMenu();
    render();
  }
  async function refresh() {
    hidePreview();
    hideEditor();
    const root = getRoot();
    if (!root) { reset(); return; }
    ui.value.textContent = "Scanning Page IDs…";
    try {
      records = await scanPageIdRecords(root, getProfile());
      const selected = getSelectedPaths();
      visible = records.filter(record => selected.has(record.path));
      const eligible = new Set(visible.filter(record => record.pageId.status === "placeholder").map(record => record.path));
      bulkPaths = new Set([...eligible].filter(path => bulkPaths.has(path) || !previousEligible.has(path)));
      previousEligible = eligible;
      render();
    } catch (error) {
      reset();
      ui.value.textContent = "Page ID scan failed";
      notify(error.message);
    }
  }
  function showEditor(path) {
    const record = visible.find(item => item.path === path);
    if (!record || !["placeholder", "assigned"].includes(record.pageId.status)) return;
    closeMenu();
    hidePreview();
    editingPath = path;
    ui.editorPath.textContent = path;
    ui.editorInput.value = record.pageId.status === "assigned" ? record.pageId.value : "";
    ui.editorError.textContent = "";
    ui.editor.hidden = false;
    ui.editorInput.focus();
  }
  async function saveManual() {
    if (busy || !editingPath) return;
    setBusy(true);
    try {
      await assertWritable();
      const fresh = await scanPageIdRecords(getRoot(), getProfile());
      // Manual editing can repair a duplicate ID; only the proposed new value must be unique.
      const current = fresh.find(item => item.path === editingPath);
      if (!current) throw new Error("Page disappeared from the connected repository.");
      const id = validateManualId(ui.editorInput.value, fresh, editingPath, getProfile().pageIdPlaceholder);
      if (!["assigned", "placeholder"].includes(current.pageId.status)) throw new Error("Page ID meta element is not editable.");
      if (current.pageId.status === "assigned" && current.pageId.value === id) {
        hideEditor();
        return;
      }
      const accepted = window.confirm("Save Page ID " + id + " in " + editingPath + "? This changes the local source HTML file.");
      if (!accepted) return;
      await applyPageIdChanges(getRoot(), [{ path: editingPath, original: current.source, nextValue: id, allowAssigned: true }], getProfile());
      hideEditor();
      notify("Saved Page ID in " + editingPath + ". No Git commit was created.");
      await refresh();
    } catch (error) { ui.editorError.textContent = error.message; }
    finally { setBusy(false); }
  }
  async function previewBulk() {
    if (busy || !bulkPaths.size) return;
    setBusy(true);
    hidePreview();
    try {
      records = await scanPageIdRecords(getRoot(), getProfile());
      const selection = new Set([...bulkPaths].filter(path => getSelectedPaths().has(path)));
      plan = planBulkPageIds(records, selection, getProfile());
      ui.previewRows.replaceChildren();
      for (const proposal of plan.proposals) {
        const row = document.createElement("div");
        row.className = "id-preview-row";
        const from = document.createElement("span");
        from.textContent = proposal.path;
        const to = document.createElement("strong");
        to.textContent = proposal.nextValue;
        row.append(from, to);
        ui.previewRows.append(row);
      }
      ui.previewErrors.textContent = plan.errors.length
        ? plan.errors.join(" · ")
        : plan.proposals.length + " placeholder values will change. Existing IDs are preserved.";
      ui.previewErrors.dataset.state = plan.errors.length ? "error" : "success";
      ui.preview.hidden = false;
      closeMenu();
    } catch (error) { notify(error.message); }
    finally { setBusy(false); }
  }
  async function applyBulk() {
    if (busy || !plan || plan.errors.length || !plan.proposals.length) return;
    setBusy(true);
    try {
      await assertWritable();
      const fresh = await scanPageIdRecords(getRoot(), getProfile());
      const confirmed = planBulkPageIds(fresh, new Set(plan.proposals.map(p => p.path)), getProfile());
      if (confirmed.errors.length || confirmed.proposals.length !== plan.proposals.length ||
          confirmed.proposals.some((item, i) => item.path !== plan.proposals[i].path ||
            item.nextValue !== plan.proposals[i].nextValue || item.original !== plan.proposals[i].original)) {
        throw new Error("Page IDs or source files changed since preview. Generate a fresh preview.");
      }
      if (!window.confirm("Write " + confirmed.proposals.length + " Page IDs into the checked-out repository? This does not create a Git commit.")) return;
      const result = await applyPageIdChanges(getRoot(), confirmed.proposals, getProfile());
      notify("Populated " + result.written + " Page IDs in local source HTML. No Git commit was created.");
      await refresh();
    } catch (error) {
      ui.previewErrors.textContent = error.message;
      ui.previewErrors.dataset.state = "error";
    } finally { setBusy(false); }
  }

  ui.trigger.addEventListener("click", () => {
    ui.menu.hidden = !ui.menu.hidden;
    ui.trigger.setAttribute("aria-expanded", String(!ui.menu.hidden));
  });
  ui.selectAll.addEventListener("click", () => {
    bulkPaths = new Set(visible.filter(r => r.pageId.status === "placeholder").map(r => r.path));
    hidePreview(); render();
  });
  ui.clear.addEventListener("click", () => { bulkPaths.clear(); hidePreview(); render(); });
  ui.refresh.addEventListener("click", refresh);
  ui.bulk.addEventListener("click", previewBulk);
  ui.editorSave.addEventListener("click", saveManual);
  ui.editorCancel.addEventListener("click", hideEditor);
  ui.apply.addEventListener("click", applyBulk);
  ui.dismiss.addEventListener("click", hidePreview);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") { closeMenu(); hidePreview(); hideEditor(); }
  });
  reset();
  return { refresh, reset, invalidatePreview: hidePreview };
}
