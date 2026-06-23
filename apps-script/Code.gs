/*****************************************************************
 * Children Ministry Attendance System — Apps Script backend
 * ---------------------------------------------------------------
 * Deploy this bound to a Google Spreadsheet:
 *   1. Open your Sheet → Extensions → Apps Script
 *   2. Paste this file as Code.gs
 *   3. Run initialiseSpreadsheet() once (creates tabs + sample data)
 *   4. Deploy → New deployment → Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *   5. Copy the /exec URL into js/api.js (API_URL)
 *
 * CORS note: the front end sends POSTs with Content-Type
 * text/plain so the browser treats them as "simple requests"
 * (no preflight). Google serves the /exec response with the
 * CORS headers needed to read it back — so no manual headers
 * are required here.
 *****************************************************************/

var SHEETS = { TEACHERS: "Teachers", STUDENTS: "Students", ATTENDANCE: "Attendance" };

// Your spreadsheet. Leave as-is to use this sheet; clear it to use the
// sheet the script is bound to instead.
var SPREADSHEET_ID = "1DUWXNdV6OWW8O6KHZarpfLpLwk--guX8QgL0ULnwORU";

function getSS() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

/* ---------- HTTP entry points ---------- */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || "{}");
    var action = body.action;
    var result = route(action, body);
    return json(result);
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  // Health check — visiting the /exec URL in a browser shows this.
  return json({ ok: true, service: "Children Ministry Attendance API", time: new Date().toISOString() });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Router ---------- */
function route(action, p) {
  switch (action) {
    case "loginTeacher":         return loginTeacher(p);
    case "getStudents":          return getStudents(p);
    case "saveAttendance":       return saveAttendance(p);
    case "getAttendanceHistory": return getAttendanceHistory(p);
    case "getDashboardStats":    return getDashboardStats(p);
    case "generateReports":      return generateReports(p);
    case "addTeacher":           return addTeacher(p);
    case "updateTeacher":        return updateTeacher(p);
    case "deleteTeacher":        return deleteTeacher(p);
    case "listTeachers":         return listTeachers(p);
    default: return { ok: false, error: "Unknown action: " + action };
  }
}

/* ---------- Sheet helpers ---------- */
function sheet(name) {
  var ss = getSS();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error("Missing sheet: " + name + ". Run initialiseSpreadsheet() first.");
  return sh;
}
function rows(name) {
  var data = sheet(name).getDataRange().getValues();
  data.shift(); // drop header row
  return data.filter(function (r) { return r.join("") !== ""; });
}

/* ---------- 1. Login ---------- */
function loginTeacher(p) {
  var email = String(p.email || "").trim().toLowerCase();
  var pass = String(p.password || "");
  var found = rows(SHEETS.TEACHERS).filter(function (r) {
    // Columns: A Name, B Email, C Password
    return String(r[1]).trim().toLowerCase() === email && verifyPassword(pass, String(r[2]));
  })[0];
  if (!found) return { ok: false, error: "Email or password is incorrect." };
  return { ok: true, teacher: { name: String(found[0]), email: String(found[1]) } };
}

/* ---------- 2. Students ---------- */
function getStudents(p) {
  var cat = p.category;
  var list = rows(SHEETS.STUDENTS).map(function (r) {
    // Columns: A Student ID, B Name, C Category
    return { id: String(r[0]), name: String(r[1]), category: String(r[2]) };
  });
  if (cat) list = list.filter(function (s) { return s.category === cat; });
  return { ok: true, students: list };
}

/* ---------- 3. Save attendance ---------- */
function saveAttendance(p) {
  var sh = sheet(SHEETS.ATTENDANCE);
  var date = p.date, category = p.category;

  // Re-submitting the same date+class replaces the earlier rows.
  var values = sh.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][1]) === String(date) && String(values[i][3]) === String(category)) {
      sh.deleteRow(i + 1);
    }
  }

  var now = new Date();
  var stamp = now.toISOString();
  (p.records || []).forEach(function (rec) {
    sh.appendRow([
      "A-" + Utilities.getUuid().slice(0, 8), // A Attendance ID
      date,                                    // B Date
      rec.student,                             // C Student Name
      category,                                // D Category
      rec.status,                              // E Status
      p.teacher,                               // F Teacher Name
      p.email,                                 // G Teacher Email
      stamp                                    // H Timestamp
    ]);
  });
  return { ok: true, saved: (p.records || []).length };
}

/* ---------- 4. History ---------- */
function getAttendanceHistory(p) {
  var list = rows(SHEETS.ATTENDANCE).map(function (r) {
    return {
      id: String(r[0]), date: String(r[1]), student: String(r[2]), category: String(r[3]),
      status: String(r[4]), teacher: String(r[5]), email: String(r[6]), timestamp: String(r[7])
    };
  });
  if (p.date) list = list.filter(function (r) { return r.date === p.date; });
  if (p.category) list = list.filter(function (r) { return r.category === p.category; });
  if (p.student) {
    var q = String(p.student).toLowerCase();
    list = list.filter(function (r) { return r.student.toLowerCase().indexOf(q) > -1; });
  }
  list.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  return { ok: true, records: list };
}

