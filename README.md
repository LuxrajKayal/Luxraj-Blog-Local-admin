# Luxraj Blog Local CMS

A modular, local-first CMS starter for the Luxraj Blog website. The application is a static web app designed to run from GitHub Pages or from a local development server.

## Current milestone: repository connection and branch discovery

This first slice provides:

- A minimal topbar with a local-folder picker.
- Local repository validation by checking for a \`.git\` directory.
- Read-only discovery of local branch names from \`.git/refs/heads\` and \`.git/packed-refs\`.
- Detection of the currently checked-out branch from \`.git/HEAD\`.
- A topbar dropdown populated with the discovered local branches.
- Persistence of the selected directory handle and CMS branch context in IndexedDB.
- Permission checks when the saved workspace is restored.

## Important: what branch selection means

The branch dropdown sets the CMS workspace context only. It does **not** switch the actual checked-out Git branch. This application does not run Git commands, write to \`.git\`, commit, push, or connect to the GitHub API. If you need to change the actual working branch, do that in VS Code first, then reconnect or refresh the selected folder in the CMS.

The CMS does not currently modify any files inside the selected repository. This milestone only reads repository metadata and saves the selected folder handle and branch preference in the browser's IndexedDB.

## Run locally

Use a secure local origin. For example, from this repository directory:

\`\`\`bash
python -m http.server 8000
\`\`\`

Then open \`http://localhost:8000\` in a supported browser. Alternatively, use the VS Code Live Server extension.

## Browser support

The local-folder picker uses the File System Access API (\`showDirectoryPicker\`). Use a recent desktop Chromium browser such as Google Chrome or Microsoft Edge. The API requires a secure context, which includes HTTPS and localhost. Other browsers may not expose the required folder-picker API.

The selected directory handle is stored in IndexedDB. Browser security rules may require the user to grant folder permission again after a restart, browser update, permission change, or storage cleanup. The folder's absolute filesystem path is not exposed by the browser API; the CMS remembers the folder handle rather than a path string.

## Git metadata currently supported

- Standard repositories containing a \`.git\` directory.
- Loose local branch refs under \`.git/refs/heads\`.
- Packed local branch refs in \`.git/packed-refs\`.
- Current branch detection through \`.git/HEAD\`.

Linked worktrees and submodules where \`.git\` is a pointer file are not supported in this first milestone. Remote-tracking branches are intentionally not listed; only local branches are shown.

## Project structure

\`\`\`text
.
├── index.html
├── styles.css
├── js/
│   ├── app.js
│   └── modules/
│       ├── branch-discovery.js
│       ├── repository-picker.js
│       └── workspace-store.js
└── README.md
\`\`\`

## Hosting on GitHub Pages

This is a static application with no build step. Once GitHub Pages is enabled for the repository, publish the repository root (or the selected Pages source directory). Open the published HTTPS URL in a supported browser and select the local blog repository folder.

## Security and scope

The folder picker is user initiated. The browser asks for access to the selected local directory. The application source contains no GitHub token, no remote repository API calls, and no push or commit functionality.