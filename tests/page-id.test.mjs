import test from "node:test";
import assert from "node:assert/strict";
import { discoverHtmlPages } from "../js/modules/page-discovery.js";
import { createLuxrajProfile } from "../js/modules/page-id/default-profile.js";
import { readPageId, replacePageId } from "../js/modules/page-id/reader.js";
import { classifyPage, renderId } from "../js/modules/page-id/pattern-engine.js";
import { planBulkPageIds } from "../js/modules/page-id/generator.js";
import { validateManualId, validateProfile } from "../js/modules/page-id/validator.js";
import { applyPageIdChanges } from "../js/modules/page-id/writer.js";
import { scanPageIdRecords } from "../js/modules/page-id/workspace-scanner.js";
import { isSeoEligible } from "../js/modules/seo-eligibility.js";

const profile = createLuxrajProfile();
const html = (value = "{{PAGE_ID}}", marker = "true") =>
  '<!doctype html><html lang="en" data-luxraj-seo="' + marker + '"><head><title>Page</title><meta name="luxraj:page-id" content="' + value + '"></head><body>Body</body></html>';

class MockFile {
  kind = "file";
  constructor(content) { this.content = content; }
  async getFile() { return { text: async () => this.content }; }
  async createWritable() {
    let next = null;
    return {
      write: async value => { next = value; },
      close: async () => { this.content = next; },
      abort: async () => { next = null; }
    };
  }
}
class MockDirectory {
  kind = "directory";
  children = new Map();
  constructor(name = "repo") { this.name = name; }
  async *entries() { yield* this.children.entries(); }
  async getDirectoryHandle(name) {
    const child = this.children.get(name);
    if (!child || child.kind !== "directory") throw new Error("Directory missing: " + name);
    return child;
  }
  async getFileHandle(name) {
    const child = this.children.get(name);
    if (!child || child.kind !== "file") throw new Error("File missing: " + name);
    return child;
  }
}
function mockRepo(files) {
  const root = new MockDirectory();
  const handles = new Map();
  for (const [path, source] of Object.entries(files)) {
    const parts = path.split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      if (!dir.children.has(part)) dir.children.set(part, new MockDirectory(part));
      dir = dir.children.get(part);
    }
    const file = new MockFile(source);
    dir.children.set(parts.at(-1), file);
    handles.set(path, file);
  }
  return { root, handles };
}
function record(path, id) {
  const source = html(id);
  return { path, source, pageId: readPageId(source, profile) };
}

test("SEO discovery checks actual enabled root marker and excludes disabled pages", async () => {
  assert.equal(isSeoEligible(html()), true);
  assert.equal(isSeoEligible(html("id", "false")), false);
  assert.equal(isSeoEligible('<!-- <html data-luxraj-seo="true"> --><html><head></head><body></body></html>'), false);
  const { root } = mockRepo({
    "site/index.html": html(),
    "site/pages/privacy.html": html("site-privacy-00"),
    "site/404.html": html("error-00", "false"),
    "site/partials/topbar.html": "<div>fragment</div>",
    "site/empty.html": "",
    "node_modules/fixture.html": html()
  });
  const pages = await discoverHtmlPages(root);
  assert.deepEqual(pages.map(page => page.path), ["site/index.html", "site/pages/privacy.html"]);
});

test("Page ID detection preserves already-filled identities and notices malformed tags", () => {
  assert.equal(readPageId(html(), profile).status, "placeholder");
  assert.equal(readPageId(html("site-home-00"), profile).status, "assigned");
  assert.equal(readPageId("<html><head></head><body></body></html>", profile).status, "missing");
  assert.equal(readPageId(html().replace("</head>", '<meta name="luxraj:page-id" content="other"></head>'), profile).status, "invalid");
  const replaced = replacePageId(html(), profile, "site-home-00");
  assert.equal(readPageId(replaced, profile).value, "site-home-00");
  assert.equal(replaced.replace('content="site-home-00"', 'content="{{PAGE_ID}}"'), html());
  assert.throws(() => replacePageId(html("site-home-00"), profile, "site-other-00"), /cannot be updated/);
});

test("Luxraj default naming follows real source hierarchy", () => {
  const examples = [
    ["site/index.html", "site-home-00"],
    ["site/pages/privacy.html", "site-privacy-00"],
    ["site/categories/tech-news/tech-news-index.html", "main-landing-technews-00"],
    ["site/categories/engineering/engineering-index.html", "main-landing-engineering-00"],
    ["site/categories/hardware/peripherals/hardware-peripherals-index.html", "sub-landing-hardware-peripherals-00"],
    ["site/categories/how-to/troubleshooting/how-to-troubleshooting-index.html", "sub-landing-howto-troubleshooting-00"]
  ];
  for (const [path, expected] of examples) {
    const match = classifyPage(path, profile.rules);
    assert.ok(match, path);
    assert.equal(renderId(match.rule.template, match.captures), expected);
  }
});