/* ---------- 5. Dashboard stats ---------- */
function getDashboardStats() {
  var students = rows(SHEETS.STUDENTS);
  var count = function (c) { return students.filter(function (r) { return String(r[2]) === c; }).length; };
  var today = new Date().toISOString().slice(0, 10);
  var att = rows(SHEETS.ATTENDANCE).filter(function (r) { return String(r[1]) === today; });
  return {
    ok: true,
    stats: {
      total: students.length,
      Beginner: count("Beginner"),
      Midler: count("Midler"),
      Younger: count("Younger"),
      todayPresent: att.filter(function (r) { return String(r[4]) === "Present"; }).length,
      todayTotal: att.length
    }
  };
}

/* ---------- 6. Reports ---------- */
function generateReports() {
  var att = rows(SHEETS.ATTENDANCE);
  var byDate = {}, byCat = { Beginner: { p: 0, a: 0 }, Midler: { p: 0, a: 0 }, Younger: { p: 0, a: 0 } };
  var present = 0, absent = 0;
  att.forEach(function (r) {
    var date = String(r[1]), cat = String(r[3]), status = String(r[4]);
    if (!byDate[date]) byDate[date] = { present: 0, absent: 0 };
    if (status === "Present") { byDate[date].present++; present++; if (byCat[cat]) byCat[cat].p++; }
    else { byDate[date].absent++; absent++; if (byCat[cat]) byCat[cat].a++; }
  });
  return { ok: true, report: { total: present + absent, present: present, absent: absent, byDate: byDate, byCat: byCat } };
}

/* ---------- 7-10. Teacher admin ---------- */
function listTeachers() {
  return { ok: true, teachers: rows(SHEETS.TEACHERS).map(function (r) { return { name: String(r[0]), email: String(r[1]) }; }) };
}

function addTeacher(p) {
  var email = String(p.email || "").trim();
  if (!p.name || !email || !p.password) return { ok: false, error: "Name, email and password are required." };
  var exists = rows(SHEETS.TEACHERS).some(function (r) { return String(r[1]).toLowerCase() === email.toLowerCase(); });
  if (exists) return { ok: false, error: "A teacher with that email already exists." };
  sheet(SHEETS.TEACHERS).appendRow([p.name, email, hashPassword(p.password)]);
  return { ok: true };
}

function updateTeacher(p) {
  var sh = sheet(SHEETS.TEACHERS);
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][1]).toLowerCase() === String(p.email).toLowerCase()) {
      if (p.name) sh.getRange(i + 1, 1).setValue(p.name);
      if (p.password) sh.getRange(i + 1, 3).setValue(hashPassword(p.password));
      return { ok: true };
    }
  }
  return { ok: false, error: "Teacher not found." };
}

function deleteTeacher(p) {
  var sh = sheet(SHEETS.TEACHERS);
  var values = sh.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][1]).toLowerCase() === String(p.email).toLowerCase()) { sh.deleteRow(i + 1); return { ok: true }; }
  }
  return { ok: false, error: "Teacher not found." };
}

/*****************************************************************
 * Password hashing (recommended)
 * ---------------------------------------------------------------
 * By default this stores passwords as plain text so the system
 * works out of the box. To harden it, set HASH = true. New and
 * updated teacher passwords will then be stored as salted SHA-256
 * hashes, and login will compare hashes. (Existing plain-text
 * passwords keep working until they're changed.)
 *****************************************************************/
var HASH = false;
var SALT = "change-this-salt-string"; // set your own secret before enabling HASH

function hashPassword(plain) {
  if (!HASH) return plain;
  return "sha256$" + digest(plain);
}
function verifyPassword(plain, stored) {
  if (stored.indexOf("sha256$") === 0) return ("sha256$" + digest(plain)) === stored;
  return plain === stored; // legacy plain-text row
}
function digest(plain) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, SALT + plain, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}

/*****************************************************************
 * One-time setup — run this once from the editor.
 * Creates the three tabs, headers, and sample data.
 *****************************************************************/
function initialiseSpreadsheet() {
  var ss = getSS();

  var t = resetSheet(ss, SHEETS.TEACHERS, ["Teacher Name", "Email", "Password"]);
  t.appendRow(["Teacher John", "john@church.org", "demo1234"]);
  t.appendRow(["Sister Grace", "grace@church.org", "demo1234"]);

  var s = resetSheet(ss, SHEETS.STUDENTS, ["Student ID", "Student Name", "Category"]);
  var sample = [
    ["B-01", "Aaron Bello", "Beginner"], ["B-02", "Bisi Adeyemi", "Beginner"], ["B-03", "Caleb Okoro", "Beginner"],
    ["M-01", "Gideon Park", "Midler"], ["M-02", "Hannah Lee", "Midler"], ["M-03", "Isaac Mensah", "Midler"],
    ["Y-01", "Micah Stone", "Younger"], ["Y-02", "Naomi Reyes", "Younger"], ["Y-03", "Obed Kano", "Younger"]
  ];
  sample.forEach(function (r) { s.appendRow(r); });

  resetSheet(ss, SHEETS.ATTENDANCE,
    ["Attendance ID", "Date", "Student Name", "Category", "Attendance Status", "Teacher Name", "Teacher Email", "Timestamp"]);

  SpreadsheetApp.getUi && SpreadsheetApp.flush();
}

function resetSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  sh.setFrozenRows(1);
  return sh;
}
