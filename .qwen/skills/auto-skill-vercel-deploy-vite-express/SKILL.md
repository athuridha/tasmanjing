# Vercel Deployment for Local Vite + Express Full-Stack Apps

## When to use
When the user wants to deploy a locally-running full-stack app (Vite/frontend + Express/backend) to Vercel, especially when the app has features that depend on a local filesystem, OS-specific tools (e.g. PowerShell), or in-memory state.

## Pre-flight: inspect what already exists
Before planning, check for:
- `api/index.js` — the Vercel serverless entry that `require()`s the Express app and exports it. May already exist.
- `vercel.json` — build config + rewrites. Often missing.
- `if (!process.env.VERCEL && require.main === module) { app.listen(...) }` guard in the Express server. Prevents `app.listen` from crashing the serverless import.
- `.gitignore` — needs `node_modules/`, `dist/`, local artifact dirs, `.env`.

Read these in parallel. Do not assume they're missing or present.

## Key obstacles and how to handle them

### 1. Heavy/unused dependencies break the Vercel build
Vercel serverless functions have a ~250MB size limit. Packages like `puppeteer` download Chromium (~300MB) and will fail the build even if never `require()`d in source code.

- `grep` the actual source (exclude `node_modules`) for `require(...)` / `import ...` of suspect packages before deciding to remove them.
- Remove truly-unused heavy deps from `package.json`.
- `archiver` and `dotenv` are commonly listed but unused — `archiver` may be repurposed (see below), `dotenv` is unnecessary on Vercel (env vars come from the dashboard).

### 2. `vercel.json` structure
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api" }
  ],
  "functions": {
    "api/index.js": {
      "maxDuration": 60
    }
  }
}
```
- `outputDirectory: "dist"` matches Vite's default build output.
- The rewrite routes all `/api/*` traffic to the single serverless function at `api/index.js`; Express matches its own routes internally.
- `maxDuration: 60` (Hobby plan max) is needed for long-running endpoints like image downloads. Pro plan allows 300s.

### 3. Serverless-incompatible features (filesystem, OS tools, in-memory state)
Vercel serverless functions are **stateless**, have a **read-only filesystem** (except `/tmp`), run on **Linux**, and each request is a fresh invocation. Features that use:
- Local filesystem writes outside `/tmp` → broken
- Windows-specific tools (e.g. `powershell Compress-Archive`, `explorer.exe`) → broken
- In-memory state shared across requests (e.g. `const activeDownloads = {}`) → broken (no persistence between invocations)
- Background tasks spawned after `res.json()` → broken (function is frozen/killed after response)

### Dual-path pattern (the core technique)
Detect the environment with `process.env.VERCEL` and branch the handler:

```js
app.post('/api/download-images', async (req, res) => {
  // --- Vercel serverless path: single-request, stream response ---
  if (process.env.VERCEL) {
    const tmpDir = path.join(os.tmpdir(), `task_${Date.now()}_${key}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    // ... do work synchronously within this request ...
    // Stream result directly (e.g. ZIP via archiver → res)
    res.setHeader('Content-Type', 'application/zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    archive.directory(tmpDir, false);
    await archive.finalize();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    return;
  }
  // --- Local dev path: original behavior (background task + polling) ---
  // ... existing code unchanged ...
});
```

Key points:
- Use `os.tmpdir()` for the writable directory (NOT `__dirname`).
- Use a cross-platform library (`archiver`) instead of OS-specific shell commands (`powershell`).
- Do everything in one request — no background tasks, no polling endpoints (those still exist for local dev but won't work on Vercel).
- Add `const archiver = require('archiver');` and `const os = require('os');` at the top.

### 4. Frontend must handle both response shapes
The frontend `fetch()` can't know which environment it hit, so detect the response `Content-Type`:

```js
const response = await fetch('/api/download-images', { ... });
const contentType = response.headers.get('content-type') || '';

if (contentType.includes('application/zip')) {
  // Vercel: response IS the file
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'name.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return;
}

// Local: response is JSON, start polling flow
const data = await response.json();
```

This keeps a single code path that works in both environments.

## Verification before deploying
1. `npm run build` — confirms Vite build succeeds.
2. `node -e "require('./server.js')"` — confirms Express app loads without syntax errors and without crashing (the `!process.env.VERCEL` guard prevents `app.listen` during import).
3. `node -e "const app = require('./api/index.js'); console.log(typeof app)"` — confirms the Vercel entry exports a function.
4. `npm run dev` — confirms local dev still works with the original flow.

## Deploy steps for the user
1. `npm install` to clean `node_modules` of removed heavy deps.
2. Push to a Git repo (GitHub/GitLab/Bitbucket).
3. Import the repo in Vercel (or `npx vercel` from CLI).
4. Vercel auto-detects Vite + Node; `vercel.json` drives the rest.
5. Set any env vars in the Vercel project settings dashboard.

## Gotchas
- Vercel Hobby plan: 60s function timeout, 4.5MB request body limit. Large payloads (e.g. huge goods lists) may need chunking.
- `express.json({ limit: '50mb' })` in the server is fine locally but the Vercel body size limit (4.5MB Hobby / 5MB Pro) will reject oversized requests regardless.
- If a feature absolutely needs persistent state or long processing, external storage (S3, Vercel Blob) or a separate worker is required — not solvable with the dual-path trick.
