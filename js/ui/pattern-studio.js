import { walkHtmlFiles } from "../modules/file-tree.js";
import { createLuxrajProfile, cloneProfile } from "../modules/page-id/default-profile.js";
import { readPageId } from "../modules/page-id/reader.js";
import { scanPageIdRecords } from "../modules/page-id/workspace-scanner.js";
import { classifyPage } from "../modules/page-id/pattern-engine.js";
import { planBulkPageIds } from "../modules/page-id/generator.js";
import { validateProfile, validateRuleMatches } from "../modules/page-id/validator.js";
import { saveRepositoryProfile } from "../modules/pattern-studio/profile-storage.js";

const el = id => document.getElementById(id);
const defaultNumbering = () => ({ start: 1, width: 2, step: 1, scope: "topic" });

export function createPatternStudio({ getRoot, getProfile, onSave, notify }) {
  const ui = {
    tree: el("studio-file-tree"), selectedFile: el("studio-selected-file"),
    rules: el("studio-rule-list"), add: el("studio-add-rule"), remove: el("studio-remove-rule"),
    label: el("studio-rule-label"), match: el("studio-rule-match"),
    template: el("studio-rule-template"), numbered: el("studio-number-settings"),
    start: el("studio-start"), width: el("studio-width"), step: el("studio-step"), scope: el("studio-scope"),
    seoAttribute: el("studio-seo-attribute"), metaName: el("studio-meta-name"),
    placeholder: el("studio-placeholder"), rootHint: el("studio-root-hint"),
    preview: el("studio-preview"), feedback: el("studio-feedback"),
    status: el("studio-status"), save: el("studio-save"),
    reset: el("studio-reset"), export: el("studio-export"), import: el("studio-import")
  };
  let draft = null, records = [], selectedPath = "", selectedRuleId = "", openedFor = null, dirty = false;

  function currentRule() { return draft?.rules.find(rule => rule.id === selectedRuleId); }
  function setFeedback(message, status = "idle") {
    ui.feedback.textContent = message;
    ui.feedback.dataset.state = status;
  }
  function markDirty() {
    dirty = true;
    ui.status.textContent = "Unsaved pattern changes";
    renderPreview();
  }
  function renderRuleList() {
    ui.rules.replaceChildren();
    for (const rule of draft.rules) {
      const option = document.createElement("option");
      option.value = rule.id;
      option.textContent = rule.label + " — " + rule.match;
      ui.rules.append(option);
    }
    if (!draft.rules.some(rule => rule.id === selectedRuleId)) selectedRuleId = draft.rules[0]?.id || "";
    ui.rules.value = selectedRuleId;
    renderRuleForm();
  }
  function renderRuleForm() {
    const rule = currentRule();
    for (const field of [ui.label, ui.match, ui.template, ui.start, ui.width, ui.step, ui.scope]) field.disabled = !rule;
    ui.remove.disabled = !rule;
    ui.label.value = rule?.label || "";
    ui.match.value = rule?.match || "";
    ui.template.value = rule?.template || "";
    const numbered = Boolean(rule?.template.includes("{nn}"));
    ui.numbered.hidden = !numbered;
    const n = rule?.numbering || defaultNumbering();
    ui.start.value = String(n.start);
    ui.width.value = String(n.width);
    ui.step.value = String(n.step);
    ui.scope.value = n.scope;
  }
  function renderTree(paths) {
    ui.tree.replaceChildren();
    const root = { folders: new Map(), files: [] };
    for (const path of paths) {
      const parts = path.split("/");
      let current = root;
      for (const part of parts.slice(0, -1)) {
        if (!current.folders.has(part)) current.folders.set(part, { folders: new Map(), files: [] });
        current = current.folders.get(part);
      }
      current.files.push(parts.at(-1));
    }
    function addNodes(branch, parent, prefix = "", depth = 0) {
      for (const [name, child] of [...branch.folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const full = prefix ? prefix + "/" + name : name;
        const details = document.createElement("details");
        details.className = "studio-tree-folder";
        details.open = depth < 2;
        const summary = document.createElement("summary");
        summary.textContent = "📁 " + name + "/";
        summary.addEventListener("click", () => {
          selectedPath = full + "/";
          ui.selectedFile.textContent = selectedPath;
          trySelectMatchingRule(full);
        });
        details.append(summary);
        addNodes(child, details, full, depth + 1);
        parent.append(details);
      }
      for (const file of branch.files.sort((a, b) => a.localeCompare(b))) {
        const path = prefix ? prefix + "/" + file : file;
        const choice = document.createElement("button");
        choice.type = "button";
        choice.className = "studio-tree-file";
        choice.textContent = "▤ " + file;
        choice.title = path;
        choice.addEventListener("click", () => {
          selectedPath = path;
          ui.selectedFile.textContent = path;
          trySelectMatchingRule(path);
        });
        parent.append(choice);
      }
    }
    addNodes(root, ui.tree);
  }
  function trySelectMatchingRule(path) {
    try {
      const result = classifyPage(path, draft.rules);
      if (result) {
        selectedRuleId = result.rule.id;
        renderRuleList();
      }
    } catch { /* An overlapping mapping is reported in preview. */ }
  }
  function renderPreview() {
    if (!draft) return;
    ui.preview.replaceChildren();
    try {
      validateProfile(draft);
      const enriched = records.map(record => ({ ...record, pageId: readPageId(record.source, draft) }));
      const matchedPaths = enriched.filter(record => record.pageId.status === "placeholder").map(record => record.path);
      const result = planBulkPageIds(enriched, new Set(matchedPaths), draft);
      const collisions = validateRuleMatches(enriched.map(record => record.path), draft.rules);
      const errors = [...new Set([...result.errors, ...collisions])];
      for (const proposal of result.proposals.slice(0, 18)) {
        const row = document.createElement("div");
        row.className = "id-preview-row";
        const source = document.createElement("span");
        source.textContent = proposal.path;
        const output = document.createElement("strong");
        output.textContent = proposal.nextValue;
        row.append(source, output);
        ui.preview.append(row);
      }
      const unmatched = enriched.filter(record => {
        try { return !classifyPage(record.path, draft.rules) && record.pageId.status === "placeholder"; }
        catch { return false; }
      }).length;
      if (errors.length) setFeedback(errors.slice(0, 5).join(" · ") + (errors.length > 5 ? " · and " + (errors.length - 5) + " more" : ""), "error");
      else setFeedback("Preview: " + result.proposals.length + " proposed IDs" + (unmatched ? " · " + unmatched + " unmatched placeholders" : "") + ". Existing assigned IDs will remain unchanged.", unmatched ? "warning" : "success");
    } catch (error) {
      setFeedback(error.message, "error");
    }
  }
  function renderConfiguration() {
    ui.seoAttribute.value = draft.seoAttribute;
    ui.metaName.value = draft.pageIdMetaName;
    ui.placeholder.value = draft.pageIdPlaceholder;
    ui.rootHint.value = draft.sourceRoot || "";
    renderRuleList();
    renderPreview();
  }
  async function open() {
    const root = getRoot();
    if (!root) {
      ui.status.textContent = "Connect a local repository to configure Page IDs.";
      ui.tree.replaceChildren();
      ui.preview.replaceChildren();
      return;
    }
    ui.status.textContent = "Reading local repository file map…";
    try {
      draft = cloneProfile(getProfile());
      openedFor = root;
      dirty = false;
      selectedPath = "";
      selectedRuleId = draft.rules[0]?.id || "";
      ui.selectedFile.textContent = "Select a folder or HTML file to inspect its matching rule.";
      records = await scanPageIdRecords(root, draft);
      renderTree(records.map(record => record.path));
      renderConfiguration();
      ui.status.textContent = "Editable profile for " + root.name + " · not applied to source files";
    } catch (error) { setFeedback(error.message, "error"); ui.status.textContent = "Cannot load file map"; }
  }
  function requireDraft() {
    if (!draft || !getRoot() || getRoot() !== openedFor) throw new Error("Connect a repository and open the Pattern Studio again.");
  }
  function saveField(key, value) {
    if (!draft) return;
    draft[key] = value;
    markDirty();
  }
  function updateRule(key, value) {
    const rule = currentRule();
    if (!rule) return;
    rule[key] = value;
    if (key === "template") {
      if (value.includes("{nn}") && !rule.numbering) rule.numbering = defaultNumbering();
      renderRuleForm();
    }
    markDirty();
  }
  function updateNumber(key, value) {
    const rule = currentRule();
    if (!rule) return;
    rule.numbering ||= defaultNumbering();
    rule.numbering[key] = value;
    markDirty();
  }
  ui.rules.addEventListener("change", () => { selectedRuleId = ui.rules.value; renderRuleForm(); renderPreview(); });
  ui.label.addEventListener("input", () => updateRule("label", ui.label.value));
  ui.match.addEventListener("input", () => updateRule("match", ui.match.value));
  ui.template.addEventListener("input", () => {
    const cursor = ui.template.selectionStart;
    updateRule("template", ui.template.value);
    ui.template.focus();
    ui.template.setSelectionRange(cursor, cursor);
  });
  for (const [control, key] of [[ui.start, "start"], [ui.width, "width"], [ui.step, "step"]]) {
    control.addEventListener("input", () => updateNumber(key, Number(control.value)));
  }
  ui.scope.addEventListener("change", () => updateNumber("scope", ui.scope.value));
  for (const [control, key] of [[ui.seoAttribute, "seoAttribute"], [ui.metaName, "pageIdMetaName"], [ui.placeholder, "pageIdPlaceholder"], [ui.rootHint, "sourceRoot"]]) {
    control.addEventListener("input", () => saveField(key, control.value));
  }
  ui.add.addEventListener("click", () => {
    if (!draft) return;
    const id = "custom-" + Math.random().toString(36).slice(2, 11);
    const match = selectedPath ? (selectedPath.endsWith("/") ? selectedPath + "*.html" : selectedPath) : "public/{page}.html";
    draft.rules.push({
      id, label: "Custom rule", match, template: "custom-{nn}",
      numbering: defaultNumbering()
    });
    selectedRuleId = id;
    renderRuleList();
    markDirty();
  });
  ui.remove.addEventListener("click", () => {
    if (!currentRule()) return;
    draft.rules = draft.rules.filter(rule => rule.id !== selectedRuleId);
    selectedRuleId = draft.rules[0]?.id || "";
    renderRuleList();
    markDirty();
  });
  ui.reset.addEventListener("click", () => {
    if (!draft || !window.confirm("Reset the draft to the Luxraj Blog defaults? Saved settings stay unchanged until Save.")) return;
    draft = createLuxrajProfile();
    selectedRuleId = draft.rules[0]?.id || "";
    renderConfiguration();
    markDirty();
  });
  ui.save.addEventListener("click", async () => {
    try {
      requireDraft();
      validateProfile(draft);
      const conflicts = validateRuleMatches(records.map(record => record.path), draft.rules);
      if (conflicts.length) throw new Error(conflicts.slice(0, 4).join(" · "));
      await saveRepositoryProfile(getRoot(), draft);
      dirty = false;
      ui.status.textContent = "Saved Page ID profile for " + getRoot().name;
      setFeedback("Pattern rules saved for this repository. Source HTML is unchanged.", "success");
      await onSave(cloneProfile(draft));
    } catch (error) { setFeedback(error.message, "error"); }
  });
  ui.export.addEventListener("click", () => {
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "page-id-patterns.json";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  ui.import.addEventListener("change", async () => {
    try {
      requireDraft();
      const file = ui.import.files[0];
      if (!file) return;
      const imported = JSON.parse(await file.text());
      validateProfile(imported);
      draft = cloneProfile(imported);
      selectedRuleId = draft.rules[0]?.id || "";
      renderConfiguration();
      markDirty();
      notify("Pattern file imported as a draft. Review the preview and click Save.");
    } catch (error) { setFeedback(error.message, "error"); }
    finally { ui.import.value = ""; }
  });
  return { open, isDirty: () => dirty };
}
