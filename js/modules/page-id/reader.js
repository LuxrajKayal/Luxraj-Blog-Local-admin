const META_TAG = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const HEAD_OPEN = /<head\b[^>]*>/gi;
const HEAD_CLOSE = /<\/head\s*>/gi;

function readAttribute(tag, name) {
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const match = new RegExp("(?:\\s)" + escaped + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'=<>]+))", "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

export function readPageId(source, config) {
  const openings = [...source.matchAll(HEAD_OPEN)];
  const closings = [...source.matchAll(HEAD_CLOSE)];
  if (openings.length !== 1 || closings.length !== 1) {
    return { status: "invalid", reason: "Expected exactly one complete head element." };
  }
  const headStart = openings[0].index + openings[0][0].length;
  const headEnd = closings[0].index;
  if (headEnd < headStart) return { status: "invalid", reason: "Head tags are incorrectly ordered." };
  const metaName = (config.pageIdMetaName || "").toLowerCase();
  const matches = [...source.matchAll(META_TAG)].filter(match => (readAttribute(match[0], "name") || "").toLowerCase() === metaName);
  if (matches.length > 1) return { status: "invalid", reason: "Duplicate Page ID meta elements." };
  if (!matches.length) return { status: "missing", reason: "Page ID meta element is missing." };
  const tag = matches[0], end = tag.index + tag[0].length;
  if (tag.index < headStart || end > headEnd) {
    return { status: "invalid", reason: "Page ID meta element is outside head." };
  }
  const value = readAttribute(tag[0], "content");
  if (value === null || !value.trim()) {
    return { status: "invalid", reason: "Page ID content is empty or missing." };
  }
  const trimmed = value.trim();
  return {
    status: trimmed === config.pageIdPlaceholder ? "placeholder" : "assigned",
    value: trimmed,
    tagStart: tag.index,
    tagEnd: end,
    tag: tag[0]
  };
}

export function replacePageId(source, config, nextValue, allowAssigned = false) {
  const record = readPageId(source, config);
  if (record.status !== "placeholder" && !(allowAssigned && record.status === "assigned")) {
    throw new Error("Page ID element cannot be updated: " + (record.reason || record.status));
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(nextValue)) throw new Error("Page ID contains invalid characters.");
  const replacement = record.tag.replace(/(\scontent\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s"'=<>]+)/i,
    (_, prefix) => prefix + '"' + nextValue + '"');
  if (replacement === record.tag) throw new Error("Could not locate the Page ID content attribute.");
  return source.slice(0, record.tagStart) + replacement + source.slice(record.tagEnd);
}
