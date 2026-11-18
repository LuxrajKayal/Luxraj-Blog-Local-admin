function escapeRegex(text) { return text.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"); }

export function normalizePart(value) {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function matchPagePath(expression, path) {
  const names = [];
  let regex = "^";
  for (let i = 0; i < expression.length;) {
    if (expression[i] === "{") {
      const close = expression.indexOf("}", i + 1);
      if (close < 0) throw new Error("Unclosed path capture in " + expression);
      const name = expression.slice(i + 1, close);
      if (!/^[a-z][a-z0-9_]*$/i.test(name) || names.includes(name)) {
        throw new Error("Invalid or repeated path capture: " + name);
      }
      names.push(name);
      regex += "([^/]+)";
      i = close + 1;
    } else if (expression[i] === "*") {
      if (expression[i + 1] === "*") { regex += ".*"; i += 2; }
      else { regex += "[^/]*"; i += 1; }
    } else {
      regex += escapeRegex(expression[i]);
      i += 1;
    }
  }
  const match = new RegExp(regex + "$", "i").exec(path);
  if (!match) return null;
  return Object.fromEntries(names.map((name, i) => [name, match[i + 1]]));
}

export function classifyPage(path, rules) {
  const matches = [];
  for (const rule of rules) {
    const captures = matchPagePath(rule.match, path);
    if (captures !== null) matches.push({ rule, captures });
  }
  if (matches.length > 1) {
    throw new Error("Multiple Page ID rules match " + path + ": " + matches.map(entry => entry.rule.label).join(", "));
  }
  return matches[0] || null;
}

export function renderId(template, captures, number = null, width = 2) {
  return template.replace(/\{([a-z][a-z0-9_]*)\}/gi, (_, name) => {
    if (name === "nn") {
      if (number === null) throw new Error("A sequence number is required.");
      return String(number).padStart(width, "0");
    }
    if (!(name in captures)) throw new Error("Unknown naming variable: " + name);
    const normalized = normalizePart(captures[name]);
    if (!normalized) throw new Error("Empty naming variable: " + name);
    return normalized;
  });
}

export function templateSequenceRegex(template, captures) {
  const token = "LUXRAJSEQUENCETOKEN";
  const substituted = renderId(template.replace("{nn}", token), captures);
  const markerIndex = substituted.indexOf(token);
  if (markerIndex < 0) throw new Error("Template is missing the number token.");
  return new RegExp("^" + escapeRegex(substituted.slice(0, markerIndex)) + "([0-9]+)" + escapeRegex(substituted.slice(markerIndex + token.length)) + "$", "i");
}
