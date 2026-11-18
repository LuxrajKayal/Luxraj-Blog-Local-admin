# Luxraj Blog Local CMS

A static, modular CMS for locally checked-out Git repositories. The UI runs over HTTPS or localhost in a desktop Chromium browser with the File System Access API; it does not use GitHub tokens or a backend.

## Implemented modules

### Page Metadata Filler

1. Select a local Git repository folder. The topbar shows the local branch names and checked-out branch.
2. Open **Page Metadata Filler**. The first dropdown contains only HTML files with `data-luxraj-seo="true"` on their root `<html>` element (or the configured SEO marker). All eligible pages are checked by default. Uncheck pages and click Done to pass the confirmed selection onward.
3. Open **Page ID Population**. Only pages passed from the first dropdown are listed. A Page ID meta tag whose content equals `{{PAGE_ID}}` (or the configured placeholder) is eligible for bulk population. Filled IDs appear gray and cannot be bulk-selected, but the pencil button permits deliberate manual editing. Missing/invalid Page ID tags are reported and cannot be silently created.
4. Choose placeholders, preview generated IDs, then explicitly confirm writing those values into the actual local source HTML files. Only the Page ID meta `content` attribute is updated.

The editor validates IDs and checks for duplicate permanent values throughout the connected local HTML tree, including files not selected in the first dropdown. Generated sequences start after the highest permanent value in their numbering group and never recycle earlier gaps. Unknown or overlapping rules prevent bulk writes.

### Page ID Pattern Studio

The separate **Page ID Pattern Studio** page displays a collapsible map of HTML files in the selected working tree. It supports:

- Editing path-based match expressions such as `site/categories/{category}/{topic}/articles/{page}.html`.
- Editing naming patterns such as `article-{category}-{topic}-{nn}`.
- Setting numbering start, digit width, increment and scope (topic, category, parent folder, entire rule or custom named capture groups).
- Adding and removing rules using the selected file/folder as a starting point.
- Editing SEO marker name, Page ID meta name and placeholder convention.
- A live, read-only preview with conflict reporting.
- Saving a profile in IndexedDB **for the connected directory handle**, separately from profiles for other repositories.
- Exporting/importing a JSON profile to share settings across machines.

The built-in rules default to the Luxraj Blog hierarchy:

| Source path | ID |
| --- | --- |
| `site/index.html` | `site-home-00` |
| `site/pages/privacy.html` | `site-privacy-00` |
| `site/categories/tech-news/tech-news-index.html` | `main-landing-technews-00` |
| `site/categories/hardware/peripherals/hardware-peripherals-index.html` | `sub-landing-hardware-peripherals-00` |
| `site/categories/engineering/drone-technology/articles/*.html` | `article-engineering-dronetechnology-01`, `02`, etc. |

All generated naming components are normalized to lowercase alphanumeric tokens, so `drone-technology` becomes `dronetechnology`.

Other repositories can use the default as a starting template, then configure their own folder mapping, HTML conventions, ID patterns, and numbering. Unmatched files are never assigned a guessed ID. Source files must already contain their configured Page ID meta element; the CMS intentionally does not inject missing structural elements.

## Safety

- The browser folder picker requests read/write access. Page ID writing requires a separately confirmed action.
- Before writing, the selected CMS branch must match the actual checked-out local Git branch. Selecting a branch in the topbar **does not** switch the checkout; switch in VS Code instead.
- Before applying a bulk preview, the CMS rescans existing IDs and checks the exact source text and generated IDs again. All planned source files are rechecked before any write.
- If writing fails midway, the CMS attempts to restore earlier files and reports rollback failures. Multi-file operations are not filesystem-atomic; inspect source changes in Git after writing.
- No Git commands, commits, pushes or deployments are performed by this CMS.
- User-provided names and paths are inserted in the UI using DOM text nodes, not interpreted as HTML.
- Profiles saved in IndexedDB are browser-local. Export JSON to preserve or transfer them.

## Run locally

```bash
python -m http.server 8000
```

Visit `http://localhost:8000` in Chrome or Edge on desktop, or serve the repository root with VS Code Live Server. HTTPS also works.

## Tests

```bash
npm test
```

The test suite covers SEO eligibility, Luxraj patterns, custom numbering, duplicate protection, HTML edits, stale preview rejection and attempted rollback.

## Project structure

```text
js/
  app.js                         # workflow and navigation coordinator
  modules/
    file-tree.js                 # local HTML traversal and file handles
    seo-eligibility.js           # enabled root SEO marker
    page-discovery.js            # first dropdown eligible pages
    page-id/
      default-profile.js         # editable Luxraj defaults
      reader.js                  # inspect and replace the Page ID meta content
      pattern-engine.js          # path matching, captures and ID rendering
      numbering-engine.js        # permanent sequence allocation
      generator.js               # pure bulk plan and collision detection
      validator.js               # profile, ID and match validation
      workspace-scanner.js       # read all Page IDs, including unselected files
      writer.js                  # local file preflight, write and recovery
    pattern-studio/
      profile-storage.js         # per-repository IndexedDB settings
  ui/
    page-id-selector.js          # second dropdown, manual editor and bulk preview
    pattern-studio.js            # file map and editable rule interface
```
