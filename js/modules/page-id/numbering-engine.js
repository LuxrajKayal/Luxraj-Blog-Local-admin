import { classifyPage, templateSequenceRegex, normalizePart } from "./pattern-engine.js";

function sequenceGroup(rule, captures, path) {
  const scope = rule.numbering.scope;
  if (scope === "global") return rule.id + ":global";
  if (scope === "folder") return rule.id + ":folder:" + path.slice(0, path.lastIndexOf("/"));
  if (scope === "custom") {
    const variables = rule.numbering.groupBy.split(",").map(value => value.trim()).filter(Boolean);
    const values = variables.map(name => normalizePart(captures[name] || ""));
    if (values.some(value => !value)) throw new Error("Custom numbering group contains a missing capture.");
    return rule.id + ":custom:" + values.join(":");
  }
  if (scope === "category") return rule.id + ":" + (captures.category || "other");
  return rule.id + ":" + (captures.category || "other") + ":" + (captures.topic || captures.parent || "other");
}

/** Only append beyond the maximum permanent number, never recycle gaps. */
export function createNumberAllocator(records, rules) {
  const highest = new Map();
  for (const record of records) {
    if (record.pageId.status !== "assigned") continue;
    const classification = classifyPage(record.path, rules);
    if (!classification || !classification.rule.template.includes("{nn}")) continue;
    const { rule, captures } = classification;
    const regex = templateSequenceRegex(rule.template, captures);
    const match = regex.exec(record.pageId.value);
    if (!match) continue;
    const number = Number(match[1]), key = sequenceGroup(rule, captures, record.path);
    if (Number.isSafeInteger(number)) highest.set(key, Math.max(highest.get(key) ?? -1, number));
  }
  return function allocate(rule, captures, path) {
    const key = sequenceGroup(rule, captures, path), n = rule.numbering;
    const next = highest.has(key) ? highest.get(key) + n.step : n.start;
    if (!Number.isSafeInteger(next)) throw new Error("Page ID numbering exceeds the safe integer limit.");
    highest.set(key, next);
    return next;
  };
}
