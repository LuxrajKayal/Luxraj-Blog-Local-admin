import { classifyPage, matchPagePath } from "./pattern-engine.js";

const ID_FORMAT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function validateManualId(id, records, currentPath, placeholder = "{{PAGE_ID}}") {
  const value = String(id || "").trim();
  if (!ID_FORMAT.test(value) || value === placeholder) {
    throw new Error("Page IDs must contain only letters, numbers, dots, underscores or hyphens, and cannot be a placeholder.");
  }
  const conflicting = records.find(record => record.path !== currentPath && record.pageId?.status === "assigned" && record.pageId.value === value);
  if (conflicting) throw new Error("Page ID is already assigned to " + conflicting.path);
  return value;
}

export function validateProfile(profile) {
  if (!profile || !Array.isArray(profile.rules)) throw new Error("Invalid Page ID profile.");
  if (!/^[a-z][a-z0-9:-]*$/i.test(profile.seoAttribute || "")) throw new Error("Invalid SEO marker name.");
  if (!profile.pageIdMetaName?.trim() || !profile.pageIdPlaceholder?.trim()) {
    throw new Error("Page ID meta name and placeholder are required.");
  }
  const ids = new Set();
  for (const rule of profile.rules) {
    if (!rule.id || ids.has(rule.id)) throw new Error("Duplicate or missing rule identifier.");
    ids.add(rule.id);
    if (!rule.label?.trim() || !rule.match?.trim() || !rule.template?.trim()) {
      throw new Error("Each rule needs a label, path match and ID template.");
    }
    if (rule.match.includes("..") || rule.match.startsWith("/") || !/^[A-Za-z0-9_{}*./-]+$/.test(rule.match)) {
      throw new Error("Invalid path match in rule " + rule.label);
    }
    matchPagePath(rule.match, "__validation__");
    const variables = [...rule.match.matchAll(/\{([a-z][a-z0-9_]*)\}/gi)].map(match => match[1]);
    const tokens = [...rule.template.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
    if (!/^[A-Za-z0-9_{}.-]+$/.test(rule.template) ||
        tokens.some(token => token !== "nn" && !variables.includes(token)) ||
        tokens.some(token => !/^[a-z][a-z0-9_]*$/i.test(token))) {
      throw new Error("Invalid Page ID template for " + rule.label);
    }
    if ((rule.template.match(/\{nn\}/g) || []).length > 1) throw new Error("Use only one number token per rule.");
    if (rule.template.includes("{nn}")) {
      const n = rule.numbering;
      if (!n || !Number.isInteger(n.start) || n.start < 0 ||
          !Number.isInteger(n.step) || n.step < 1 ||
          !Number.isInteger(n.width) || n.width < 1 || n.width > 10 ||
          !["topic", "category", "folder", "global", "custom"].includes(n.scope) ||
          (n.scope === "custom" && (!/^[a-z][a-z0-9_]*(?:,\s*[a-z][a-z0-9_]*)*$/i.test(n.groupBy || "") ||
            n.groupBy.split(",").map(name => name.trim()).some(name => !variables.includes(name))))) {
        throw new Error("Invalid numbering settings for " + rule.label);
      }
    }
  }
  return true;
}

export function detectExistingIdConflicts(records) {
  const used = new Map();
  const errors = [];
  for (const record of records) {
    if (record.pageId.status !== "assigned") continue;
    const value = record.pageId.value;
    if (used.has(value)) errors.push("Duplicate existing Page ID " + value + " in " + used.get(value) + " and " + record.path);
    else used.set(value, record.path);
  }
  return errors;
}

export function validateRuleMatches(paths, rules) {
  const errors = [];
  for (const path of paths) {
    try { classifyPage(path, rules); }
    catch (error) { errors.push(error.message); }
  }
  return errors;
}
