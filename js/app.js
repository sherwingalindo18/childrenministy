/* ============================================================
   app.js — Children Ministry Attendance System (React SPA)
   Loaded as type="text/babel". Depends on window.API (api.js).
   ============================================================ */

const { useState, useEffect, useRef, useCallback, createContext, useContext } = React;

/* ---------- config ---------- */
const CATEGORIES = ["Beginner", "Midler", "Younger"];
const ADMIN_PIN = "1820"; // change this — gate for the hidden admin panel
const IDLE_LIMIT_MS = 20 * 60 * 1000; // auto-logout after 20 min idle
const SESSION_KEY = "cms.session";

/* ---------- helpers ---------- */
const todaySunday = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // back up to Sunday
  return d.toISOString().slice(0, 10);
};
const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
// Normalise any date representation the backend might return to a plain
// "YYYY-MM-DD" calendar string, WITHOUT timezone math (so it never shifts a
// day). Handles ISO strings and the JS Date.toString() form Apps Script
// produces when Sheets coerces a date cell, e.g. "Mon Jun 22 2026 00:00:00 GMT+0800".
const toISODate = (v) => {
  if (!v) return "";
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = s.match(/\b([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})\b/);
  if (m && MONTHS[m[1]]) return m[3] + "-" + MONTHS[m[1]] + "-" + String(m[2]).padStart(2, "0");
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  return s;
};
const fmtDate = (iso) => {
  if (!iso) return "";
  const isoDate = toISODate(iso); // robust calendar date, no "Invalid Date"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return String(iso);
  const d = new Date(isoDate + "T00:00:00");
  return isNaN(d.getTime()) ? isoDate : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};
