import { classifyPage, renderId } from "./pattern-engine.js";
import { createNumberAllocator } from "./numbering-engine.js";
import { detectExistingIdConflicts, validateProfile } from "./validator.js";

/** Pure deterministic planner: does not touch source files. */
export function planBulkPageIds(records, selectedPaths, profile) {
  validateProfile(profile);
  const errors = detectExistingIdConflicts(records);
  const proposals = [];
  const used = new Map(records.filter(r => r.pageId.status === "assigned").map(r => [r.pageId.value, r.path]));
  let allocate;
  try { allocate = createNumberAllocator(records, profile.rules); }
  catch (error) { return { proposals: [], errors: [...errors, error.message] }; }
  const recordMap = new Map(records.map(r => [r.path, r]));
  for (const path of [...selectedPaths].sort((a, b) => a.localeCompare(b))) {
    const record = recordMap.get(path);
    if (!record) { errors.push("Selected file no longer exists: " + path); continue; }
    if (record.pageId.status !== "placeholder") continue;
    try {
      const matching = classifyPage(path, profile.rules);
      if (!matching) throw new Error("No naming rule matches this file.");
      const number = matching.rule.template.includes("{nn}") ? allocate(matching.rule, matching.captures, path) : null;
      const value = renderId(matching.rule.template, matching.captures, number, matching.rule.numbering?.width || 2);
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error("Generated ID contains invalid characters.");
      if (used.has(value)) throw new Error("ID " + value + " conflicts with " + used.get(value));
      used.set(value, path);
      proposals.push({ path, original: record.source, nextValue: value, previousValue: record.pageId.value, ruleId: matching.rule.id });
    } catch (error) {
      errors.push(path + ": " + error.message);
    }
  }
  return { proposals, errors };
}
