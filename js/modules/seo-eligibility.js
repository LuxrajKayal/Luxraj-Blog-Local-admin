const DEFAULT_ATTRIBUTE = "data-luxraj-seo";

/** Require an enabled marker on the actual root HTML element, not a string in a comment. */
export function isSeoEligible(source, attribute = DEFAULT_ATTRIBUTE) {
  if (typeof source !== "string" || !/^[a-z][a-z0-9:-]*$/i.test(attribute)) return false;
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, "");
  if (!/<html\b/i.test(withoutComments)) return false;
  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(source, "text/html");
    return document.documentElement?.getAttribute(attribute) === "true";
  }
  const opening = withoutComments.match(/<html\b(?:[^>"']|"[^"]*"|'[^']*')*>/i);
  if (!opening) return false;
  const escaped = attribute.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const match = opening[0].match(new RegExp("(?:\\s)" + escaped + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'=<>]+))", "i"));
  return Boolean(match && (match[1] ?? match[2] ?? match[3]) === "true");
}