test("Bulk assigns topic sequences beyond the highest permanent ID; never fills gaps", () => {
  const base = "site/categories/engineering/drone-technology/articles/";
  const records = [
    record(base + "old-one.html", "article-engineering-dronetechnology-01"),
    record(base + "old-two.html", "article-engineering-dronetechnology-04"),
    record(base + "first-new.html", "{{PAGE_ID}}"),
    record(base + "second-new.html", "{{PAGE_ID}}"),
    record("site/pages/privacy.html", "{{PAGE_ID}}")
  ];
  const selected = new Set(records.filter(r => r.pageId.status === "placeholder").map(r => r.path));
  const result = planBulkPageIds(records, selected, profile);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.proposals.map(p => p.nextValue), [
    "article-engineering-dronetechnology-05",
    "article-engineering-dronetechnology-06",
    "site-privacy-00"
  ]);
});

test("Duplicate IDs, conflicting patterns and unknown paths block population", () => {
  const existing = record("site/pages/about.html", "site-home-00");
  const duplicate = record("site/index.html", "site-home-00");
  const waiting = record("site/pages/contact.html", "{{PAGE_ID}}");
  const result = planBulkPageIds([existing, duplicate, waiting], new Set([waiting.path]), profile);
  assert.ok(result.errors.some(message => message.includes("Duplicate existing")));
  const unknown = record("site/uncategorized.html", "{{PAGE_ID}}");
  assert.ok(planBulkPageIds([unknown], new Set([unknown.path]), profile).errors.some(message => message.includes("No naming rule")));
  const custom = structuredClone(profile);
  custom.rules.push({ id: "overlap", label: "Overlapping pages", match: "site/pages/*.html", template: "same-00" });
  const collisions = planBulkPageIds([waiting], new Set([waiting.path]), custom);
  assert.ok(collisions.errors.some(message => message.includes("Multiple Page ID rules")));
  assert.throws(() => validateManualId("site-home-00", [existing], waiting.path), /already assigned/);
});

test("Custom profiles can group numbering by user-named captures and by parent folder", () => {
  const custom = {
    ...structuredClone(profile),
    rules: [{ id: "posts", label: "Custom blog", match: "public/{section}/articles/{page}.html",
      template: "post-{section}-{nn}", numbering: { start: 1, width: 3, step: 2, scope: "custom", groupBy: "section" } }]
  };
  validateProfile(custom);
  const records = [
    { ...record("public/guides/articles/old.html", "post-guides-003") },
    { ...record("public/guides/articles/new.html", "{{PAGE_ID}}") },
    { ...record("public/news/articles/new.html", "{{PAGE_ID}}") }
  ];
  const result = planBulkPageIds(records, new Set(records.slice(1).map(r => r.path)), custom);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.proposals.map(p => p.nextValue), ["post-guides-005", "post-news-001"]);
  custom.rules[0].numbering.scope = "folder";
  custom.rules[0].template = "post-{section}-{nn}";
  assert.equal(validateProfile(custom), true);
});

test("The local writer updates only approved source values and rejects stale previews", async () => {
  const { root, handles } = mockRepo({ "site/index.html": html() });
  const proposal = { path: "site/index.html", original: html(), nextValue: "site-home-00" };
  const result = await applyPageIdChanges(root, [proposal], profile);
  assert.equal(result.written, 1);
  assert.equal(readPageId(handles.get("site/index.html").content, profile).value, "site-home-00");
  await assert.rejects(() => applyPageIdChanges(root, [proposal], profile), /changed since preview/);
  assert.equal(readPageId(handles.get("site/index.html").content, profile).value, "site-home-00");
});

test("An injected write failure restores earlier written files", async () => {
  const { root, handles } = mockRepo({ "site/index.html": html(), "site/pages/privacy.html": html() });
  handles.get("site/pages/privacy.html").createWritable = async () => { throw new Error("disk error"); };
  await assert.rejects(() => applyPageIdChanges(root, [
    { path: "site/index.html", original: html(), nextValue: "site-home-00" },
    { path: "site/pages/privacy.html", original: html(), nextValue: "site-privacy-00" }
  ], profile), /write failed/);
  assert.equal(handles.get("site/index.html").content, html());
});

test("Scanning IDs includes non-SEO files so the validator can detect collisions", async () => {
  const { root } = mockRepo({ "site/index.html": html(), "site/404.html": html("permanent-00", "false") });
  const records = await scanPageIdRecords(root, profile);
  assert.equal(records.length, 2);
  assert.ok(records.some(record => record.pageId.value === "permanent-00"));
});