const initials = (name) => (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const genPassword = () => {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ", L = "abcdefghijkmnpqrstuvwxyz", N = "23456789";
  const all = U + L + N;
  let out = U[Math.floor(Math.random() * U.length)] + L[Math.floor(Math.random() * L.length)] + N[Math.floor(Math.random() * N.length)];
  for (let i = 3; i < 10; i++) out += all[Math.floor(Math.random() * all.length)];
  return out.split("").sort(() => Math.random() - 0.5).join("");
};

/* ============================================================
   Toast system
   ============================================================ */
const ToastCtx = createContext(() => {});
const useToast = () => useContext(ToastCtx);

function ToastHost({ children }) {
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((type, title, msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, type, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const icon = { success: "✓", error: "✕", info: "✧" };
  return (
    <ToastCtx.Provider value={notify}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={"toast " + t.type} role="status">
            <span className="t-ico">{icon[t.type] || "✧"}</span>
            <div className="t-body"><strong>{t.title}</strong>{t.msg && <span>{t.msg}</span>}</div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ============================================================
   Small UI pieces
   ============================================================ */
function Boot() {
  return (
    <div className="boot">
      <div style={{ textAlign: "center" }}>
        <div className="ring"><Logo /></div>
        <p>Preparing the sanctuary…</p>
      </div>
    </div>
  );
}

function Spinner() { return <span className="spinner" aria-label="Loading" />; }

// Church logo. Loads assets/logo.png; falls back to the ✝ glyph if the
// image is missing so the UI never shows a broken image.
function Logo({ className }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span>✝</span>;
  return (
    <img src="assets/logo.png" alt="Jesus Christ Perfect Redeemer Church"
      className={"logo-img " + (className || "")} onError={() => setBroken(true)} />
  );
}

function useCountUp(target, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf, start;
    const from = 0;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / ms, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

function Modal({ title, children, onClose }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal glass" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   Login
   ============================================================ */
function Login({ onLogin }) {
  const notify = useToast();
  const [email, setEmail] = useState(localStorage.getItem("cms.lastEmail") || "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) { notify("error", "Missing details", "Enter your email and password."); return; }
    setBusy(true);
    try {
      const res = await API.login(email.trim(), password);
      if (remember) localStorage.setItem("cms.lastEmail", email.trim());
      else localStorage.removeItem("cms.lastEmail");
      onLogin(res.teacher, remember);
    } catch (e) {
      notify("error", "Sign in failed", e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card glass">
        <div className="auth-logo"><div className="ring"><Logo /></div></div>
        <p className="church-name-auth">Jesus Christ Perfect Redeemer Church</p>
        <h1>Children Ministry</h1>
        <p className="sub">Attendance for the Lord’s little ones</p>

        <div className="field">
          <label htmlFor="email">Email address</label>
          <input id="email" className="input" type="email" autoComplete="username"
            value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="you@church.org" />
        </div>

        <div className="field">
          <label htmlFor="pw">Password</label>
          <div className="input-wrap">
            <input id="pw" className="input" type={show ? "text" : "password"} autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" />
            <button type="button" className="reveal" onClick={() => setShow((s) => !s)}>{show ? "HIDE" : "SHOW"}</button>
          </div>
        </div>

        <label className="checkbox-row" style={{ marginBottom: "1.4rem" }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Keep me signed in on this device</span>
        </label>

        <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
          {busy ? <Spinner /> : "Sign in"}
        </button>

        {API.isDemo && (
          <p className="sub" style={{ marginTop: "1.2rem", fontSize: "0.78rem" }}>
            Demo mode · use <strong>john@church.org</strong> / <strong>demo1234</strong>
          </p>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Dashboard
   ============================================================ */
function Stat({ label, value, foot, accent, pip }) {
  const n = useCountUp(value);
  return (
    <div className={"stat glass " + (accent || "")}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{n}</span>
      {foot && <span className="stat-foot">{pip && <i className="pip" style={{ background: pip }} />}{foot}</span>}
    </div>
  );
}

function Dashboard({ teacher, go }) {
  const notify = useToast();
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let cancelled = false;
    API.getDashboardStats()
      .then((r) => {
        if (cancelled) return;
        setStats(r.stats);
        // Compute "today" counts on the client from the raw records so they're
        // correct regardless of how the Sheet stores dates or the backend's
        // timezone (the server aggregate can be off by a day / coerced).
        return API.getHistory({}).then((h) => {
          if (cancelled) return;
          const today = toISODate(new Date().toString());
          const todays = (h.records || []).filter((x) => toISODate(x.date) === today);
          setStats((prev) => ({
            ...(prev || r.stats),
            todayTotal: todays.length,
            todayPresent: todays.filter((x) => x.status === "Present").length,
          }));
        }).catch(() => {}); // keep server stats if history fetch fails
      })
      .catch((e) => notify("error", "Could not load stats", e.message));
    return () => { cancelled = true; };
  }, []);
  const now = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="page view-enter">
      <div className="page-head">
        <span className="eyebrow">{now}</span>
        <h1>Welcome, <span className="accent">{teacher.name.replace(/^Teacher /, "")}</span></h1>
        <p>Here is how the children are gathering today. Pick a class to take the register, or review what’s already been recorded.</p>
      </div>

      {!stats ? (
        <div className="card glass"><Spinner /> <span className="muted">Loading the rolls…</span></div>
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="Total Students" value={stats.total} foot="Across all classes" accent="accent-gold" />
            <Stat label="Beginner" value={stats.Beginner} foot="Youngest class" pip="#3b82f6" />
            <Stat label="Midler" value={stats.Midler} foot="Middle class" pip="#d4af37" />
            <Stat label="Younger" value={stats.Younger} foot="Older class" pip="#34d399" />
            <Stat label="Present Today" value={stats.todayPresent}
              foot={stats.todayTotal ? stats.todayTotal + " submitted today" : "Not taken yet"} accent="accent-blue" />
          </div>

          <div className="spacer" />
          <div className="card glass">
            <div className="card-head"><h2>Take today’s register</h2></div>
            <div className="row">
              {CATEGORIES.map((c) => (
                <button key={c} className="btn btn-ghost" style={{ justifyContent: "space-between" }}
                  onClick={() => go("attendance", { category: c })}>
                  <span>{c} class</span><span style={{ color: "var(--gold)" }}>{stats[c]} →</span>
                </button>
              ))}
            </div>
            <div className="spacer" />
            <div className="bulk-bar">
              <button className="btn btn-primary" onClick={() => go("attendance")}>Open attendance</button>
              <button className="btn btn-ghost" onClick={() => go("history")}>View history</button>
              <button className="btn btn-ghost" onClick={() => go("reports")}>See reports</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   Attendance
   ============================================================ */
function Attendance({ teacher, preset }) {
  const notify = useToast();
  const [date, setDate] = useState(todaySunday());
  const [category, setCategory] = useState(preset?.category || "Beginner");
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({}); // name -> "Present" | "Absent"
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setDone(false);
    try {
      const r = await API.getStudents(category);
      setStudents(r.students);
      const init = {};
      r.students.forEach((s) => (init[s.name] = "Present")); // default everyone present
      setMarks(init);
    } catch (e) { notify("error", "Could not load students", e.message); }
    finally { setLoading(false); }
  }, [category]);

  useEffect(() => { load(); }, [load]);

  const set = (name, status) => setMarks((m) => ({ ...m, [name]: status }));
  const allPresent = () => setMarks(Object.fromEntries(students.map((s) => [s.name, "Present"])));
  const allAbsent = () => setMarks(Object.fromEntries(students.map((s) => [s.name, "Absent"])));
  const clear = () => setMarks(Object.fromEntries(students.map((s) => [s.name, undefined])));

  const presentCount = students.filter((s) => marks[s.name] === "Present").length;

  const save = async () => {
    const records = students.filter((s) => marks[s.name]).map((s) => ({ student: s.name, status: marks[s.name] }));
    if (!records.length) { notify("error", "Nothing to save", "Mark at least one student first."); return; }
    setSaving(true);
    try {
      await API.saveAttendance({ date, category, records, teacher: teacher.name, email: teacher.email });
      setDone(true);
      notify("success", "Attendance recorded", presentCount + " present · " + category + " · " + fmtDate(date));
      setTimeout(() => setDone(false), 2600);
    } catch (e) { notify("error", "Save failed", e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="page view-enter">
      <div className="page-head">
        <span className="eyebrow">Attendance</span>
        <h1>Take the <span className="accent">register</span></h1>
        <p>Choose the Sunday and the class. Everyone starts marked present — just flip whoever’s away.</p>
      </div>

      <div className="card glass">
        <div className="row">
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="d">Date</label>
            <input id="d" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="c">Class</label>
            <select id="c" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="spacer" />

      <div className="card glass">
        {done ? (
          <div className="success-burst">
            <div className="check">✓</div>
            <p style={{ marginTop: "1rem", fontFamily: "var(--font-display)", fontSize: "1.3rem" }}>Attendance successfully recorded</p>
            <p className="muted">{presentCount} present of {students.length} · {category}</p>
          </div>
        ) : (
          <>
            <div className="card-head">
              <h2>{category} <span className="muted" style={{ fontFamily: "var(--font-body)", fontSize: "0.9rem" }}>· {students.length} students · {presentCount} present</span></h2>
              <div className="bulk-bar">
                <button className="btn btn-ghost btn-sm" onClick={allPresent}>Mark all present</button>
                <button className="btn btn-ghost btn-sm" onClick={allAbsent}>Mark all absent</button>
                <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
              </div>
            </div>

            {loading ? (
              <div><Spinner /> <span className="muted">Loading {category}…</span></div>
            ) : students.length === 0 ? (
              <div className="empty"><div className="big">—</div>No students in this class yet.</div>
            ) : (
              <table className="att-table">
                <thead><tr><th>Student</th><th style={{ textAlign: "right" }}>Status</th></tr></thead>
                <tbody>
                  {students.map((s) => (
                    <tr className="att-row" key={s.id}>
                      <td>
                        <div className="s-name">{s.name}</div>
                        <div className="s-id">{s.id}</div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="toggle-pair">
                          <button className={marks[s.name] === "Present" ? "on-present" : ""} onClick={() => set(s.name, "Present")}>Present</button>
                          <button className={marks[s.name] === "Absent" ? "on-absent" : ""} onClick={() => set(s.name, "Absent")}>Absent</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="spacer" />
            <button className="btn btn-gold btn-block" onClick={save} disabled={saving || loading || !students.length}>
              {saving ? <Spinner /> : "Save attendance"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   History
   ============================================================ */
function History() {
  const notify = useToast();
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");
  const [student, setStudent] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      // Date is filtered client-side so it works regardless of how the Sheet
      // returns dates (and without needing a backend redeploy). Category and
      // student are plain string matches, safe to filter server-side.
      const r = await API.getHistory({ category: category || undefined, student: student || undefined });
      let recs = r.records || [];
      if (date) recs = recs.filter((x) => toISODate(x.date) === date);
      setRows(recs);
    } catch (e) { notify("error", "Could not load history", e.message); }
    finally { setLoading(false); }
  }, [date, category, student]);

  useEffect(() => { run(); }, []); // initial
  useEffect(() => { const t = setTimeout(run, 250); return () => clearTimeout(t); }, [date, category, student]); // debounce filters

  return (
    <div className="page view-enter">
      <div className="page-head">
        <span className="eyebrow">History</span>
        <h1>Attendance <span className="accent">records</span></h1>
        <p>Filter by Sunday, class, or search a child’s name.</p>
      </div>

      <div className="card glass">
        <div className="row">
          <div className="field" style={{ margin: 0 }}>
            <label>Date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Class</label>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All classes</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Search student</label>
            <input className="input" type="text" placeholder="Name…" value={student} onChange={(e) => setStudent(e.target.value)} />
          </div>
        </div>
        {(date || category || student) && (
          <><div className="spacer" /><button className="btn btn-ghost btn-sm" onClick={() => { setDate(""); setCategory(""); setStudent(""); }}>Clear filters</button></>
        )}
      </div>

      <div className="spacer" />
      <div className="card glass">
        <div className="card-head"><h2>{loading ? "Searching…" : rows.length + " record" + (rows.length === 1 ? "" : "s")}</h2></div>
        {loading ? <Spinner /> : rows.length === 0 ? (
          <div className="empty"><div className="big">∅</div>No records match these filters.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="att-table">
              <thead><tr><th>Date</th><th>Student</th><th>Class</th><th>Status</th><th>Teacher</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr className="att-row" key={r.id}>
                    <td>{fmtDate(r.date)}</td>
                    <td className="s-name">{r.student}</td>
                    <td><span className="badge cat">{r.category}</span></td>
                    <td><span className={"badge " + (r.status === "Present" ? "present" : "absent")}>{r.status}</span></td>
                    <td className="muted">{r.teacher}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Reports — pure canvas charts (no chart library)
   ============================================================ */
function useCanvas(draw, deps) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const parent = cv.parentElement;
    const w = parent.clientWidth, h = Math.round(w * 0.52);
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = w + "px"; cv.style.height = h + "px";
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
  }, deps);
  return ref;
}

const COL = { blue: "#3b82f6", gold: "#d4af37", green: "#34d399", grid: "rgba(255,255,255,0.08)", text: "rgba(255,255,255,0.6)" };

function BarChart({ labels, values, color }) {
  const ref = useCanvas((ctx, w, h) => {
    const pad = { l: 34, r: 12, t: 14, b: 28 };
    const max = Math.max(1, ...values);
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    ctx.font = "11px Plus Jakarta Sans"; ctx.fillStyle = COL.text; ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.textAlign = "right"; ctx.fillText(Math.round(max - (max * i) / 4), pad.l - 6, y + 3);
    }
    const bw = cw / values.length;
    values.forEach((v, i) => {
      const bh = (v / max) * ch;
      const x = pad.l + i * bw + bw * 0.2, bwid = bw * 0.6, y = pad.t + ch - bh;
      const g = ctx.createLinearGradient(0, y, 0, pad.t + ch);
      g.addColorStop(0, color); g.addColorStop(1, color + "55");
      ctx.fillStyle = g;
      const r = Math.min(6, bwid / 2);
      ctx.beginPath();
      ctx.moveTo(x, pad.t + ch); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
      ctx.lineTo(x + bwid - r, y); ctx.arcTo(x + bwid, y, x + bwid, y + r, r);
      ctx.lineTo(x + bwid, pad.t + ch); ctx.closePath(); ctx.fill();
      ctx.fillStyle = COL.text; ctx.textAlign = "center";
      ctx.fillText(labels[i], x + bwid / 2, h - 10);
    });
  }, [labels.join(), values.join(), color]);
  return <div className="chart-box"><canvas ref={ref} /></div>;
}

function LineChart({ labels, values }) {
  const ref = useCanvas((ctx, w, h) => {
    const pad = { l: 34, r: 12, t: 14, b: 28 };
    const max = Math.max(1, ...values);
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    ctx.font = "11px Plus Jakarta Sans"; ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = COL.text; ctx.textAlign = "right"; ctx.fillText(Math.round(max - (max * i) / 4), pad.l - 6, y + 3);
    }
    const step = values.length > 1 ? cw / (values.length - 1) : 0;
    const pt = (i, v) => [pad.l + i * step, pad.t + ch - (v / max) * ch];
    // area
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
    grad.addColorStop(0, "rgba(212,175,55,0.35)"); grad.addColorStop(1, "rgba(212,175,55,0)");
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t + ch);
    values.forEach((v, i) => { const [x, y] = pt(i, v); ctx.lineTo(x, y); });
    ctx.lineTo(pad.l + (values.length - 1) * step, pad.t + ch); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    // line
    ctx.beginPath(); ctx.strokeStyle = COL.gold; ctx.lineWidth = 2.5;
    values.forEach((v, i) => { const [x, y] = pt(i, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    values.forEach((v, i) => {
      const [x, y] = pt(i, v);
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fillStyle = COL.gold; ctx.fill();
      ctx.fillStyle = COL.text; ctx.textAlign = "center"; ctx.fillText(labels[i], x, h - 10);
    });
  }, [labels.join(), values.join()]);
  return <div className="chart-box"><canvas ref={ref} /></div>;
}

function GroupBars({ cats, present, absent }) {
  const ref = useCanvas((ctx, w, h) => {
    const pad = { l: 34, r: 12, t: 14, b: 28 };
    const max = Math.max(1, ...present, ...absent);
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    ctx.font = "11px Plus Jakarta Sans"; ctx.strokeStyle = COL.grid;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = COL.text; ctx.textAlign = "right"; ctx.fillText(Math.round(max - (max * i) / 4), pad.l - 6, y + 3);
    }
    const gw = cw / cats.length;
    cats.forEach((c, i) => {
      const base = pad.l + i * gw;
      [[present[i], COL.green, 0.16], [absent[i], COL.blue, 0.5]].forEach(([v, col], k) => {
        const bw = gw * 0.28, x = base + gw * 0.18 + k * (bw + 6), bh = (v / max) * ch, y = pad.t + ch - bh;
        ctx.fillStyle = k === 0 ? COL.green : "#fb7185";
        ctx.fillRect(x, y, bw, bh);
      });
      ctx.fillStyle = COL.text; ctx.textAlign = "center"; ctx.fillText(c, base + gw / 2, h - 10);
    });
  }, [cats.join(), present.join(), absent.join()]);
  return (
    <div>
      <div className="chart-box"><canvas ref={ref} /></div>
      <div className="legend">
        <span><i style={{ background: COL.green }} />Present</span>
        <span><i style={{ background: "#fb7185" }} />Absent</span>
      </div>
    </div>
  );
}

function Reports() {
  const notify = useToast();
  const [rep, setRep] = useState(null);
  useEffect(() => { API.getReports().then((r) => setRep(r.report)).catch((e) => notify("error", "Could not build reports", e.message)); }, []);

  if (!rep) return <div className="page view-enter"><div className="card glass"><Spinner /> <span className="muted">Crunching the numbers…</span></div></div>;

  const dates = Object.keys(rep.byDate).sort();
  const weekly = dates.slice(-6);
  const weeklyVals = weekly.map((d) => rep.byDate[d].present);
  const weeklyLabels = weekly.map((d) => fmtDate(d).split(",")[1] || d);

  // monthly aggregation
  const months = {};
  dates.forEach((d) => { const m = d.slice(0, 7); months[m] = (months[m] || 0) + rep.byDate[d].present; });
  const mKeys = Object.keys(months).sort();
  const mLabels = mKeys.map((m) => new Date(m + "-01").toLocaleDateString(undefined, { month: "short" }));

  const cats = CATEGORIES;
  const catP = cats.map((c) => rep.byCat[c].p);
  const catA = cats.map((c) => rep.byCat[c].a);
  const rate = rep.total ? Math.round((rep.present / rep.total) * 100) : 0;

  return (
    <div className="page view-enter">
      <div className="page-head">
        <span className="eyebrow">Reports</span>
        <h1>The <span className="accent">gathering</span>, at a glance</h1>
        <p>Every record across all classes, summarised.</p>
      </div>

      <div className="stat-grid">
        <Stat label="Total Records" value={rep.total} accent="accent-gold" />
        <Stat label="Present" value={rep.present} foot={rate + "% attendance"} pip="#34d399" />
        <Stat label="Absent" value={rep.absent} pip="#fb7185" />
      </div>

      <div className="spacer" />
      <div className="chart-grid">
        <div className="card glass">
          <div className="card-head"><h2>Weekly attendance</h2></div>
          {weeklyVals.length ? <BarChart labels={weeklyLabels} values={weeklyVals} color={COL.blue} /> : <div className="empty">No data yet.</div>}
        </div>
        <div className="card glass">
          <div className="card-head"><h2>Monthly trend</h2></div>
          {mKeys.length ? <LineChart labels={mLabels} values={mKeys.map((m) => months[m])} /> : <div className="empty">No data yet.</div>}
        </div>
      </div>
      <div className="spacer" />
      <div className="card glass">
        <div className="card-head"><h2>Category comparison</h2></div>
        <GroupBars cats={cats} present={catP} absent={catA} />
      </div>
    </div>
  );
}

/* ============================================================
   Admin (hidden) — add / edit / delete teachers
   ============================================================ */
function Admin() {
  const notify = useToast();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // teacher being edited or {new:true}
  const [confirmDel, setConfirmDel] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const r = await API.listTeachers(); setTeachers(r.teachers); }
    catch (e) { notify("error", "Could not load teachers", e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async (form, isNew) => {
    try {
      if (isNew) { await API.addTeacher(form); notify("success", "Teacher added", form.name); }
      else { await API.updateTeacher(form); notify("success", "Teacher updated", form.name); }
      setEditing(null); load();
    } catch (e) { notify("error", "Save failed", e.message); }
  };
  const remove = async (email) => {
    try { await API.deleteTeacher(email); notify("success", "Teacher removed"); setConfirmDel(null); load(); }
    catch (e) { notify("error", "Delete failed", e.message); }
  };

  return (
    <div className="page view-enter">
      <div className="page-head">
        <span className="eyebrow">Admin</span>
        <h1>Manage <span className="accent">teachers</span></h1>
        <p>Add, edit, or remove the teachers who can sign in.</p>
      </div>

      <div className="card glass">
        <div className="card-head">
          <h2>{loading ? "Loading…" : teachers.length + " teacher" + (teachers.length === 1 ? "" : "s")}</h2>
          <button className="btn btn-gold btn-sm" onClick={() => setEditing({ new: true })}>Add teacher</button>
        </div>
        {loading ? <Spinner /> : (
          <table className="att-table">
            <thead><tr><th>Name</th><th>Email</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
            <tbody>
              {teachers.map((t) => (
                <tr className="att-row" key={t.email}>
                  <td className="s-name">{t.name}</td>
                  <td className="muted">{t.email}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(t)}>Edit</button>{" "}
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(t)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && <TeacherForm teacher={editing.new ? null : editing} onSave={save} onClose={() => setEditing(null)} />}
      {confirmDel && (
        <Modal title="Remove teacher?" onClose={() => setConfirmDel(null)}>
          <p className="muted">This will stop <strong style={{ color: "var(--ink)" }}>{confirmDel.name}</strong> from signing in. This can’t be undone.</p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => remove(confirmDel.email)}>Remove teacher</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TeacherForm({ teacher, onSave, onClose }) {
  const notify = useToast();
  const isNew = !teacher;
  const [name, setName] = useState(teacher?.name || "");
  const [email, setEmail] = useState(teacher?.email || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const fill = () => { const p = genPassword(); setPassword(p); notify("info", "Password generated", p); };

  const submit = async () => {
    if (!name || !email || (isNew && !password)) { notify("error", "Missing details", "Name, email" + (isNew ? " and password" : "") + " are required."); return; }
    setBusy(true);
    await onSave({ name, email: email.trim(), password: password || undefined }, isNew);
    setBusy(false);
  };

  return (
    <Modal title={isNew ? "Add teacher" : "Edit teacher"} onClose={onClose}>
      <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Teacher Mary" /></div>
      <div className="field"><label>Email</label><input className="input" type="email" value={email} disabled={!isNew} onChange={(e) => setEmail(e.target.value)} placeholder="mary@church.org" /></div>
      <div className="field">
        <label>Password {isNew ? "" : "(leave blank to keep current)"}</label>
        <div className="input-wrap">
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="10+ characters" />
          <button type="button" className="reveal" onClick={fill}>GENERATE</button>
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? <Spinner /> : isNew ? "Add teacher" : "Save changes"}</button>
      </div>
    </Modal>
  );
}

/* ============================================================
   App shell + routing + session
   ============================================================ */
function Shell({ teacher, view, setView, isAdmin, onUnlockAdmin, onLogout, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoTaps, setLogoTaps] = useState(0);

  const tabs = [["dashboard", "Dashboard"], ["attendance", "Attendance"], ["history", "History"], ["reports", "Reports"]];
  if (isAdmin) tabs.push(["admin", "Admin"]);

  const tapLogo = () => {
    const n = logoTaps + 1; setLogoTaps(n);
    if (n >= 3 && !isAdmin) { setLogoTaps(0); onUnlockAdmin(); }
    setTimeout(() => setLogoTaps(0), 1200);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <button className="logo-mark" onClick={tapLogo} title="Children Ministry" aria-label="Home"><Logo /></button>
          <div className="brand-text"><span className="church-name">Jesus Christ Perfect Redeemer Church</span><small>Children Ministry</small><strong>Attendance</strong></div>
        </div>
        <nav className={"nav" + (menuOpen ? " open" : "")}>
          {tabs.map(([k, label]) => (
            <button key={k} className={view === k ? "active" : ""} onClick={() => { setView(k); setMenuOpen(false); }}>{label}</button>
          ))}
        </nav>
        <div className="topbar-right">
          <div className="who"><strong>{teacher.name}</strong><small>{teacher.email}</small></div>
          <div className="avatar" title={teacher.name}>{initials(teacher.name)}</div>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>Logout</button>
          <button className="menu-toggle" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">{"≡"}</button>
        </div>
      </header>
      {children}
    </div>
  );
}

function App() {
  const [booting, setBooting] = useState(true);
  const [teacher, setTeacher] = useState(null);
  const [view, setView] = useState("dashboard");
  const [isAdmin, setIsAdmin] = useState(false);
  const [attPreset, setAttPreset] = useState(null);
  const [askPin, setAskPin] = useState(false);
  const notifyRef = useRef(null);

  // restore session
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      if (raw) setTeacher(JSON.parse(raw));
    } catch (_) {}
    const t = setTimeout(() => setBooting(false), 900);
    return () => clearTimeout(t);
  }, []);

  const login = (t, remember) => {
    setTeacher(t);
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(t));
    setView("dashboard");
  };
  const logout = useCallback(() => {
    setTeacher(null); setIsAdmin(false); setView("dashboard");
    localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY);
  }, []);

  // auto-logout on inactivity
  useEffect(() => {
    if (!teacher) return;
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => { logout(); notifyRef.current && notifyRef.current("info", "Signed out", "You were away for a while."); }, IDLE_LIMIT_MS); };
    const evs = ["mousemove", "keydown", "click", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => { clearTimeout(timer); evs.forEach((e) => window.removeEventListener(e, reset)); };
  }, [teacher, logout]);

  const go = (v, preset) => { if (preset) setAttPreset(preset); setView(v); };

  if (booting) return <Boot />;

  return (
    <ToastHost>
      <NotifyBridge onReady={(fn) => (notifyRef.current = fn)} />
      {!teacher ? (
        <Login onLogin={login} />
      ) : (
        <Shell teacher={teacher} view={view} setView={setView} isAdmin={isAdmin}
          onUnlockAdmin={() => setAskPin(true)} onLogout={logout}>
          {view === "dashboard" && <Dashboard teacher={teacher} go={go} />}
          {view === "attendance" && <Attendance teacher={teacher} preset={attPreset} />}
          {view === "history" && <History />}
          {view === "reports" && <Reports />}
          {view === "admin" && isAdmin && <Admin />}
          {askPin && <PinGate onClose={() => setAskPin(false)} onOk={() => { setIsAdmin(true); setAskPin(false); setView("admin"); }} />}
        </Shell>
      )}
    </ToastHost>
  );
}

function NotifyBridge({ onReady }) {
  const notify = useToast();
  useEffect(() => { onReady(notify); }, [notify]);
  return null;
}

function PinGate({ onClose, onOk }) {
  const notify = useToast();
  const [pin, setPin] = useState("");
  const check = () => { if (pin === ADMIN_PIN) onOk(); else notify("error", "Wrong PIN", "Admin access denied."); };
  return (
    <Modal title="Admin access" onClose={onClose}>
      <p className="muted" style={{ marginBottom: "1rem" }}>Enter the admin PIN to manage teachers.</p>
      <div className="field">
        <input className="input" type="password" value={pin} autoFocus
          onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} placeholder="PIN" />
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" onClick={check}>Unlock</button>
      </div>
    </Modal>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
