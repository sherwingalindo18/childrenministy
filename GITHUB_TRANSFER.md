# GitHub transfer guide — Children Ministry Attendance System

This folder is a **complete, ready-to-commit project**. There is no build step:
it is static HTML/CSS/JS plus an Apps Script backend. You can push it to GitHub
as-is and host it on any static host.

---

## What's in this repo

```
children-ministry-attendance/
├── index.html              SPA shell (React + Babel via CDN, no build step)
├── css/styles.css          Design system + styles
├── js/
│   ├── api.js              API layer — CONNECTED to the live Google Sheet
│   └── app.js              React app (JSX, transpiled in the browser)
├── apps-script/Code.gs     Google Apps Script backend (paste into the Sheet)
├── README.md               Full setup + feature docs
├── .gitignore
└── GITHUB_TRANSFER.md       This file
```

## Current connection state (already wired up)

- `js/api.js` → `API_URL` points at the deployed web app
  `https://script.google.com/macros/s/AKfycby…/exec` — **live mode is ON**
  (demo mode auto-disables when `API_URL` is a real URL).
- `apps-script/Code.gs` → `SPREADSHEET_ID = "1DUWXNdV6OWW8O6KHZarpfLpLwk--guX8QgL0ULnwORU"`
  so the backend reads/writes that specific Google Sheet.

The front end successfully reaches the backend. The Sheet still needs its tabs
created — see "One remaining step" below.

## One remaining step before data shows up

In the Google Sheet: **Extensions → Apps Script**, make sure `Code.gs` matches
the file in `apps-script/`, then run **`initialiseSpreadsheet()`** once. That
creates the `Teachers`, `Students`, and `Attendance` tabs (with sample rows).
After that, the app reads and writes live from your Sheet, and you can edit
students/teachers directly in the Sheet.

Demo login while testing: `john@church.org` / `demo1234` (only works in demo
mode, i.e. before a real `API_URL` — in live mode use a real Teachers row).

---

## Push to GitHub

From inside this folder:

```bash
git init
git add .
git commit -m "Children Ministry Attendance System"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

(Create the empty repo on github.com first, then run the commands above.)

## Host it (optional)

Any static host works — GitHub Pages, Netlify, Vercel, Cloudflare Pages.
For GitHub Pages: repo **Settings → Pages → Build from branch → `main` / root**.
The Apps Script backend is already hosted by Google; nothing to deploy there.

---

## Security note (read before making the repo public)

- The `/exec` URL in `js/api.js` is deployed with **"Who has access: Anyone"**,
  so it's effectively public already. Committing it is fine for this kind of
  internal church tool, but anyone with the URL can call the API.
- `Code.gs` stores teacher passwords as **plain text** by default. To harden,
  set a `SALT` and `var HASH = true;` in `Code.gs` (see README → "Optional: hash
  the passwords").
- If you'd rather not commit the live URL, replace it with a placeholder before
  pushing and document it in the README instead.

---

## Notes for a developer continuing this in Claude Code

- This is **working software**, not a design mock — keep the architecture
  (single React SPA + Apps Script + Sheets) unless there's a reason to change it.
- `index.html` deliberately fetches `js/app.js`, transpiles it with Babel's
  **classic** JSX runtime, and injects it as a same-origin `<script>`. Babel 8's
  default automatic runtime injects `import` statements that break a non-module
  script — do **not** revert to `<script type="text/babel" src="js/app.js">`.
- For higher traffic, pre-compile the JSX with a bundler (e.g. Vite) instead of
  in-browser Babel. The CDN setup is fine for a Sunday-morning teacher tool.
