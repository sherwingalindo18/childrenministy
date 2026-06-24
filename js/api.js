/* ============================================================
   api.js — talks to the Google Apps Script web app.

   HOW IT WORKS
   ------------
   Apps Script web apps reject cross-origin POSTs that trigger a
   CORS "preflight". The reliable workaround is to send the body
   as text/plain (a "simple request" that skips preflight) and
   parse the JSON server-side. That is what postAction() does.

   DEMO MODE
   ---------
   If API_URL is left as the placeholder below, the app runs on
   in-memory mock data so you can explore the full UI immediately.
   Replace API_URL with your deployed web-app URL to go live.
   ============================================================ */

(function () {
  // 1) DEPLOYED WEB APP URL -----------------------------------
  // LIVE: pointing at the deployed Apps Script web app, so the app
  // reads/writes your Google Sheet. To return to self-contained DEMO
  // mode (in-memory sample data), set this back to "PASTE_YOUR_WEB_APP_URL_HERE".
  const API_URL = "https://script.google.com/macros/s/AKfycbyRUJ-O5tdZYqItWMkmzbBMbEXAnBY2s9scOczw0J_90-XUvFBUy3mKOUUI_gif0UOziw/exec";
  // -----------------------------------------------------------

  const DEMO = !API_URL || API_URL.startsWith("PASTE_");

  /* ---------- live transport ---------- */
  async function postAction(action, payload) {
    const res = await fetch(API_URL, {
      method: "POST",
      // text/plain avoids the CORS preflight Apps Script can't answer
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload }),
      redirect: "follow",
    });
    if (!res.ok) throw new Error("Network error " + res.status);
    const data = await res.json();
    if (data && data.ok === false) {
      let err = data.error || "Request failed";
      // Turn the backend's cryptic "Unknown action: X" into a clear hint.
      if (/unknown action/i.test(err)) {
        err = "Your Google Apps Script backend is out of date. Redeploy Code.gs " +
              "(Apps Script → Deploy → Manage deployments → edit → New version) to enable this.";
      }
      throw new Error(err);
    }
    return data;
  }

  /* ---------- demo data ---------- */
  const D = {
    teachers: [
      { name: "Teacher John", email: "john@church.org", password: "demo1234", image: "" },
      { name: "Sister Grace", email: "grace@church.org", password: "demo1234", image: "" },
    ],
    students: [
      ["B-01", "Aaron Bello", "Beginner"], ["B-02", "Bisi Adeyemi", "Beginner"],
      ["B-03", "Caleb Okoro", "Beginner"], ["B-04", "Daniela Cruz", "Beginner"],
      ["B-05", "Esther Musa", "Beginner"], ["B-06", "Faith Olu", "Beginner"],
      ["M-01", "Gideon Park", "Middler"], ["M-02", "Hannah Lee", "Middler"],
      ["M-03", "Isaac Mensah", "Middler"], ["M-04", "Joy Abara", "Middler"],
      ["M-05", "Kevin Tan", "Middler"], ["M-06", "Lara Diallo", "Middler"],
      ["Y-01", "Micah Stone", "Younger"], ["Y-02", "Naomi Reyes", "Younger"],
      ["Y-03", "Obed Kano", "Younger"], ["Y-04", "Praise Eze", "Younger"],
      ["Y-05", "Ruth Ada", "Younger"], ["Y-06", "Samuel Idris", "Younger"],
    ].map((r) => ({ id: r[0], name: r[1], category: r[2], image: "" })),
    attendance: [],
  };

  // seed a few weeks of demo attendance so reports look alive
  (function seed() {
    if (!DEMO) return;
    const today = new Date();
    const sundays = [];
    for (let i = 1; i <= 5; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - today.getDay() - 7 * i);
      sundays.push(d.toISOString().slice(0, 10));
    }
    let id = 1;
    sundays.forEach((date) => {
      D.students.forEach((s) => {
        D.attendance.push({
          id: "A-" + id++,
          date,
          student: s.name,
          category: s.category,
          status: Math.random() > 0.25 ? "Present" : "Absent",
          teacher: "Teacher John",
          email: "john@church.org",
          timestamp: date + "T09:30:00",
        });
      });
    });
  })();

  function demo(action, p) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try { resolve(handleDemo(action, p)); }
        catch (e) { reject(e); }
      }, 360); // mimic latency so loading states are visible
    });
  }

  function handleDemo(action, p) {
    switch (action) {
      case "loginTeacher": {
        const t = D.teachers.find(
          (x) => x.email.toLowerCase() === (p.email || "").toLowerCase() && x.password === p.password
        );
        if (!t) throw new Error("Email or password is incorrect.");
        return { ok: true, teacher: { name: t.name, email: t.email, image: t.image || "" } };
      }
      case "getStudents":
        return { ok: true, students: p.category ? D.students.filter((s) => s.category === p.category) : D.students };
      case "updateStudent": {
        const s = D.students.find((x) => x.id === p.id);
        if (!s) throw new Error("Student not found.");
        if (p.name) s.name = p.name;
        if (p.category) s.category = p.category;
        if (typeof p.image === "string") s.image = p.image;
        return { ok: true };
      }
      case "addStudent": {
        const name = (p.name || "").trim(), category = (p.category || "").trim();
        if (!name || !category) throw new Error("Name and class are required.");
        let id = (p.id || "").trim();
        if (!id) {
          const prefix = category.charAt(0).toUpperCase();
          let max = 0;
          D.students.forEach((s) => { const m = String(s.id).match(new RegExp("^" + prefix + "-(\\d+)$")); if (m) max = Math.max(max, parseInt(m[1], 10)); });
          id = prefix + "-" + ("0" + (max + 1)).slice(-2);
        }
        D.students.push({ id, name, category, image: typeof p.image === "string" ? p.image : "" });
        return { ok: true, id };
      }
      case "deleteStudent": {
        const before = D.students.length;
        D.students = D.students.filter((s) => s.id !== p.id);
        if (D.students.length === before) throw new Error("Student not found.");
        return { ok: true };
      }
      case "getDashboardStats": {
        const today = p.today || new Date().toISOString().slice(0, 10);
        return {
          ok: true,
          stats: {
            total: D.students.length,
            Beginner: D.students.filter((s) => s.category === "Beginner").length,
            Middler: D.students.filter((s) => s.category === "Middler").length,
            Younger: D.students.filter((s) => s.category === "Younger").length,
            todayPresent: D.attendance.filter((a) => a.date === today && a.status === "Present").length,
            todayTotal: D.attendance.filter((a) => a.date === today).length,
          },
        };
      }
      case "saveAttendance": {
        // remove existing rows for same date+category, then add
        D.attendance = D.attendance.filter((a) => !(a.date === p.date && a.category === p.category));
        let n = D.attendance.length + 1;
        p.records.forEach((r) => {
          D.attendance.push({
            id: "A-" + n++, date: p.date, student: r.student, category: p.category,
            status: r.status, teacher: p.teacher, email: p.email,
            timestamp: new Date().toISOString(),
          });
        });
        return { ok: true, saved: p.records.length };
      }
      case "getAttendanceHistory": {
        let rows = [...D.attendance].sort((a, b) => (a.date < b.date ? 1 : -1));
        if (p.date) rows = rows.filter((r) => r.date === p.date);
        if (p.category) rows = rows.filter((r) => r.category === p.category);
        if (p.student) rows = rows.filter((r) => r.student.toLowerCase().includes(p.student.toLowerCase()));
        return { ok: true, records: rows };
      }
      case "generateReports": {
        const byDate = {};
        const byCat = { Beginner: { p: 0, a: 0 }, Middler: { p: 0, a: 0 }, Younger: { p: 0, a: 0 } };
        let present = 0, absent = 0;
        D.attendance.forEach((r) => {
          byDate[r.date] = byDate[r.date] || { present: 0, absent: 0 };
          if (r.status === "Present") { byDate[r.date].present++; present++; byCat[r.category].p++; }
          else { byDate[r.date].absent++; absent++; byCat[r.category].a++; }
        });
        return { ok: true, report: { total: present + absent, present, absent, byDate, byCat } };
      }
      case "addTeacher":
        if (D.teachers.some((t) => t.email.toLowerCase() === p.email.toLowerCase())) throw new Error("A teacher with that email already exists.");
        D.teachers.push({ name: p.name, email: p.email, password: p.password, image: "" });
        return { ok: true };
      case "updateTeacher": {
        const t = D.teachers.find((x) => x.email.toLowerCase() === p.email.toLowerCase());
        if (!t) throw new Error("Teacher not found.");
        if (p.name) t.name = p.name;
        if (p.password) t.password = p.password;
        if (typeof p.image === "string") t.image = p.image;
        return { ok: true };
      }
      case "deleteTeacher":
        D.teachers = D.teachers.filter((t) => t.email.toLowerCase() !== p.email.toLowerCase());
        return { ok: true };
      case "listTeachers":
        return { ok: true, teachers: D.teachers.map((t) => ({ name: t.name, email: t.email })) };
      default:
        throw new Error("Unknown action: " + action);
    }
  }

  /* ---------- public API ---------- */
  const call = (action, payload = {}) => (DEMO ? demo(action, payload) : postAction(action, payload));

  // Local calendar date as YYYY-MM-DD (avoids UTC/timezone off-by-one)
  function localToday() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  window.API = {
    isDemo: DEMO,
    login: (email, password) => call("loginTeacher", { email, password }),
    getStudents: (category) => call("getStudents", { category }),
    updateStudent: (s) => call("updateStudent", s),
    addStudent: (s) => call("addStudent", s),
    deleteStudent: (id) => call("deleteStudent", { id }),
    getDashboardStats: () => call("getDashboardStats", { today: localToday() }),
    saveAttendance: (data) => call("saveAttendance", data),
    getHistory: (filters) => call("getAttendanceHistory", filters),
    getReports: () => call("generateReports", {}),
    addTeacher: (t) => call("addTeacher", t),
    updateTeacher: (t) => call("updateTeacher", t),
    deleteTeacher: (email) => call("deleteTeacher", { email }),
    listTeachers: () => call("listTeachers", {}),
  };
})();
