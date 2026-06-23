# Children Ministry Attendance System

A premium, church-quality attendance system for the **Beginner**, **Middler**, and
**Younger** children's classes. Teachers sign in, take the Sunday register, review
history, and read reports. Built with **vanilla CSS, React (via CDN — no build step),
Google Sheets as the database, and Google Apps Script as the API.**

No Bootstrap, Tailwind, MUI, jQuery, Firebase, or backend framework.

---

## What you get

```
index.html              SPA shell (loads React + styles + app)
css/styles.css          Design system, glassmorphism, animations, responsive
js/api.js               API layer (Apps Script calls + built-in DEMO mode)
js/app.js               React app: login, dashboard, attendance, history, reports, admin
apps-script/Code.gs     Complete Google Apps Script backend
README.md               This file
```

### A note on the architecture
The original spec listed both separate HTML pages (`login.html`, `dashboard.html`…)
*and* React. Those approaches conflict — separate pages each re-loading React would
fragment the login session. This is built as one React single-page app, which is the
correct production choice and keeps session, routing, and state coherent. The code is
still split along the lines you asked for: `api.js`, `app.js`, `styles.css`, `Code.gs`.

---

## Try it right now (demo mode)

Open `index.html` through a local web server (not `file://`, because it loads modules):

```bash
cd children-ministry-attendance
python3 -m http.server 8000
# visit http://localhost:8000
```

`js/api.js` ships in **demo mode** with in-memory sample data, so the whole UI works
before you connect a Sheet. Sign in with:

- **Email:** `john@church.org`
- **Password:** `demo1234`

The hidden admin panel: **tap the gold ✝ logo three times**, then enter PIN `1820`
(change `ADMIN_PIN` in `js/app.js`).

---

## Go live in 5 steps

### 1. Create the Google Sheet
Make a new Google Spreadsheet. The exact tabs and columns (created automatically in
step 3) are:

**Teachers**

| A — Teacher Name | B — Email | C — Password |
|---|---|---|

**Students**

| A — Student ID | B — Student Name | C — Category |
|---|---|---|

Category must be one of `Beginner`, `Middler`, `Younger`.

**Attendance**

| A — Attendance ID | B — Date | C — Student Name | D — Category | E — Status | F — Teacher Name | G — Teacher Email | H — Timestamp |
|---|---|---|---|---|---|---|---|

### 2. Add the script
In the Sheet: **Extensions → Apps Script**. Delete the placeholder and paste
`apps-script/Code.gs`. Save.

### 3. Initialise
In the Apps Script editor, select **`initialiseSpreadsheet`** from the function
dropdown and click **Run**. Approve the permission prompt. This creates the three tabs,
headers, and a little sample data. (Skip or edit if you already have your roster.)

### 4. Deploy as a web app
**Deploy → New deployment → Web app**
- Description: `Attendance API`
- Execute as: **Me**
- Who has access: **Anyone**

Click **Deploy**, authorise, and copy the **Web app URL** (ends in `/exec`).

### 5. Connect the front end
Open `js/api.js` and paste the URL:

```js
const API_URL = "https://script.google.com/macros/s/AKfyc.../exec";
```

Reload the site. Demo mode switches off automatically and you're live.

> **Why it works without CORS errors:** the front end sends POSTs as `text/plain`,
> which the browser treats as a "simple request" (no preflight). Google serves the
> `/exec` response with the headers needed to read it back. Don't change the
> content-type to `application/json` — that reintroduces the preflight Apps Script
> can't answer.

---

## Adding your real students and teachers

- **Students:** type rows straight into the *Students* tab. Keep the category spelling
  exact.
- **Teachers:** either type rows into the *Teachers* tab, or use the in-app **Admin**
  panel (logo ✝ ×3 → PIN). The admin form has a **Generate** button that creates a
  10-character password (uppercase + lowercase + numbers, ambiguous characters removed)
  and saves it straight to the Sheet.

---

## Password hashing (enabled)
`Code.gs` ships with `var HASH = true;`, so new and changed teacher passwords are stored
as salted SHA-256 hashes and login compares hashes. Existing plain-text rows keep working
until each teacher's password is next changed, so this never locks anyone out.

The secret salt is read from a **Script Property** (not committed to this repo). Set it
once in the Apps Script editor: **Project Settings → Script Properties → Add property**
`SALT` = a long random string of your own. Until you set it, a non-secret default is used
so logins still work — set a real `SALT` before relying on the hashes for security.

---

## Features
- Login with show/hide password, remember-me, session persistence, **20-minute idle
  auto-logout**
- Dashboard with animated counters and per-class quick links
- Attendance: pick the Sunday + class, everyone defaults to *present*, per-student
  Present/Absent toggles, **Mark all present / Mark all absent / Clear**, save with a
  success animation. Re-saving a date+class overwrites the earlier rows.
- History with date / class / name filters and live search
- Reports: present/absent totals + attendance rate, and **weekly**, **monthly**, and
  **category-comparison** charts drawn on `<canvas>` (no chart library)
- Hidden admin: add / edit / delete teachers + password generator
- Toasts, confirmation dialogs, loading states, glassmorphism, gold-on-navy theme,
  responsive to mobile, visible keyboard focus, reduced-motion support

---

## Testing checklist
1. **Demo login** — `john@church.org` / `demo1234` signs in; a wrong password shows an
   error toast.
2. **Dashboard** — counters animate; class buttons jump to attendance pre-set to that
   class.
3. **Attendance** — change date/class, toggle students, bulk buttons work, **Save** shows
   the success burst.
4. **History** — the record you just saved appears; filters and search narrow it.
5. **Reports** — charts render and totals match.
6. **Admin** — logo ✝ ×3 → PIN `1820`; add a teacher (try **Generate**), sign out, sign
   in as that teacher.
7. **Session** — reload stays signed in (remember-me on); logout clears it.
8. **Live mode** — after pasting `API_URL`, repeat 1–6 against your real Sheet and
   confirm rows land in the *Attendance* tab.
9. **Mobile** — narrow the window; the nav collapses into the ≡ menu.

---

## Customising
- **Colours / fonts:** the design tokens live at the top of `css/styles.css`
  (`--blue #1D4ED8`, `--gold #D4AF37`, etc.).
- **Idle timeout / admin PIN / categories:** top of `js/app.js`.
- **Church name / logo:** the brand block in the `Shell` component (`js/app.js`) and the
  `<title>` in `index.html`.

---

## Hosting
Any static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages, or your own
server. Upload the folder as-is. (The Apps Script backend is already hosted by Google.)

For higher traffic you can pre-compile the JSX with a bundler (Vite) instead of the
in-browser Babel, but for a Sunday-morning teacher tool the CDN setup is perfectly fine.
