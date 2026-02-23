// ╔══════════════════════════════════════════════════╗
// ║           FIREBASE REALTIME DATABASE             ║
// ║  All data stored at: traineexp-default-rtdb      ║
// ║  Every save/load goes through the internet       ║
// ╚══════════════════════════════════════════════════╝
const FIREBASE_URL = "https://traineexp-default-rtdb.firebaseio.com";

// ─── SHA-256 helper (WebCrypto — no external library needed) ─────────────────
async function sha256(message) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── XSS sanitiser — use on ALL user-supplied content before innerHTML ────────
function sanitize(str) {
  const d = document.createElement("div");
  d.textContent = String(str ?? "");
  return d.innerHTML;
}

// ─── Firebase helpers ─────────────────────────────────────────────────────────
async function fbRead() {
  const res = await fetch(FIREBASE_URL + "/txp.json");
  if (!res.ok) throw new Error("Server error: " + res.status);
  return await res.json(); // null = empty DB (first run)
}

async function fbWrite(data) {
  const res = await fetch(FIREBASE_URL + "/txp.json", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Save error: " + res.status);
  return true;
}

// ─── Targeted PATCH — avoids overwriting concurrent writes ───────────────────
// BUG-07 fix: use fbPatch for individual record updates instead of full PUT
async function fbPatch(path, data) {
  const res = await fetch(`${FIREBASE_URL}/txp/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Patch error: " + res.status);
  return true;
}

// ╔══════════════════════════════════════════════════╗
// ║                CONSTANTS                         ║
// ╚══════════════════════════════════════════════════╝
// BUG-01 FIX: Passwords removed from source. SHA-256 hashes stored instead.
// Default password for each intern is their username + "123" (e.g. shuja123).
// Admin default: TXPAdmin@2025!  — enforce password change on first use.
const INTERNS = [
  { id: 1, name: "Shuja Haider", username: "shuja" },
  { id: 2, name: "Aamir Ali", username: "aamir" },
  { id: 3, name: "Ali Jee", username: "ali" },
  { id: 4, name: "Huzaifa Akbar", username: "huzaifa" },
  { id: 5, name: "Qasim Abbas", username: "qasim" },
  { id: 6, name: "Tahir Ali", username: "tahir" },
  { id: 7, name: "Aizaz Ali", username: "aizaz" },
  { id: 8, name: "Hamza Asghar", username: "hamza" },
  { id: 9, name: "Jaffar Ali", username: "jaffar" },
  { id: 10, name: "Kazim Ali", username: "kazim" },
  { id: 11, name: "Asif Ali", username: "asif" },
  { id: 99, name: "Admin", username: "admin", role: "admin" },
];

// Pre-computed SHA-256 hashes of default passwords (NOT the passwords themselves).
// Interns: sha256(username+"123"). Admin: sha256("TXPAdmin@2025!").
// These are one-way hashes — originals cannot be recovered from them.
const INTERN_HASHES = {
  1: "2d6668d1170157905313a4c100a5dcbf7bb70555129e3f5419d554f0f3f245c0",
  2: "54147aa1bea98d0d7a980fadb72115825d1ffffdda7c198bdd968f50891917e4",
  3: "d5083e34522626dd10e151c78c1ba502a3d67427b752c3fd43bd3b944072d1e7",
  4: "b385d9ecee39fe284b0eeac3bd18a6003961054e016b96dd9642e1c3edce66e8",
  5: "e826d49d6d4c437ba1274193f38439f088ed6b2fa0711a4bcd66c8c3f94cfde4",
  6: "1b76c3b1ce640729d32da97b17c6ba8de952e07db6ff87bbf6f81af7cd881f0b",
  7: "7470e0545b6aa0f94520c9cfb630426e835620139cd8d7ebd2e903598e6d6953",
  8: "889b4d97b992b279eab73fd16c7f02d4203f9664d70bf5163bb0c2404473d217",
  9: "66d0b2bb65da376ef1e8c8f47498743d874cc34d6bca47c09d97a3dba38810c3",
  10: "375073aab4145956b3d8f091d495b5ef6d5a75f61c60b9b39e13c57f131281e2",
  11: "cb6b83715df484baed6f54e05e6f461487e962ae1344952e038ced95560648fc",
  99: "fff7713c12b9fd8116247457587f237d7c58f6e4fe95deff0fc41dfc9d9ec563",
};

// BUG-04 FIX: Settings lock uses hash comparison — code never lives client-side.
// SHA-256 of original code "TXP@dm!n2025":
const SETTINGS_HASH =
  "60099569b8e009aa72a3b2b296c7b15b4424ba614e2a3bc805cc0e439e5ed164";

const CAT_KEYS = {
  "College Attendance": "college",
  "Office Attendance": "office",
  Projects: "project",
  Bugs: "bugs",
  Suggestions: "suggestions",
};
const CAT_ICONS = {
  "College Attendance": "🎓",
  "Office Attendance": "🏢",
  Projects: "🚀",
  Bugs: "🐛",
  Suggestions: "💡",
};
const DEF_POINTS = {
  "College Attendance": 5,
  "Office Attendance": 5,
  Projects: 10,
  Bugs: 8,
  Suggestions: 5,
};

// ╔══════════════════════════════════════════════════╗
// ║                    STATE                         ║
// ╚══════════════════════════════════════════════════╝
let currentUser = null,
  currentRole = "intern",
  db = null;
let _approvalContribId = null,
  _repeatConfig = null;
let currentPage = null;
let settingsUnlocked = false;
let _settingsFails = 0;
let _settingsCooldown = false;
let _isDirty = false; // BUG-20: only write to Firebase when data changes
let _undoTimer = null; // BUG-10: pending undo for task completion

// ╔══════════════════════════════════════════════════╗
// ║              DATABASE HELPERS                    ║
// ╚══════════════════════════════════════════════════╝
function blankDB() {
  const d = {
    contributors: [],
    tasks: [],
    submissions: {},
    complaints: [],
    taskCompletions: {},
    notifications: {},
    adminNotifications: [],
    catPoints: Object.assign({}, DEF_POINTS),
    pendingRequests: [],
  };
  INTERNS.filter((i) => i.id !== 99).forEach((i) => {
    d.submissions[i.id] = {
      college: 0,
      office: 0,
      project: 0,
      bugs: 0,
      suggestions: 0,
      dailyCounts: {},
      points: 0,
    };
    d.notifications[i.id] = [];
  });
  return d;
}

function patchDB(data) {
  if (!data.submissions) data.submissions = {};
  if (!data.notifications) data.notifications = {};
  if (!data.adminNotifications) data.adminNotifications = [];
  if (!data.contributors) data.contributors = [];
  if (!data.tasks) data.tasks = [];
  if (!data.complaints) data.complaints = [];
  if (!data.taskCompletions) data.taskCompletions = {};
  if (!data.catPoints) data.catPoints = Object.assign({}, DEF_POINTS);
  if (!data.pendingRequests) data.pendingRequests = [];
  INTERNS.filter((i) => i.id !== 99).forEach((i) => {
    if (!data.submissions[i.id])
      data.submissions[i.id] = {
        college: 0,
        office: 0,
        project: 0,
        bugs: 0,
        suggestions: 0,
        dailyCounts: {},
        points: 0,
      };
    if (!data.notifications[i.id]) data.notifications[i.id] = [];
  });
  return data;
}

async function loadDB() {
  // BUG-03 FIX: Separate network errors from "empty DB" case.
  // Only write blankDB when Firebase returns null (genuinely empty database).
  // A fetch error should surface to the caller — never silently wipe data.
  let raw;
  try {
    raw = await fbRead();
  } catch (e) {
    // Re-throw so doLogin() can show the connection error to the user
    throw e;
  }
  if (raw === null) {
    // First run — database is truly empty
    db = blankDB();
    await fbWrite(db);
  } else {
    db = patchDB(raw);
  }
  const changed = processRepeatTasks();
  if (changed) await fbWrite(db);
}

async function saveDB() {
  _isDirty = false;
  await fbWrite(db);
}

function markDirty() {
  _isDirty = true;
}

// ╔══════════════════════════════════════════════════╗
// ║         REPEAT TASK ENGINE                       ║
// ║  Runs on every login & sync.                     ║
// ║  Auto-generates today's instance of any          ║
// ║  recurring template task if not yet created.     ║
// ╚══════════════════════════════════════════════════╝
function processRepeatTasks() {
  const td = today();
  let changed = false;

  const templates = db.tasks.filter((t) => t.repeat && t.isTemplate);
  for (const tmpl of templates) {
    const r = tmpl.repeat;

    // Skip paused templates — no instances generated while paused
    if (tmpl.paused) continue;

    // ── BACKFILL: check every date from lastGenerated+1 up to today ────────
    // This ensures missed days (user didn't log in) still get their instances.
    const checkDates = getDatesToCheck(tmpl.lastGenerated, td);
    let lastGen = tmpl.lastGenerated; // tracks most recent generated date overall

    // ── Per-DOW tracking for 'Weeks' frequency ──────────────────────────────
    // "Every week on Mon+Wed" should fire BOTH Mon and Wed independently.
    // A single lastGenerated would wrongly block Wed if Mon was just generated.
    const lastGenByDow = {};
    if (r.freq === "Weeks") {
      db.tasks
        .filter((t) => t.templateId === tmpl.id && t.instanceDate)
        .forEach((t) => {
          const d = new Date(t.instanceDate + "T00:00:00").getDay();
          if (!lastGenByDow[d] || t.instanceDate > lastGenByDow[d])
            lastGenByDow[d] = t.instanceDate;
        });
    }

    for (const checkDate of checkDates) {
      // For weekly tasks, pass the per-DOW last-generated date so each day
      // of the week is checked independently against the interval
      let effectiveLastGen = lastGen;
      if (r.freq === "Weeks") {
        const dow = new Date(checkDate + "T00:00:00").getDay();
        effectiveLastGen = lastGenByDow[dow] ?? null;
      }

      if (!shouldGenerateForDate(r, checkDate, effectiveLastGen)) continue;

      // Prevent duplicates (e.g. if backfill runs twice)
      const alreadyExists = db.tasks.some(
        (t) => t.templateId === tmpl.id && t.instanceDate === checkDate,
      );
      if (alreadyExists) {
        // Still advance trackers so next checkDate has correct reference
        lastGen = checkDate;
        if (r.freq === "Weeks") {
          const dow = new Date(checkDate + "T00:00:00").getDay();
          lastGenByDow[dow] = checkDate;
        }
        continue;
      }

      // Create the instance for this specific date
      const inst = {
        id: "ri-" + tmpl.id + "-" + checkDate,
        title: tmpl.title,
        description: tmpl.description,
        assignedTo: tmpl.assignedTo,
        category: tmpl.category,
        points: tmpl.points,
        dueDate: checkDate,
        approvalRequired: tmpl.approvalRequired,
        approvalContribId: tmpl.approvalContribId,
        isPersonal: tmpl.isPersonal,
        createdBy: tmpl.createdBy,
        createdDate: checkDate,
        createdAt: new Date(checkDate + "T00:00:00").getTime(),
        templateId: tmpl.id,
        instanceDate: checkDate,
        repeat: null,
      };
      db.tasks.push(inst);

      // Notify intern only for TODAY's instance (not backfilled past days)
      if (!tmpl.isPersonal && checkDate === td) {
        const iid = tmpl.assignedTo;
        if (!db.notifications[iid]) db.notifications[iid] = [];
        db.notifications[iid].unshift({
          id: "n-" + Date.now() + "-" + iid,
          msg: `🔁 Recurring task today: "${tmpl.title}"`,
          type: "repeat",
          read: false,
          date: td,
        });
      }

      lastGen = checkDate;
      tmpl.lastGenerated = checkDate;
      if (r.freq === "Weeks") {
        const dow = new Date(checkDate + "T00:00:00").getDay();
        lastGenByDow[dow] = checkDate;
      }
      changed = true;
    }
  }
  return changed;
}

// ── Date-aware version: checks a SPECIFIC date, not always "today" ───────────
// FIX: was shouldGenerateToday() which used new Date().getDay() (always live clock)
//      and had a Weeks logic bug: `|| r.days.includes(dow)` always returned true
//      when the day of week matched, ignoring the interval entirely.
function shouldGenerateForDate(r, checkDate, lastGenerated) {
  if (lastGenerated === checkDate) return false; // already generated this date
  const freq = r.freq || "Days";
  const interval = r.interval || 1;
  // Use the DATE being checked for day-of-week, not the live clock
  const dow = new Date(checkDate + "T00:00:00").getDay();

  if (freq === "Days") {
    if (!lastGenerated) return true;
    const daysDiff = Math.floor(
      (new Date(checkDate) - new Date(lastGenerated)) / 86400000,
    );
    return daysDiff >= interval;
  }
  if (freq === "Weekdays") {
    return dow >= 1 && dow <= 5; // Mon–Fri only
  }
  if (freq === "Weeks") {
    if (!r.days || r.days.length === 0) return false;
    if (!r.days.includes(dow)) return false; // not a selected weekday
    if (!lastGenerated) return true;
    // FIX: was `weeksDiff >= interval || r.days.includes(dow)`
    // `r.days.includes(dow)` is always true here → bug made it fire every week regardless of interval
    const weeksDiff = Math.floor(
      (new Date(checkDate) - new Date(lastGenerated)) / (7 * 86400000),
    );
    return weeksDiff >= interval;
  }
  if (freq === "Months") {
    if (!lastGenerated) return true;
    const last = new Date(lastGenerated);
    const now = new Date(checkDate);
    const diff =
      (now.getFullYear() - last.getFullYear()) * 12 +
      (now.getMonth() - last.getMonth());
    return diff >= interval;
  }
  if (freq === "Years") {
    if (!lastGenerated) return true;
    const last = new Date(lastGenerated);
    const now = new Date(checkDate);
    return now.getFullYear() - last.getFullYear() >= interval;
  }
  return false;
}

// ── Returns all dates from (lastGenerated + 1 day) up to today ───────────────
// Capped at 30 days to prevent DB bloat if a user returns after a long absence.
// IMPORTANT: uses dateToLocalStr() not toISOString() — toISOString() gives UTC date
// which is wrong for users in UTC+ timezones (e.g. midnight in Pakistan = yesterday UTC).
function getDatesToCheck(lastGenerated, todayStr) {
  if (!lastGenerated) return [todayStr]; // first-ever run: only generate today
  const dates = [];
  let cur = new Date(lastGenerated + "T00:00:00");
  cur.setDate(cur.getDate() + 1); // start from day AFTER lastGenerated
  const end = new Date(todayStr + "T00:00:00");
  const limit = new Date(todayStr + "T00:00:00");
  limit.setDate(limit.getDate() - 30); // max 30 days backfill
  if (cur < limit) cur = new Date(limit);
  while (cur <= end) {
    dates.push(dateToLocalStr(cur)); // ← local date, not UTC
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ╔══════════════════════════════════════════════════╗
// ║         SETTINGS SECURITY LOCK                   ║
// ╚══════════════════════════════════════════════════╝
function openSettingsLock() {
  const locked = _settingsCooldown
    ? `<div style="background:#fff0f0;border:1px solid #fecaca;border-radius:8px;padding:11px 14px;font-size:13px;color:#e53e3e;margin-bottom:14px;">
        ⏳ Too many wrong attempts. Please wait 30 seconds.
       </div>`
    : _settingsFails > 0
      ? `<div style="background:#fff0f0;border:1px solid #fecaca;border-radius:8px;padding:11px 14px;font-size:13px;color:#e53e3e;margin-bottom:14px;">
        ❌ Incorrect code. ${3 - _settingsFails} attempt(s) remaining.
       </div>`
      : "";

  openModal(`
    <div style="text-align:center;margin-bottom:18px;">
      <div style="font-size:36px;margin-bottom:8px;">🔐</div>
      <div class="modal-title" style="text-align:center;">Settings Authorization</div>
      <div style="font-size:12px;color:var(--text2);">This section is restricted. Enter the admin security code to proceed.</div>
    </div>
    ${locked}
    <div class="form-group">
      <label>Admin Security Code</label>
      <input type="password" id="settingsCode" placeholder="Enter security code"
        autocomplete="new-password"
        ${_settingsCooldown ? "disabled" : ""}
        onkeydown="if(event.key==='Enter')verifySettingsCode()"
        style="letter-spacing:3px;font-size:16px;text-align:center;">
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="verifySettingsCode()" ${_settingsCooldown ? "disabled" : ""}>
        🔓 Verify &amp; Enter
      </button>
    </div>
    <div style="margin-top:14px;padding:10px;background:var(--surface2);border-radius:8px;font-size:11px;color:var(--text3);text-align:center;">
      🛡 This code is configured by developers only and cannot be changed from UI.
    </div>`);

  if (!_settingsCooldown)
    setTimeout(() => document.getElementById("settingsCode")?.focus(), 100);
}

async function verifySettingsCode() {
  if (_settingsCooldown) return;
  const entered = document.getElementById("settingsCode")?.value || "";
  // BUG-04 FIX: Compare SHA-256 hash of entered code against SETTINGS_HASH constant.
  // The actual code is never stored or checked as plaintext client-side.
  const enteredHash = await sha256(entered);
  if (enteredHash === SETTINGS_HASH) {
    settingsUnlocked = true;
    _settingsFails = 0;
    closeModal();
    navigateTo("adminSettings");
  } else {
    _settingsFails++;
    if (_settingsFails >= 3) {
      _settingsCooldown = true;
      setTimeout(() => {
        _settingsCooldown = false;
        _settingsFails = 0;
      }, 30000);
    }
    openSettingsLock();
  }
}

// ╔══════════════════════════════════════════════════╗
// ║              LOADING / STATUS UI                 ║
// ╚══════════════════════════════════════════════════╝
function showLoading(msg) {
  document.getElementById("loadMsg").textContent = msg || "Loading...";
  document.getElementById("loadingOverlay").classList.remove("hidden");
}
function hideLoading() {
  document.getElementById("loadingOverlay").classList.add("hidden");
}
function showStatus(msg, isError) {
  const el = document.getElementById("syncStatus");
  el.textContent = msg;
  el.className = "sync-status show" + (isError ? " error" : "");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3500);
}

// Save → show loading → refresh page
async function saveAndRefresh(successMsg, page) {
  try {
    showLoading("Saving to server...");
    await saveDB();
    hideLoading();
    showStatus("✓ " + successMsg);
    showToast(successMsg, "success");
    if (page) await navigateTo(page);
  } catch (e) {
    hideLoading();
    showStatus("⚠ Save failed — check internet", true);
    showToast("Save failed. Check your internet connection.", "error");
  }
}

// ╔══════════════════════════════════════════════════╗
// ║                SYNC                              ║
// ╚══════════════════════════════════════════════════╝
async function manualSync() {
  // BUG-06 FIX: syncBtn was removed from UI — guard to prevent TypeError crash
  const btn = document.getElementById("syncBtn");
  if (btn) btn.classList.add("syncing");
  try {
    showLoading("Refreshing data from server...");
    await loadDB();
    hideLoading();
    showStatus("✓ Synced with server");
    updateBadges();
    if (currentPage) await navigateTo(currentPage);
  } catch (e) {
    hideLoading();
    showStatus("⚠ Sync failed — check internet", true);
    showToast("Sync failed. Check internet connection.", "error");
  } finally {
    if (btn) btn.classList.remove("syncing");
  }
}

// ╔══════════════════════════════════════════════════╗
// ║                   LOGIN                          ║
// ╚══════════════════════════════════════════════════╝
async function doLogin() {
  const u = document.getElementById("loginUser").value.trim().toLowerCase();
  const p = document.getElementById("loginPass").value;
  if (!u || !p) {
    const err = document.getElementById("loginError");
    err.textContent = !u ? "Username is required." : "Password is required.";
    err.style.display = "block";
    return;
  }
  // BUG-01 FIX: compare SHA-256 hash of entered password against stored hashes.
  // No plaintext passwords exist anywhere in source code.
  const user = INTERNS.find((i) => i.username === u);
  if (!user) {
    showLoginError("Invalid credentials. Please try again.");
    return;
  }
  const enteredHash = await sha256(p);
  if (enteredHash !== INTERN_HASHES[user.id]) {
    showLoginError("Invalid credentials. Please try again.");
    return;
  }

  document.getElementById("loginError").style.display = "none";
  showLoading("Connecting to server...");
  try {
    await loadDB();
    hideLoading();
    currentUser = user;
    currentRole = user.role || "intern";
    document.getElementById("loginScreen").classList.remove("active");
    document.getElementById("mainScreen").classList.add("active");
    document.getElementById("topName").textContent = sanitize(user.name);
    document.getElementById("topRole").textContent =
      currentRole === "admin" ? "Administrator" : "Intern";
    document.getElementById("topAvatar").textContent = user.name[0];
    window.taskFilter = "Today";
    window.adminTaskFilter = "Sent";
    window.adminSelectedIntern = null;
    window.atFilterAssignee = "";
    window.atFilterCat = "";
    renderSidebar();
    startRepeatTimer(); // auto-refresh recurring tasks every 5 min while logged in
    await navigateTo(
      currentRole === "admin" ? "adminDashboard" : "internDashboard",
    );
  } catch (e) {
    hideLoading();
    showLoginError(
      "⚠ Cannot connect to server. Check your internet connection.",
    );
  }
}

function showLoginError(msg) {
  const err = document.getElementById("loginError");
  err.textContent = msg;
  err.style.display = "block";
  document.getElementById("loginPass").value = "";
}

function doLogout() {
  if (_repeatCheckTimer) {
    clearInterval(_repeatCheckTimer);
    _repeatCheckTimer = null;
  }
  currentUser = null;
  currentRole = "intern";
  db = null;
  currentPage = null;
  settingsUnlocked = false;
  _settingsFails = 0;
  _settingsCooldown = false;
  document.getElementById("mainScreen").classList.remove("active");
  document.getElementById("loginScreen").classList.add("active");
  document.getElementById("loginUser").value = "";
  document.getElementById("loginPass").value = "";
}

function openProfilePopup() {
  if (!currentUser) return;
  const roleLabel = currentRole === "admin" ? "Administrator" : "Intern";
  const initial = currentUser.name[0];
  openModal(`
    <div style="text-align:center;margin-bottom:20px;">
      <div style="width:60px;height:60px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#fff;margin:0 auto 10px;">${initial}</div>
      <div style="font-size:17px;font-weight:800;">${currentUser.name}</div>
      <div style="font-size:12px;color:var(--text2);">${roleLabel}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;background:var(--surface2);border-radius:10px;padding:14px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;">
        <span style="color:var(--text2);font-weight:600;">ID</span>
        <span style="font-weight:700;">${currentUser.id}</span>
      </div>
      <div style="height:1px;background:var(--border);"></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;">
        <span style="color:var(--text2);font-weight:600;">Name</span>
        <span style="font-weight:700;">${currentUser.name}</span>
      </div>
      <div style="height:1px;background:var(--border);"></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;">
        <span style="color:var(--text2);font-weight:600;">Username</span>
        <span style="font-weight:700;">@${currentUser.username}</span>
      </div>
      <div style="height:1px;background:var(--border);"></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;">
        <span style="color:var(--text2);font-weight:600;">Role</span>
        <span style="font-weight:700;">${roleLabel}</span>
      </div>
    </div>
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn btn-secondary btn-full" onclick="closeModal()">Close</button>
    </div>`);
}

// ╔══════════════════════════════════════════════════╗
// ║         MOBILE SIDEBAR DRAWER CONTROLS           ║
// ╚══════════════════════════════════════════════════╝
function toggleMobileSidebar() {
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("sidebarOverlay");
  const open = sb.classList.contains("mobile-open");
  if (open) {
    sb.classList.remove("mobile-open");
    ov.classList.remove("open");
  } else {
    sb.classList.add("mobile-open");
    ov.classList.add("open");
  }
}
function closeMobileSidebar() {
  document.getElementById("sidebar").classList.remove("mobile-open");
  document.getElementById("sidebarOverlay").classList.remove("open");
}

const internNav = [
  { id: "internDashboard", icon: "📊", label: "Dashboard" },
  { id: "internTasks", icon: "✅", label: "Tasks", badge: "sb-notif" },
  { id: "internComplaints", icon: "📣", label: "Complaints" },
];
const adminNav = [
  { id: "adminDashboard", icon: "📊", label: "Dashboard" },
  { id: "adminTasks", icon: "📋", label: "Manage Tasks" },
  {
    id: "adminComplaints",
    icon: "📣",
    label: "Complaints",
    badge: "sb-complaint",
  },
  { id: "adminSettings", icon: "⚙️", label: "Settings 🔐" },
];

function renderSidebar() {
  const nav = currentRole === "admin" ? adminNav : internNav;
  document.getElementById("sidebar").innerHTML =
    '<div class="sidebar-section">Menu</div>' +
    nav
      .map(
        (
          n,
        ) => `<div class="sidebar-item" id="nav-${n.id}" onclick="navigateTo('${n.id}');closeMobileSidebar();">
      <span class="sidebar-icon">${n.icon}</span>${n.label}
      ${n.badge ? `<span class="sidebar-badge" id="${n.badge}"></span>` : ""}
    </div>`,
      )
      .join("") +
    `<button class="sidebar-logout" onclick="doLogout()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      Log Out
    </button>`;
  updateBadges();
}

async function navigateTo(page) {
  // Settings requires 2nd-factor auth — intercept if not yet unlocked
  if (page === "adminSettings" && !settingsUnlocked) {
    openSettingsLock();
    return;
  }
  currentPage = page;
  document
    .querySelectorAll(".sidebar-item")
    .forEach((el) => el.classList.remove("active"));
  const el = document.getElementById("nav-" + page);
  if (el) el.classList.add("active");
  const ca = document.getElementById("contentArea");
  ca.scrollTop = 0;
  const map = {
    internDashboard: () => renderInternDashboard(ca),
    internTasks: () => renderInternTasks(ca),
    internComplaints: () => renderInternComplaints(ca),
    internNotifs: () => renderInternNotifs(ca),
    adminDashboard: () => renderAdminDashboard(ca),
    adminTasks: () => renderAdminTasks(ca),
    adminNotifs: () => renderAdminNotifs(ca),
    adminComplaints: () => renderAdminComplaints(ca),
    adminSettings: () => renderAdminSettings(ca),
  };
  if (map[page]) map[page]();
  updateBadges();
}

function updateBadges() {
  if (!currentUser || !db) return;
  if (currentRole === "intern") {
    const n = (db.notifications?.[currentUser.id] || []).filter(
      (x) => !x.read,
    ).length;
    const el = document.getElementById("sb-notif");
    if (el) {
      el.textContent = n || "";
      el.className = "sidebar-badge" + (n ? " show" : "");
    }
    document.getElementById("notifDot").className =
      "notif-dot" + (n ? " show" : "");
  } else {
    const nc = (db.complaints || []).filter((c) => !c.read).length;
    const na = (db.adminNotifications || []).filter((n) => !n.read).length;
    const nr = (db.pendingRequests || []).filter(
      (r) => r.status === "pending",
    ).length;
    const elc = document.getElementById("sb-complaint");
    if (elc) {
      elc.textContent = nc || "";
      elc.className = "sidebar-badge" + (nc ? " show" : "");
    }
    document.getElementById("notifDot").className =
      "notif-dot" + (nc + na + nr ? " show" : "");
  }
}

function handleNotifClick() {
  navigateTo(currentRole === "admin" ? "adminNotifs" : "internNotifs");
}

// ╔══════════════════════════════════════════════════╗
// ║             INTERN DASHBOARD                     ║
// ╚══════════════════════════════════════════════════╝
function getObedience(id) {
  // ROLLING WINDOW: for recurring instances only count last 30 days.
  // One-off admin tasks always count. This prevents stale instances from tanking scores.
  const cutoffStr = dateToLocalStr(
    new Date(Date.now() - 30 * 24 * 3600 * 1000),
  );
  const tasks = db.tasks.filter(
    (t) =>
      t.assignedTo === id &&
      !t.isPersonal &&
      !t.isTemplate &&
      (!t.instanceDate || t.instanceDate >= cutoffStr),
  );
  if (!tasks.length) return 0;
  return Math.round(
    (tasks.filter((t) => db.taskCompletions?.[t.id + "-" + id]?.done).length /
      tasks.length) *
      100,
  );
}

function getObedienceCounts(id) {
  const cutoffStr = dateToLocalStr(
    new Date(Date.now() - 30 * 24 * 3600 * 1000),
  );
  const tasks = db.tasks.filter(
    (t) =>
      t.assignedTo === id &&
      !t.isPersonal &&
      !t.isTemplate &&
      (!t.instanceDate || t.instanceDate >= cutoffStr),
  );
  return {
    total: tasks.length,
    done: tasks.filter((t) => db.taskCompletions?.[t.id + "-" + id]?.done)
      .length,
  };
}

function renderInternDashboard(ca) {
  const id = currentUser.id;
  const s = db.submissions[id] || {};
  // BUG-24 FIX: use toLocaleString() for thousands separators (1,250 not 1250)
  const pts = s.points || 0;
  const ob = getObedience(id);
  const { total: taskCount, done: doneCount } = getObedienceCounts(id);
  ca.innerHTML = `<div>
    <div class="page-title">Dashboard</div>
    <div class="page-sub">Welcome back, ${sanitize(currentUser.name)}</div>
    <div class="grid-2" style="margin-bottom:12px;">
      <div class="points-big">
        <div><div class="points-label">Total Points</div><div class="points-number">${pts.toLocaleString()}</div></div>
        <div style="font-size:32px;">🏆</div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;justify-content:center;">
        <div class="section-title" style="margin-bottom:6px;">Obedience Score</div>
        <div style="font-size:28px;font-weight:800;">${ob}%</div>
        <div class="obedience-bar"><div class="obedience-fill" style="width:${ob}%"></div></div>
        <div style="font-size:11px;color:var(--text2);margin-top:5px;">${doneCount} / ${taskCount} tasks completed <span style="color:var(--text3);">(last 30 days)</span></div>
      </div>
    </div>
    <div class="section-title">Performance Dashboard</div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px;">
      ${[
        ["🎓", "College", s.college || 0],
        ["🏢", "Office", s.office || 0],
        ["🚀", "Projects", s.project || 0],
        ["🐛", "Bugs", s.bugs || 0],
        ["💡", "Suggestions", s.suggestions || 0],
      ]
        .map(
          ([ic, lb, vl]) =>
            `<div class="stat-card"><div class="stat-emoji">${ic}</div><div class="stat-label">${lb}</div><div class="stat-value">${vl.toLocaleString()}</div></div>`,
        )
        .join("")}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;">
      <button class="btn btn-primary" onclick="openAddModal()">+ Add Entry</button>
      <button class="btn btn-secondary" onclick="openSendRequest()">📨 Send Request</button>
    </div>
  </div>`;
}

// ╔══════════════════════════════════════════════════╗
// ║                 ADD ENTRY                        ║
// ╚══════════════════════════════════════════════════╝
function openAddModal() {
  const catPts = db.catPoints || DEF_POINTS;
  const opts = Object.keys(CAT_KEYS);
  openModal(`<div class="modal-title">+ Add Entry</div>
    <div class="form-group">
      <label>Category</label>
      <select id="addCat" onchange="refreshContribInfo()">
        ${opts.map((o) => `<option value="${o}">${CAT_ICONS[o]} ${o}</option>`).join("")}
      </select>
    </div>
    <div id="catInfoBox" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 13px;margin-bottom:11px;">
      <div style="font-size:12px;color:var(--text2);">Points for this category: <strong id="catPtsVal" style="color:var(--accent);">${catPts["College Attendance"] || 5}</strong></div>
      <div style="font-size:12px;color:var(--text2);margin-top:5px;">Assigned contributor:</div>
      <div id="catContribName" style="font-weight:600;color:var(--text);margin-top:3px;">—</div>
    </div>
    <div class="form-group">
      <label>Contributor Code</label>
      <input type="password" id="addCode" placeholder="Enter contributor code" autocomplete="off" oninput="refreshContribFromCode()">
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:9px 13px;margin-bottom:10px;">
      <div><div style="font-size:13px;font-weight:600;">Bonus Points</div><div style="font-size:11px;color:var(--text2);">Award extra points for outstanding work</div></div>
      <label class="toggle"><input type="checkbox" id="addBonus" onchange="document.getElementById('bonusWrap').style.display=this.checked?'block':'none'"><span class="toggle-slider"></span></label>
    </div>
    <div id="bonusWrap" style="display:none;margin-bottom:10px;">
      <div class="form-group" style="margin-bottom:0;"><label>Additional Points</label><input type="number" id="bonusPts" min="0" max="100" value="0"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-secondary" onclick="closeModal();openSendRequest()">📨 Send Request</button>
      <button class="btn btn-primary" onclick="submitAdd()">Submit</button>
    </div>`);
  refreshContribInfo();
}

function refreshContribInfo() {
  const cat = document.getElementById("addCat")?.value;
  if (!cat) return;
  const catPts = db.catPoints || DEF_POINTS;
  document.getElementById("catPtsVal").textContent = catPts[cat] || 5;
  // Only show contributors that handle entries (not taskApprovalOnly)
  const contrib = db.contributors.find(
    (c) => !c.taskApprovalOnly && (c.category === cat || c.category === "All"),
  );
  document.getElementById("catContribName").textContent = contrib
    ? contrib.name
    : "No contributor assigned for this category";
}

function refreshContribFromCode() {
  const code = document.getElementById("addCode").value.trim();
  const contrib = db.contributors.find((c) => c.code === code);
  if (contrib)
    document.getElementById("catContribName").textContent = contrib.name + " ✓";
  else refreshContribInfo();
}

async function submitAdd() {
  const cat = document.getElementById("addCat").value;
  const code = document.getElementById("addCode").value.trim();
  const catKey = CAT_KEYS[cat];
  const s = db.submissions[currentUser.id];
  const td = today();
  const dk = td + "-" + catKey;
  s.dailyCounts = s.dailyCounts || {};
  if ((s.dailyCounts[dk] || 0) >= 3) {
    showToast("Daily limit (3) reached for this category", "error");
    return;
  }
  const contrib = db.contributors.find((c) => c.code === code);
  if (!contrib) {
    showToast("Invalid contributor code", "error");
    return;
  }
  if (contrib.taskApprovalOnly) {
    showToast(
      "This contributor is for task approval only, not entries. Use Send Request instead.",
      "error",
    );
    return;
  }
  if (
    contrib.category &&
    contrib.category !== cat &&
    contrib.category !== "All"
  ) {
    showToast("This contributor is not assigned to " + cat, "error");
    return;
  }
  s[catKey] = (s[catKey] || 0) + 1;
  s.dailyCounts[dk] = (s.dailyCounts[dk] || 0) + 1;
  const catPts = db.catPoints || DEF_POINTS;
  let earned = catPts[cat] || 5;
  if (document.getElementById("addBonus").checked)
    earned += parseInt(document.getElementById("bonusPts").value) || 0;
  s.points = (s.points || 0) + earned;
  db.submissions[currentUser.id] = s;
  closeModal();
  await saveAndRefresh(cat + " added! +" + earned + " pts", "internDashboard");
}

// ╔══════════════════════════════════════════════════╗
// ║           SEND REQUEST (Feature 3)               ║
// ║  Intern sends request when no contributor avail  ║
// ║  Admin approves → entry or task auto-applied     ║
// ╚══════════════════════════════════════════════════╝
// BUG-19 FIX: accepts optional preTaskId to pre-select the task in the dropdown
function openSendRequest(preTaskId) {
  const cats = Object.keys(CAT_KEYS);
  const alreadyRequested = new Set(
    (db.pendingRequests || [])
      .filter((r) => r.status === "pending" && r.type === "task")
      .map((r) => r.taskId),
  );
  const approvalTasks = db.tasks.filter(
    (t) =>
      t.assignedTo === currentUser.id &&
      !t.isPersonal &&
      !t.isTemplate &&
      t.approvalRequired === true &&
      !isTaskDone(t.id, currentUser.id) &&
      !alreadyRequested.has(t.id),
  );
  // If preTaskId is specified switch default type to 'task'
  const defaultType = preTaskId ? "task" : "entry";
  openModal(`<div class="modal-title">📨 Send Request to Admin</div>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 13px;font-size:12px;color:#92400e;margin-bottom:14px;">
      Use this when no contributor is available. Admin will review and approve your request. Nothing is added or completed until admin approves.
    </div>
    <div class="form-group">
      <label>Request Type</label>
      <select id="reqType" onchange="toggleReqType()">
        <option value="entry" ${defaultType === "entry" ? "selected" : ""}>Add Entry (attendance/project/etc.)</option>
        <option value="task"  ${defaultType === "task" ? "selected" : ""}>Task Completion</option>
      </select>
    </div>
    <div id="reqEntrySection" style="display:${defaultType === "entry" ? "block" : "none"};">
      <div class="form-group">
        <label>Category</label>
        <select id="reqCat">
          ${cats.map((c) => `<option value="${c}">${CAT_ICONS[c]} ${c}</option>`).join("")}
        </select>
      </div>
    </div>
    <div id="reqTaskSection" style="display:${defaultType === "task" ? "block" : "none"};">
      <div class="form-group">
        <label>Select Task</label>
        ${
          approvalTasks.length === 0
            ? `<div style="background:#fff0f0;border:1px solid #fecaca;border-radius:8px;padding:10px 13px;font-size:13px;color:#e53e3e;">
               No approval-required tasks pending. Only tasks with "Approval Required" can be requested.
             </div>`
            : `<select id="reqTask">
               ${approvalTasks.map((t) => `<option value="${t.id}" ${t.id === preTaskId ? "selected" : ""}>${sanitize(t.title)}</option>`).join("")}
             </select>`
        }
      </div>
    </div>
    <div class="form-group">
      <label>Reason / Note <span style="color:var(--text3);">(optional)</span></label>
      <textarea id="reqNote" rows="2" placeholder="e.g. Contributor was unavailable today" maxlength="500"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitRequest()">Send Request</button>
    </div>`);
}

function toggleReqType() {
  const type = document.getElementById("reqType").value;
  document.getElementById("reqEntrySection").style.display =
    type === "entry" ? "block" : "none";
  document.getElementById("reqTaskSection").style.display =
    type === "task" ? "block" : "none";
}

async function submitRequest() {
  const type = document.getElementById("reqType").value;
  const note = document.getElementById("reqNote")?.value.trim() || "";
  let reqData = {
    id: "req-" + Date.now(),
    type,
    internId: currentUser.id,
    note,
    date: today(),
    status: "pending",
    read: false,
  };
  if (type === "entry") {
    reqData.category = document.getElementById("reqCat").value;
    reqData.msg = `📨 Entry Request: "${reqData.category}" from ${currentUser.name}`;
  } else {
    const taskEl = document.getElementById("reqTask");
    const taskId = taskEl?.value;
    if (!taskId) {
      showToast("No approval-required tasks available", "error");
      return;
    }
    // Guard: no duplicate pending request for same task
    const alreadyPending = (db.pendingRequests || []).some(
      (r) => r.taskId === taskId && r.status === "pending",
    );
    if (alreadyPending) {
      showToast("A request for this task is already pending", "error");
      return;
    }
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) {
      showToast("Task not found", "error");
      return;
    }
    reqData.taskId = taskId;
    reqData.taskTitle = task.title;
    reqData.msg = `📨 Task Completion Request: "${task.title}" from ${currentUser.name}`;
  }
  if (!db.pendingRequests) db.pendingRequests = [];
  db.pendingRequests.unshift(reqData);
  // Push to adminNotifications so the bell lights up
  db.adminNotifications.unshift({
    id: "an-req-" + Date.now(),
    msg: reqData.msg,
    read: false,
    date: today(),
    isRequest: true,
    requestId: reqData.id,
  });
  closeModal();
  await saveAndRefresh(
    "Request sent! Waiting for admin approval.",
    "internDashboard",
  );
}

async function approveRequest(reqId) {
  const req = (db.pendingRequests || []).find((r) => r.id === reqId);
  if (!req) return;
  req.status = "approved";
  const iid = req.internId;
  const s = db.submissions[iid] || {};
  if (req.type === "entry") {
    const catKey = CAT_KEYS[req.category];
    const td = today();
    const dk = td + "-" + catKey;
    s.dailyCounts = s.dailyCounts || {};
    s[catKey] = (s[catKey] || 0) + 1;
    // BUG-16 FIX: increment dailyCounts so subsequent real submissions hit the limit correctly
    s.dailyCounts[dk] = (s.dailyCounts[dk] || 0) + 1;
    const pts = (db.catPoints || DEF_POINTS)[req.category] || 5;
    s.points = (s.points || 0) + pts;
    db.submissions[iid] = s;
    if (!db.notifications[iid]) db.notifications[iid] = [];
    db.notifications[iid].unshift({
      id: "n-" + Date.now(),
      msg: `✅ Your entry request for "${req.category}" was approved! +${pts} pts`,
      type: "request",
      read: false,
      date: today(),
    });
  } else if (req.type === "task") {
    const key = req.taskId + "-" + iid;
    if (!db.taskCompletions[key]?.done) {
      db.taskCompletions[key] = { done: true };
      const task = db.tasks.find((t) => t.id === req.taskId);
      if (task?.points) {
        s.points = (s.points || 0) + task.points;
        db.submissions[iid] = s;
      }
      if (!db.notifications[iid]) db.notifications[iid] = [];
      db.notifications[iid].unshift({
        id: "n-" + Date.now(),
        msg: `✅ Your task completion request for "${sanitize(req.taskTitle)}" was approved!`,
        type: "request",
        read: false,
        date: today(),
      });
    }
  }
  const an = db.adminNotifications.find((n) => n.requestId === reqId);
  if (an) an.read = true;
  await saveAndRefresh("Request approved!", "adminNotifs");
}

async function denyRequest(reqId) {
  const req = (db.pendingRequests || []).find((r) => r.id === reqId);
  if (!req) return;
  req.status = "denied";
  const iid = req.internId;
  if (!db.notifications[iid]) db.notifications[iid] = [];
  db.notifications[iid].unshift({
    id: "n-" + Date.now(),
    msg: `❌ Your request for "${req.type === "entry" ? req.category : req.taskTitle}" was denied by admin.`,
    type: "request",
    read: false,
    date: today(),
  });
  const an = db.adminNotifications.find((n) => n.requestId === reqId);
  if (an) an.read = true;
  await saveAndRefresh("Request denied", "adminNotifs");
}

// ╔══════════════════════════════════════════════════╗
// ║              INTERN TASKS (KANBAN)               ║
// ╚══════════════════════════════════════════════════╝
function isTaskDone(tid, iid) {
  return db.taskCompletions?.[tid + "-" + iid]?.done || false;
}

// Sort tasks newest-first
function sortNewest(tasks) {
  return [...tasks].sort((a, b) => {
    const ta =
      a.createdAt || (a.createdDate ? new Date(a.createdDate).getTime() : 0);
    const tb =
      b.createdAt || (b.createdDate ? new Date(b.createdDate).getTime() : 0);
    return tb - ta;
  });
}

function renderInternTasks(ca) {
  const id = currentUser.id;
  const filter = window.taskFilter || "Today";
  const td = today();
  let all = db.tasks.filter(
    (t) =>
      (t.assignedTo === id || (t.isPersonal && t.createdBy === id)) &&
      !t.isTemplate,
  );
  all = sortNewest(all);
  let tasks = all;
  if (filter === "Today")
    tasks = all.filter(
      (t) => t.dueDate === td || t.createdDate === td || t.instanceDate === td,
    );
  else if (filter === "Completed")
    tasks = all.filter((t) => isTaskDone(t.id, id));
  else if (filter === "Pending")
    tasks = all.filter((t) => !isTaskDone(t.id, id));
  const unread = (db.notifications?.[id] || []).filter((n) => !n.read);
  // BUG-05 FIX: sanitize all notification messages before putting in innerHTML
  const ribbon = unread.length
    ? (() => {
        const taskNotifs = unread.filter(
          (n) => n.type === "task" || n.type === "repeat",
        );
        const otherNotifs = unread.filter(
          (n) => n.type !== "task" && n.type !== "repeat",
        );
        const items = [...taskNotifs, ...otherNotifs].slice(0, 5);
        return `<div class="notif-ribbon" style="flex-direction:column;align-items:stretch;gap:6px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-weight:700;">🔔 ${unread.length} new notification(s)</span>
        <button class="notif-ribbon-dismiss" onclick="dismissRibbon(${id})">✕ Dismiss all</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;">
        ${items.map((n) => `<div style="font-size:12px;padding:4px 8px;background:rgba(255,255,255,.15);border-radius:5px;">• ${sanitize(n.msg)}</div>`).join("")}
        ${unread.length > 5 ? `<div style="font-size:11px;opacity:.8;">+ ${unread.length - 5} more…</div>` : ""}
      </div>
    </div>`;
      })()
    : "";

  // BUG-23 FIX: friendly empty state when no tasks exist at all
  const totalTasks = db.tasks.filter(
    (t) =>
      (t.assignedTo === id || (t.isPersonal && t.createdBy === id)) &&
      !t.isTemplate,
  ).length;
  const emptyAllState =
    totalTasks === 0
      ? `
    <div style="text-align:center;padding:48px 20px;background:#fff;border:1px solid var(--border);border-radius:12px;margin-bottom:14px;">
      <div style="font-size:48px;margin-bottom:12px;">📋</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;color:var(--text);">No tasks yet!</div>
      <div style="font-size:13px;color:var(--text2);max-width:280px;margin:0 auto;">No tasks have been assigned to you. Check back soon, or add your own custom tasks below.</div>
      <button class="btn btn-primary" onclick="openCreateCustomTask()" style="margin-top:16px;">+ Add Custom Task</button>
    </div>`
      : "";

  ca.innerHTML = `<div>
    <div class="page-title">Tasks</div>
    <div class="page-sub">Your assignments and custom tasks</div>
    ${ribbon}
    <div class="task-filter-bar">
      ${["Today", "All", "Completed", "Pending"]
        .map(
          (f) =>
            `<button class="task-filter-btn ${filter === f ? "active" : ""}" onclick="setTF('${f}')">${f}</button>`,
        )
        .join("")}
      <button class="btn btn-secondary btn-sm" style="margin-left:auto;" onclick="openCreateCustomTask()">+ Add Custom Task</button>
    </div>
    ${emptyAllState}
    <div class="kanban-board">
      ${["Office", "Academic", "Personal"].map((cat) => renderKanbanCol(cat, tasks, id)).join("")}
    </div>
  </div>`;
}

// BUG-15 FIX: Dismiss ribbon optimistically hides it immediately, then saves in background
async function dismissRibbon(id) {
  (db.notifications[id] || []).forEach((n) => (n.read = true));
  updateBadges();
  renderInternTasks(document.getElementById("contentArea"));
  try {
    await saveDB();
    showStatus("✓ Notifications cleared");
  } catch (e) {
    showToast("Could not save — please sync", "error");
  }
}

async function markNotifsRead(id) {
  (db.notifications[id] || []).forEach((n) => (n.read = true));
  await saveDB();
  updateBadges();
  renderInternTasks(document.getElementById("contentArea"));
}

function renderKanbanCol(cat, tasks, id) {
  const cls = cat.toLowerCase();
  const colTasks = tasks.filter(
    (t) => (t.category || "Personal").toLowerCase() === cls,
  );
  return `<div class="kanban-col">
    <div class="kanban-header ${cls}"><span>${cat}</span><span style="font-size:11px;opacity:.8;">${colTasks.length}</span></div>
    <div class="kanban-tasks">
      ${
        colTasks.length === 0
          ? `<div style="padding:14px;text-align:center;color:var(--text3);font-size:12px;">No tasks</div>`
          : colTasks.map((t) => renderKanbanCard(t, id)).join("")
      }
    </div>
  </div>`;
}

function renderKanbanCard(task, id) {
  const done = isTaskDone(task.id, id);
  // BUG-05 FIX: sanitize all user-generated content before innerHTML
  const safeTitle = sanitize(task.title);
  const pts = task.points ? `<span class="kc-pts">⭐${task.points}</span>` : "";
  const due = task.dueDate
    ? `<span class="badge badge-orange" style="font-size:10px;">${sanitize(task.dueDate)}</span>`
    : "";
  const rep = task.templateId
    ? `<span style="font-size:10px;color:var(--text3);">🔁</span>`
    : "";
  let circle;
  if (done) circle = `<div class="kc-circle done">✓</div>`;
  else if (task.approvalRequired && !task.isPersonal)
    circle = `<div class="kc-circle approval" onclick="event.stopPropagation();openApprovalDlg('${task.id}','${id}')" title="Needs approval">+</div>`;
  else
    circle = `<div class="kc-circle" onclick="event.stopPropagation();completeTask('${task.id}','${id}')" onmouseenter="this.textContent='✓'" onmouseleave="this.textContent=''" title="Complete"></div>`;

  const actions =
    task.isPersonal && task.createdBy == id
      ? `<button class="kc-action kc-del" onclick="event.stopPropagation();deletePersonalTask('${task.id}')" title="Delete">🗑</button>`
      : "";

  return `<div class="kanban-card ${done ? "completed" : ""}" onclick="openTaskDetail('${task.id}')">
    ${circle}
    <div class="kc-info">
      <div class="kc-title">${done ? "<s>" + safeTitle + "</s>" : safeTitle}</div>
      <div class="kc-meta">${pts}${due}${rep}</div>
    </div>
    ${actions}
  </div>`;
}

function setTF(f) {
  window.taskFilter = f;
  navigateTo("internTasks");
}

async function deletePersonalTask(tid) {
  const task = db.tasks.find((t) => t.id === tid);
  if (!task || !task.isPersonal || task.createdBy != currentUser.id) {
    showToast("You can only delete your own tasks", "error");
    return;
  }
  db.tasks = db.tasks.filter((t) => t.id !== tid);
  // Also remove from template children
  db.tasks = db.tasks.filter((t) => t.templateId !== tid);
  await saveAndRefresh("Task deleted", "internTasks");
}

function openTaskDetail(tid) {
  const task = db.tasks.find((t) => t.id == tid);
  if (!task) return;
  // BUG-12 FIX: interns can only view their own tasks
  if (currentRole === "intern") {
    const isOwned =
      task.assignedTo === currentUser.id ||
      (task.isPersonal && task.createdBy == currentUser.id);
    if (!isOwned) {
      showToast("Access denied", "error");
      return;
    }
  }
  const iid = currentRole === "intern" ? currentUser.id : task.assignedTo;
  const done = isTaskDone(task.id, iid);
  let internActions = "";
  if (currentRole === "intern") {
    if (task.isPersonal && task.createdBy == currentUser.id)
      internActions = `<button class="btn btn-danger" onclick="closeModal();deletePersonalTask('${sanitize(task.id)}')">🗑 Delete Task</button>`;
    else if (!done && !task.isPersonal)
      internActions = `<button class="btn btn-secondary" onclick="closeModal();openSendRequest('${sanitize(task.id)}')">📨 Request Approval</button>`;
  }
  openModal(`<div class="modal-title">${sanitize(task.title)}</div>
    <div style="background:var(--surface2);border-radius:8px;padding:12px;font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:12px;">${sanitize(task.description || "") || "<em>No description provided.</em>"}</div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">
      <span class="tag tag-${(task.category || "personal").toLowerCase()}">${sanitize(task.category || "Personal")}</span>
      ${task.points ? `<span class="badge badge-orange">+${task.points} pts</span>` : ""}
      ${task.dueDate ? `<span class="badge badge-blue">Due: ${sanitize(task.dueDate)}</span>` : ""}
      ${task.templateId ? `<span class="badge badge-gray">🔁 Recurring</span>` : task.repeat ? `<span class="badge badge-gray">🔁 ${sanitize(repeatLabel(task.repeat))}</span>` : ""}
      ${task.approvalRequired ? `<span class="badge badge-green">Approval Required</span>` : ""}
      ${done ? `<span class="badge badge-green">✓ Completed</span>` : ""}
    </div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">Assigned to: <strong>${sanitize(intern?.name || "Unknown")}</strong></div>
    ${task.isTemplate ? `<div style="font-size:11px;color:var(--text3);margin-bottom:2px;">Schedule: <strong>${sanitize(repeatLabel(task.repeat))}</strong></div>` : ""}
    ${task.isTemplate ? `<div style="font-size:11px;color:var(--text3);">Last auto-generated: ${sanitize(task.lastGenerated || "Never")}</div>` : ""}
    ${instancesHtml}
    <div class="modal-actions" style="margin-top:14px;">
      ${pauseBtn}
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="closeModal();openEditTask('${task.id}')">✏️ Edit</button>
    </div>`);
}

// BUG-10 FIX: Task completion now has a 5-second undo window before saving to Firebase.
async function completeTask(tid, iid) {
  const task = db.tasks.find((t) => t.id == tid);
  if (!task) return;
  const key = tid + "-" + iid;
  if (db.taskCompletions[key]?.done) return;

  // Apply completion optimistically in memory
  db.taskCompletions[key] = { done: true };
  const pts = task.points || 0;
  if (pts) db.submissions[iid].points = (db.submissions[iid].points || 0) + pts;
  renderInternTasks(document.getElementById("contentArea"));

  // Cancel any previous undo that wasn't committed
  if (_undoTimer) clearTimeout(_undoTimer);

  showUndoToast(
    `Task completed! +${pts} pts`,
    () => {
      // ─── UNDO ───
      delete db.taskCompletions[key];
      if (pts)
        db.submissions[iid].points = Math.max(
          0,
          (db.submissions[iid].points || 0) - pts,
        );
      renderInternTasks(document.getElementById("contentArea"));
      updateBadges();
    },
    async () => {
      // ─── COMMIT ───
      if (!task.isPersonal) {
        const intern = INTERNS.find((i) => i.id == iid);
        db.adminNotifications.unshift({
          id: "an-" + Date.now(),
          msg: `${sanitize(intern?.name || "Intern")} completed: "${sanitize(task.title)}"`,
          read: false,
          date: today(),
          internId: iid,
          taskId: tid,
        });
      }
      try {
        await saveDB();
        showStatus("✓ Saved!");
        updateBadges();
      } catch (e) {
        showToast("Save failed — please sync.", "error");
      }
    },
  );
}

function openApprovalDlg(tid, iid) {
  const task = db.tasks.find((t) => t.id == tid);
  const ac = task.approvalContribId
    ? db.contributors.find((c) => c.id === task.approvalContribId)
    : null;
  openModal(`<div class="modal-title">🔐 Request Approval</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:10px;">Task: <strong style="color:var(--text);">${task.title}</strong></div>
    ${ac ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:9px 13px;font-size:12px;margin-bottom:12px;">Required contributor: <strong style="color:#1d4ed8;">${ac.name}</strong></div>` : ""}
    <div class="form-group"><label>Contributor Code</label><input type="password" id="approvalCode" placeholder="Enter code" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitApproval('${tid}','${iid}')">Submit</button>
    </div>`);
}

async function submitApproval(tid, iid) {
  const code = document.getElementById("approvalCode").value.trim();
  const task = db.tasks.find((t) => t.id == tid);
  const contrib = db.contributors.find((c) => c.code === code);
  if (!contrib) {
    showToast("Invalid code", "error");
    return;
  }
  if (task.approvalContribId && contrib.id !== task.approvalContribId) {
    const ac = db.contributors.find((c) => c.id === task.approvalContribId);
    showToast(
      "Wrong contributor. Required: " + (ac?.name || "assigned contributor"),
      "error",
    );
    return;
  }
  const key = tid + "-" + iid;
  db.taskCompletions[key] = { done: true };
  if (task.points)
    db.submissions[iid].points =
      (db.submissions[iid].points || 0) + task.points;
  if (!task.isPersonal) {
    const intern = INTERNS.find((i) => i.id == iid);
    db.adminNotifications.unshift({
      id: "an-" + Date.now(),
      msg: `${intern?.name || "Intern"} completed (approved): "${task.title}"`,
      read: false,
      date: today(),
      internId: iid,
      taskId: tid,
    });
  }
  closeModal();
  await saveAndRefresh(
    "Approved & completed! +" + (task.points || 0) + " pts",
    "internTasks",
  );
}

function openCreateCustomTask() {
  _repeatConfig = null;
  openModal(`<div class="modal-title">+ Add Custom Task</div>
    <div class="form-group"><label>Title</label><input type="text" id="ptTitle" placeholder="Task title"></div>
    <div class="form-group"><label>Description</label><textarea id="ptDesc" placeholder="Description (optional)"></textarea></div>
    <div class="form-group">
      <label>Category</label>
      <select id="ptCat"><option value="Office">Office</option><option value="Academic">Academic</option><option value="Personal" selected>Personal</option></select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
      <div class="form-group" style="margin-bottom:0;"><label>Due Date (optional)</label><input type="date" id="ptDue"></div>
      <div class="form-group" style="margin-bottom:0;"><label>Repeat</label>
        <button type="button" class="btn btn-secondary btn-full" onclick="openRepeatDlg('pt')"><span id="ptRepLabel">None</span> 🔁</button>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveCustomTask()">Create</button>
    </div>`);
}

async function saveCustomTask() {
  const title = document.getElementById("ptTitle").value.trim();
  if (!title) {
    showToast("Title required", "error");
    return;
  }
  const hasRepeat = !!_repeatConfig;
  db.tasks.unshift({
    id: "pt-" + Date.now(),
    title,
    description: document.getElementById("ptDesc").value,
    dueDate: document.getElementById("ptDue").value,
    repeat: _repeatConfig,
    category: document.getElementById("ptCat").value,
    isPersonal: true,
    createdBy: currentUser.id,
    assignedTo: currentUser.id,
    createdDate: today(),
    createdAt: Date.now(),
    points: 0,
    approvalRequired: false,
    isTemplate: hasRepeat,
    lastGenerated: hasRepeat ? null : undefined,
  });
  closeModal();
  _repeatConfig = null;
  // Generate today's instance immediately if this is a repeating task
  if (hasRepeat) processRepeatTasks();
  await saveAndRefresh("Custom task created!", "internTasks");
}

// ╔══════════════════════════════════════════════════╗
// ║              INTERN NOTIFICATIONS                ║
// ╚══════════════════════════════════════════════════╝
function renderInternNotifs(ca) {
  const all = db.notifications?.[currentUser.id] || [];
  const showAll = window.notifShowAll || false;
  const visible = showAll ? all : all.filter((n) => !n.read);
  updateBadges();
  ca.innerHTML = `<div>
    <div class="page-title">Notifications</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div class="page-sub" style="margin:0;">${visible.length} notification(s) ${showAll ? "(all)" : "(unread)"}</div>
      <div style="display:flex;gap:6px;align-items:center;">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;cursor:pointer;">
          <input type="checkbox" ${showAll ? "checked" : ""} onchange="window.notifShowAll=this.checked;renderInternNotifs(document.getElementById('contentArea'))"> Show read
        </label>
        ${visible.length > 0 ? `<button class="btn btn-secondary btn-sm" onclick="markAllNotifsRead()">Mark all read</button>` : ""}
      </div>
    </div>
    ${
      visible.length === 0
        ? `<div style="text-align:center;padding:40px;color:var(--text2);">${all.length > 0 ? "All caught up! No unread notifications." : "No notifications yet."}</div>`
        : visible
            .map(
              (n, idx) => `
          <div class="complaint-card" style="${n.read ? "opacity:.55;" : ""}">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
              <div style="flex:1;">
                <div style="font-weight:600;">${n.read ? "" : "🔔 "}${n.msg}</div>
                <div style="font-size:11px;color:var(--text2);margin-top:3px;">${n.date}</div>
              </div>
              ${!n.read ? `<button class="btn btn-secondary btn-sm" style="flex-shrink:0;" onclick="markOneNotifRead(${all.indexOf(n)})">✓ Read</button>` : '<span style="font-size:11px;color:var(--text3);">Read</span>'}
            </div>
          </div>`,
            )
            .join("")
    }
    <div style="margin-top:12px;"><button class="btn btn-secondary" onclick="navigateTo('internTasks')">← Back to Tasks</button></div>
  </div>`;
}

async function markOneNotifRead(idx) {
  const notifs = db.notifications[currentUser.id];
  if (notifs && notifs[idx]) {
    notifs[idx].read = true;
    await saveDB();
  }
  updateBadges();
  renderInternNotifs(document.getElementById("contentArea"));
}

async function markAllNotifsRead() {
  (db.notifications[currentUser.id] || []).forEach((n) => (n.read = true));
  await saveDB();
  updateBadges();
  renderInternNotifs(document.getElementById("contentArea"));
}

// ╔══════════════════════════════════════════════════╗
// ║              INTERN COMPLAINTS                   ║
// ╚══════════════════════════════════════════════════╝
function renderInternComplaints(ca) {
  const mine = (db.complaints || []).filter((c) => c.from === currentUser.id);
  ca.innerHTML = `<div>
    <div class="page-title">Complaints</div>
    <div class="page-sub">Submit and track your complaints</div>
    <button class="btn btn-primary" style="margin-bottom:16px;" onclick="openComplaintModal()">+ New Complaint</button>
    <div style="padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;font-size:12px;color:#166534;margin-bottom:16px;">🔒 Complaints are private and seen only by Admin.</div>
    ${
      mine.length === 0
        ? `<div style="text-align:center;padding:28px;color:var(--text2);font-size:13px;">You haven't submitted any complaints yet.</div>`
        : `<div class="section-title" style="margin-bottom:8px;">Your Submitted Complaints</div>
         ${mine
           .map((c) => {
             // BUG-05 FIX: sanitize complaint content before innerHTML
             const against = INTERNS.find((i) => i.id === c.against);
             return `<div class="complaint-card">
             <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
               <div style="font-weight:700;">${sanitize(c.subject)}</div>
               <div style="display:flex;gap:5px;align-items:center;">
                 ${c.done ? '<span class="badge badge-green">✓ Resolved</span>' : '<span class="badge badge-orange">Open</span>'}
                 <span class="badge badge-red">Against: ${sanitize(against?.name || "?")}</span>
               </div>
             </div>
             <div style="font-size:13px;color:var(--text2);">${sanitize(c.desc || "")}</div>
             <div style="font-size:11px;color:var(--text2);margin-top:5px;">${sanitize(c.date || "")}</div>
           </div>`;
           })
           .join("")}`
    }
  </div>`;
}

function openComplaintModal() {
  // BUG-28 FIX: character limits on subject (200) and description (1000) with live counters
  const interns = INTERNS.filter((i) => i.id !== 99 && i.id !== currentUser.id);
  openModal(`<div class="modal-title">Submit Complaint</div>
    <div class="form-group">
      <label>Against *</label>
      <select id="cAgainst"><option value="">Select intern...</option>${interns.map((i) => `<option value="${i.id}">${sanitize(i.name)}</option>`).join("")}</select>
    </div>
    <div class="form-group">
      <label>Subject * <span id="subjectCount" style="font-size:10px;color:var(--text3);font-weight:400;">0/200</span></label>
      <input type="text" id="cSubject" placeholder="Brief subject line" maxlength="200" oninput="document.getElementById('subjectCount').textContent=this.value.length+'/200'">
    </div>
    <div class="form-group">
      <label>Description <span id="descCount" style="font-size:10px;color:var(--text3);font-weight:400;">0/1000</span></label>
      <textarea id="cDesc" placeholder="Describe the issue in detail..." maxlength="1000" oninput="document.getElementById('descCount').textContent=this.value.length+'/1000'"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitComplaint()">Submit</button>
    </div>`);
}

async function submitComplaint() {
  const against = document.getElementById("cAgainst").value;
  const subject = document.getElementById("cSubject").value.trim();
  const desc = document.getElementById("cDesc").value.trim();
  if (!against) {
    showToast("Please select an intern to file against", "error");
    return;
  }
  if (!subject) {
    showToast("Subject is required", "error");
    return;
  }
  db.complaints.push({
    id: "c-" + Date.now(),
    from: currentUser.id,
    against: parseInt(against),
    subject,
    desc,
    date: today(),
    read: false,
  });
  closeModal();
  await saveAndRefresh("Complaint submitted", "internComplaints");
}

// ╔══════════════════════════════════════════════════╗
// ║              ADMIN DASHBOARD                     ║
// ╚══════════════════════════════════════════════════╝
function renderAdminDashboard(ca) {
  const interns = INTERNS.filter((i) => i.id !== 99);
  const sid = window.adminSelectedIntern || interns[0].id;
  const intern = interns.find((i) => i.id === sid);
  const s = db.submissions[sid] || {};
  const pts = s.points || 0;
  const ob = getObedience(sid);
  const { total: taskCount, done: doneCount } = getObedienceCounts(sid);
  ca.innerHTML = `<div>
    <div class="page-title">Admin Dashboard</div>
    <div class="page-sub">Monitor intern performance</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <label style="font-size:12px;font-weight:600;color:var(--text2);">Viewing:</label>
      <select onchange="selectAdminIntern(this.value)" style="border:1.5px solid var(--border);border-radius:8px;padding:7px 13px;font-size:14px;font-family:inherit;color:var(--text);outline:none;background:#fff;">
        ${interns.map((i) => `<option value="${i.id}" ${i.id === sid ? "selected" : ""}>${sanitize(i.name)}</option>`).join("")}
      </select>
    </div>
    <div class="card" style="margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;">${sanitize(intern.name[0])}</div>
        <div style="flex:1;"><div style="font-weight:700;font-size:15px;">${sanitize(intern.name)}</div><div style="color:var(--text2);font-size:12px;">@${sanitize(intern.username)}</div></div>
        <!-- BUG-24 FIX: toLocaleString for thousands separator -->
        <div style="text-align:right;"><div style="font-size:11px;color:var(--text2);font-weight:600;text-transform:uppercase;">Points</div><div style="font-size:26px;font-weight:800;color:var(--accent);">${pts.toLocaleString()}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-bottom:10px;">
        ${[
          ["🎓", "College", s.college || 0],
          ["🏢", "Office", s.office || 0],
          ["🚀", "Projects", s.project || 0],
          ["🐛", "Bugs", s.bugs || 0],
          ["💡", "Suggestions", s.suggestions || 0],
        ]
          .map(
            ([ic, lb, vl]) =>
              `<div class="stat-card"><div class="stat-emoji">${ic}</div><div class="stat-label">${lb}</div><div class="stat-value" style="font-size:20px;">${vl.toLocaleString()}</div></div>`,
          )
          .join("")}
      </div>
      <div><div style="font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;margin-bottom:3px;">Obedience: ${ob}% — ${doneCount}/${taskCount} tasks (last 30 days)</div><div class="obedience-bar"><div class="obedience-fill" style="width:${ob}%"></div></div></div>
    </div>
    <div class="section-title">Task Overview (Last 30 Days)</div>
    ${renderAdminTaskOverview(sid)}

    ${renderRecurringDashboard()}
  </div>`;
}

// ── Recurring Tasks quick-overview panel shown at the bottom of Admin Dashboard ──
function renderRecurringDashboard() {
  const templates = db.tasks.filter((t) => t.isTemplate && t.repeat);
  if (templates.length === 0) return "";
  const rows = templates
    .map((tmpl) => {
      const intern = INTERNS.find((i) => i.id === tmpl.assignedTo);
      const insts = db.tasks.filter((t) => t.templateId === tmpl.id);
      const done = insts.filter((t) =>
        isTaskDone(t.id, tmpl.assignedTo),
      ).length;
      const rate = insts.length ? Math.round((done / insts.length) * 100) : 0;
      const barColor =
        rate >= 75 ? "#27ae60" : rate >= 40 ? "#f59e0b" : "#e53e3e";
      const pausedHtml = tmpl.paused
        ? '<span class="badge badge-red" style="font-size:9px;margin-left:4px;">⏸ Paused</span>'
        : "";
      return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="font-weight:700;font-size:13px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitize(tmpl.title)}${pausedHtml}</div>
        <div style="font-size:11px;color:var(--text2);white-space:nowrap;">${sanitize(intern?.name || "?")}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;background:var(--border);border-radius:3px;height:5px;overflow:hidden;">
          <div style="height:100%;width:${rate}%;background:${barColor};border-radius:3px;transition:width .4s;"></div>
        </div>
        <div style="font-size:11px;font-weight:700;color:${barColor};white-space:nowrap;">${rate}%</div>
        <div style="font-size:11px;color:var(--text3);white-space:nowrap;">${insts.length} instances</div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:11px;color:var(--text2);">🔁 ${sanitize(repeatLabel(tmpl.repeat))}</span>
        <div style="display:flex;gap:5px;">
          <button class="btn btn-secondary btn-sm" onclick="togglePauseTemplate('${tmpl.id}')" style="font-size:11px;padding:3px 8px;">${tmpl.paused ? "▶ Resume" : "⏸ Pause"}</button>
          <button class="btn btn-primary btn-sm" onclick="openAdminTaskDetail('${tmpl.id}')" style="font-size:11px;padding:3px 8px;">Details</button>
        </div>
      </div>
    </div>`;
    })
    .join("");
  return `<div style="margin-top:18px;">
    <div class="section-title" style="margin-bottom:8px;">🔁 Recurring Tasks (${templates.length})</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;">
      ${rows}
    </div>
  </div>`;
}

function renderAdminTaskOverview(sid) {
  const filter = window.adminTaskFilter || "Sent";
  let tasks = db.tasks.filter(
    (t) => t.assignedTo === sid && !t.isPersonal && !t.isTemplate,
  );
  tasks = sortNewest(tasks);
  const filtered =
    filter === "Completed"
      ? tasks.filter((t) => isTaskDone(t.id, sid))
      : tasks.filter((t) => !isTaskDone(t.id, sid));
  return `<div style="display:flex;gap:5px;margin-bottom:9px;">
    ${["Sent", "Completed"]
      .map(
        (f) =>
          `<button class="task-filter-btn ${(window.adminTaskFilter || "Sent") === f ? "active" : ""}" onclick="setATF('${f}')">${f}</button>`,
      )
      .join("")}
  </div>
  ${
    filtered.length === 0
      ? `<div style="color:var(--text2);text-align:center;padding:18px;">No tasks.</div>`
      : `<div style="display:flex;flex-direction:column;gap:5px;">${filtered
          .map((t) => {
            const done = isTaskDone(t.id, sid);
            return `<div class="kanban-card">
        <div class="kc-circle ${done ? "done" : ""}">${done ? "✓" : ""}</div>
        <div class="kc-info"><div class="kc-title">${t.title}</div>
          <div class="kc-meta"><span class="tag tag-${(t.category || "office").toLowerCase()}">${t.category}</span>${t.points ? `<span class="kc-pts">⭐${t.points}</span>` : ""}</div>
        </div></div>`;
          })
          .join("")}</div>`
  }`;
}

function selectAdminIntern(id) {
  window.adminSelectedIntern = parseInt(id);
  navigateTo("adminDashboard");
}
function setATF(f) {
  window.adminTaskFilter = f;
  navigateTo("adminDashboard");
}

// ╔══════════════════════════════════════════════════╗
// ║              ADMIN MANAGE TASKS                  ║
// ╚══════════════════════════════════════════════════╝
function renderAdminTasks(ca) {
  const interns = INTERNS.filter((i) => i.id !== 99);
  // Only show templates and one-off tasks — hide instances (they clutter the table).
  // A daily task for 30 days would otherwise produce 31 rows (1 template + 30 instances).
  const allT = db.tasks.filter((t) => !t.isPersonal && !t.templateId);
  const fa = window.atFilterAssignee || "";
  const fc = window.atFilterCat || "";
  const fs = window.atFilterStatus || "All"; // All / Pending / Completed
  let filtered = allT.filter(
    (t) =>
      (!fa || t.assignedTo == fa) &&
      (!fc || (t.category || "").toLowerCase() === fc.toLowerCase()),
  );
  filtered = sortNewest(filtered);
  if (fs === "Pending")
    filtered = filtered.filter(
      (t) => !t.isTemplate && !isTaskDone(t.id, t.assignedTo),
    );
  if (fs === "Completed")
    filtered = filtered.filter((t) => isTaskDone(t.id, t.assignedTo));
  if (fs === "🔁 Recurring") filtered = filtered.filter((t) => t.isTemplate);
  ca.innerHTML = `<div>
    <div class="page-title">Manage Tasks</div>
    <div class="page-sub">Create and assign tasks to interns</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div class="admin-filter-row">
        <label>Assignee:</label>
        <select onchange="setATaskFilter('a',this.value)">
          <option value="">All Interns</option>
          ${interns.map((i) => `<option value="${i.id}" ${fa == i.id ? "selected" : ""}>${sanitize(i.name)}</option>`).join("")}
        </select>
        <label>Category:</label>
        <select onchange="setATaskFilter('c',this.value)">
          <option value="">All</option>
          ${["Office", "Academic", "Personal"].map((c) => `<option value="${c}" ${fc === c ? "selected" : ""}>${c}</option>`).join("")}
        </select>
        <label>Status:</label>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${["All", "Pending", "Completed", "🔁 Recurring"].map((s) => `<button class="task-filter-btn${fs === s ? " active" : ""}" onclick="setATaskFilter('s','${s}')">${s}</button>`).join("")}
        </div>
      </div>
      <button class="btn btn-primary" onclick="openCreateTask()">+ Create Task</button>
    </div>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:9px 14px;font-size:12px;color:#1d4ed8;margin-bottom:12px;">
      💡 <strong>Note:</strong> Task categories (Office / Academic / Personal) are separate from the Entry system (College Attendance, Projects, etc.) — they organise the Kanban board only.
    </div>
    <div class="card table-wrap" style="padding:0;overflow-x:auto;">
      <table class="table">
        <thead><tr><th>Title</th><th>Description</th><th>Assigned To</th><th>Category</th><th>Points</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>
          ${filtered.length === 0 ? `<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:20px;">No tasks found. <span style="color:var(--text3);font-size:12px;">(Filters affect view only — tasks still exist)</span></td></tr>` : ""}
          ${filtered
            .map((t) => {
              const intern = INTERNS.find((i) => i.id === t.assignedTo);
              const done = isTaskDone(t.id, t.assignedTo);
              const instCount = t.isTemplate
                ? db.tasks.filter((x) => x.templateId === t.id).length
                : 0;
              const pausedBadge =
                t.isTemplate && t.paused
                  ? `<span class="badge badge-red" style="font-size:9px;">⏸ Paused</span>`
                  : "";
              const repBadge = t.isTemplate
                ? `<span class="badge badge-gray" style="font-size:9px;">🔁 ${sanitize(repeatLabel(t.repeat))} · ${instCount} instance${instCount !== 1 ? "s" : ""}</span>`
                : "";
              return `<tr onclick="openAdminTaskDetail('${t.id}')" style="cursor:pointer;">
              <td style="font-weight:600;">${sanitize(t.title)} ${repBadge}${pausedBadge}</td>
              <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text2);">${sanitize(t.description || "—")}</td>
              <td>${sanitize(intern?.name || "—")}</td>
              <td><span class="tag tag-${(t.category || "office").toLowerCase()}">${sanitize(t.category || "")}</span></td>
              <td style="font-weight:700;color:var(--accent);">+${t.points || 0}</td>
              <td style="color:var(--text2);">${sanitize(t.dueDate || "—")}</td>
              <td>${done ? '<span class="badge badge-green">Done</span>' : t.isTemplate ? '<span class="badge badge-gray">Template</span>' : '<span class="badge badge-orange">Pending</span>'}</td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  </div>`;
}

function setATaskFilter(type, val) {
  if (type === "a") window.atFilterAssignee = val;
  else if (type === "c") window.atFilterCat = val;
  else if (type === "s") window.atFilterStatus = val;
  navigateTo("adminTasks");
}

function openAdminTaskDetail(tid) {
  const task = db.tasks.find((t) => t.id == tid);
  if (!task) return;
  const intern = INTERNS.find((i) => i.id === task.assignedTo);
  const done = isTaskDone(task.id, task.assignedTo);

  // For recurring templates: build a recent instance list (last 14)
  let instancesHtml = "";
  if (task.isTemplate) {
    const instances = db.tasks
      .filter((t) => t.templateId === task.id)
      .sort((a, b) =>
        (b.instanceDate || "").localeCompare(a.instanceDate || ""),
      );
    const recent = instances.slice(0, 14);
    const totalDone = instances.filter((t) =>
      isTaskDone(t.id, task.assignedTo),
    ).length;
    const compRate = instances.length
      ? Math.round((totalDone / instances.length) * 100)
      : 0;

    if (recent.length > 0) {
      instancesHtml = `
        <div style="margin-top:12px;">
          <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
            Recent Instances — ${totalDone}/${instances.length} completed (${compRate}% rate)
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;max-height:180px;overflow-y:auto;">
            ${recent
              .map((inst) => {
                const instDone = isTaskDone(inst.id, task.assignedTo);
                return `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border-radius:6px;padding:5px 10px;font-size:12px;">
                <span style="color:var(--text2);">${sanitize(inst.instanceDate || "?")}</span>
                ${
                  instDone
                    ? '<span class="badge badge-green" style="font-size:10px;">✓ Done</span>'
                    : '<span class="badge badge-orange" style="font-size:10px;">Pending</span>'
                }
              </div>`;
              })
              .join("")}
          </div>
          ${instances.length > 14 ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;">+ ${instances.length - 14} older instances not shown</div>` : ""}
        </div>`;
    }
  }

  const pauseBtn = task.isTemplate
    ? `<button class="btn ${task.paused ? "btn-success" : "btn-secondary"} btn-sm" onclick="togglePauseTemplate('${task.id}')">
        ${task.paused ? "▶ Resume" : "⏸ Pause"} Recurring
       </button>`
    : "";

  openModal(`<div class="modal-title">${sanitize(task.title)}</div>
    <div style="background:var(--surface2);border-radius:8px;padding:12px;font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:12px;">${sanitize(task.description || "") || "<em>No description provided.</em>"}</div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">
      <span class="tag tag-${(task.category || "office").toLowerCase()}">${sanitize(task.category || "Office")}</span>
      ${task.points ? `<span class="badge badge-orange">+${task.points} pts</span>` : ""}
      ${task.dueDate ? `<span class="badge badge-blue">Due: ${sanitize(task.dueDate)}</span>` : ""}
      ${task.isTemplate ? `<span class="badge badge-gray">🔁 ${sanitize(repeatLabel(task.repeat))}</span>` : ""}
      ${task.isTemplate && task.paused ? `<span class="badge badge-red">⏸ Paused</span>` : ""}
      ${task.approvalRequired ? `<span class="badge badge-green">Approval Required</span>` : ""}
      ${!task.isTemplate ? (done ? `<span class="badge badge-green">✓ Completed</span>` : `<span class="badge badge-orange">Pending</span>`) : ""}
    </div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">Assigned to: <strong>${sanitize(intern?.name || "Unknown")}</strong></div>
    ${task.isTemplate ? `<div style="font-size:11px;color:var(--text3);margin-bottom:2px;">Schedule: <strong>${sanitize(repeatLabel(task.repeat))}</strong></div>` : ""}
    ${task.isTemplate ? `<div style="font-size:11px;color:var(--text3);">Last auto-generated: ${sanitize(task.lastGenerated || "Never")}</div>` : ""}
    ${instancesHtml}
    <div class="modal-actions" style="margin-top:14px;">
      ${pauseBtn}
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="closeModal();openEditTask('${task.id}')">✏️ Edit</button>
    </div>`);
}

async function togglePauseTemplate(tid) {
  const task = db.tasks.find((t) => t.id == tid);
  if (!task) return;
  task.paused = !task.paused;
  closeModal();
  await saveAndRefresh(
    task.paused ? "⏸ Recurring task paused" : "▶ Recurring task resumed",
    "adminTasks",
  );
}

function openEditTask(tid) {
  const task = db.tasks.find((t) => t.id == tid);
  if (!task) return;
  _approvalContribId = task.approvalContribId || null;
  _repeatConfig = task.repeat || null;
  const interns = INTERNS.filter((i) => i.id !== 99);
  const contribName = task.approvalContribId
    ? db.contributors.find((c) => c.id === task.approvalContribId)?.name ||
      "Unknown"
    : "";
  // BUG-17 FIX: Use searchable single-select picker (consistent with Create Task)
  openModal(`<div class="modal-title">✏️ Edit Task</div>
    <div class="form-group"><label>Title *</label><input type="text" id="etTitle" value="${sanitize(task.title)}"></div>
    <div class="form-group"><label>Description</label><textarea id="etDesc" rows="2">${sanitize(task.description || "")}</textarea></div>
    <div class="form-group">
      <label>Assign To</label>
      <input type="text" id="etInternSearch" placeholder="🔍 Search interns..." oninput="filterEditInternPicker()" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:7px 12px;font-size:13px;font-family:inherit;outline:none;margin-bottom:6px;">
      <div class="intern-picker" id="etAssignList" style="max-height:130px;">
        ${interns.map((i) => `<label data-name="${i.name.toLowerCase()}" style="display:flex;align-items:center;gap:9px;padding:7px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);"><input type="radio" name="etAssignRadio" class="etInternRb" value="${i.id}" ${i.id === task.assignedTo ? "checked" : ""}> ${sanitize(i.name)}</label>`).join("")}
      </div>
    </div>
    <div class="form-group"><label>Category</label><select id="etCat">
      ${["Office", "Academic", "Personal"].map((c) => `<option value="${c}" ${task.category === c ? "selected" : ""}>${c}</option>`).join("")}
    </select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
      <div class="form-group" style="margin-bottom:0;"><label>Points</label><input type="number" id="etPoints" value="${task.points || 0}" min="0"></div>
      <div class="form-group" style="margin-bottom:0;"><label>Due Date</label><input type="date" id="etDue" value="${task.dueDate || ""}"></div>
    </div>
    ${
      task.isTemplate
        ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:9px 13px;font-size:12px;color:#92400e;margin-bottom:10px;">
      🔁 Repeating template — schedule: <strong>${sanitize(repeatLabel(task.repeat))}</strong>. Editing applies to future instances.
    </div>`
        : ""
    }
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:9px 13px;margin-bottom:9px;">
      <span style="font-size:13px;font-weight:600;">Approval Required</span>
      <label class="toggle"><input type="checkbox" id="etApproval" ${task.approvalRequired ? "checked" : ""} onchange="handleApprovalToggle(this)"><span class="toggle-slider"></span></label>
    </div>
    <div id="approvalContribDisplay" style="display:${task.approvalContribId ? "block" : "none"};background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:9px 13px;margin-bottom:9px;font-size:13px;">
      <span id="approvalContribLabel" style="color:#1d4ed8;font-weight:600;">${task.approvalContribId ? "✓ Contributor: " + sanitize(contribName) : ""}</span>
    </div>
    <div class="modal-actions">
      <button class="btn btn-danger btn-sm" onclick="closeModal();confirmDeleteAdminTask('${tid}')">🗑 Delete</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveEditTask('${tid}')">Save Changes</button>
    </div>`);
}

function filterEditInternPicker() {
  const q = (
    document.getElementById("etInternSearch")?.value || ""
  ).toLowerCase();
  document.querySelectorAll("#etAssignList label[data-name]").forEach((lbl) => {
    lbl.style.display = lbl.dataset.name.includes(q) ? "" : "none";
  });
}

async function saveEditTask(tid) {
  const task = db.tasks.find((t) => t.id == tid);
  if (!task) return;
  const title = document.getElementById("etTitle").value.trim();
  if (!title) {
    showToast("Title required", "error");
    return;
  }
  const oldAssignedTo = task.assignedTo;
  // BUG-17 FIX: read from radio buttons in the new searchable picker
  const radioChecked = document.querySelector(
    'input[name="etAssignRadio"]:checked',
  );
  const newAssignedTo = radioChecked
    ? parseInt(radioChecked.value)
    : oldAssignedTo;
  task.title = title;
  task.description = document.getElementById("etDesc").value;
  task.assignedTo = newAssignedTo;
  task.category = document.getElementById("etCat").value;
  task.points = parseInt(document.getElementById("etPoints").value) || 0;
  task.dueDate = document.getElementById("etDue").value;
  task.approvalRequired = document.getElementById("etApproval").checked;
  task.approvalContribId = _approvalContribId;
  if (newAssignedTo !== oldAssignedTo) {
    if (!db.notifications[newAssignedTo]) db.notifications[newAssignedTo] = [];
    db.notifications[newAssignedTo].unshift({
      id: "n-" + Date.now(),
      msg: `Task updated and assigned to you: "${title}"`,
      type: "task",
      read: false,
      date: today(),
    });
  }
  closeModal();
  _approvalContribId = null;
  await saveAndRefresh("Task updated!", "adminTasks");
}

function confirmDeleteAdminTask(tid) {
  const task = db.tasks.find((t) => t.id == tid);
  if (!task) return;
  openModal(`<div class="modal-title" style="color:#e53e3e;">🗑 Delete Task?</div>
    <div style="color:var(--text2);font-size:13px;margin-bottom:6px;"><strong>"${task.title}"</strong></div>
    <div style="color:var(--text2);font-size:13px;margin-bottom:16px;">
      ${task.isTemplate ? "⚠️ This is a repeating template. All its auto-generated instances will also be removed." : "This task will be permanently removed."}
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="doDeleteAdminTask('${tid}')">Yes, Delete</button>
    </div>`);
}

async function doDeleteAdminTask(tid) {
  // BUG-11 FIX: Deduct earned points when a completed task is deleted
  const task = db.tasks.find((t) => t.id === tid);
  if (task) {
    const ck = tid + "-" + task.assignedTo;
    if (db.taskCompletions[ck]?.done && task.points) {
      const s = db.submissions[task.assignedTo];
      if (s) s.points = Math.max(0, (s.points || 0) - task.points);
    }
  }
  // Also handle any recurring instances of this template
  db.tasks
    .filter((t) => t.templateId === tid)
    .forEach((inst) => {
      const ck = inst.id + "-" + inst.assignedTo;
      if (db.taskCompletions[ck]?.done && inst.points) {
        const s = db.submissions[inst.assignedTo];
        if (s) s.points = Math.max(0, (s.points || 0) - inst.points);
      }
    });
  db.tasks = db.tasks.filter((t) => t.id !== tid && t.templateId !== tid);
  Object.keys(db.taskCompletions).forEach((k) => {
    if (k.startsWith(tid + "-")) delete db.taskCompletions[k];
  });
  // Also clean up any pending requests referencing this task
  if (db.pendingRequests)
    db.pendingRequests = db.pendingRequests.filter((r) => r.taskId !== tid);
  closeModal();
  await saveAndRefresh("Task deleted", "adminTasks");
}

// ╔══════════════════════════════════════════════════╗
// ║              CREATE TASK (ADMIN)                 ║
// ╚══════════════════════════════════════════════════╝
function openCreateTask() {
  _approvalContribId = null;
  _repeatConfig = null;
  const interns = INTERNS.filter((i) => i.id !== 99);
  openModal(`<div class="modal-title">Create Task</div>
    <div class="form-group"><label>Title *</label><input type="text" id="tTitle" placeholder="Task title"></div>
    <div class="form-group"><label>Description</label><textarea id="tDesc" rows="2" placeholder="Description"></textarea></div>
    <div class="form-group">
      <label>Assign To <span id="tAssignCount" style="color:var(--accent);font-weight:700;">(0 selected)</span></label>
      <input type="text" id="tInternSearch" placeholder="🔍 Search interns by name..." oninput="filterInternPicker()" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:7px 12px;font-size:13px;font-family:inherit;outline:none;margin-bottom:6px;">
      <div class="intern-picker" id="tAssignList">
        <div class="pick-all-row">
          <span style="font-size:11px;color:var(--text2);">Select interns</span>
          <button onclick="toggleAllInterns(true)">Select All</button>
          <button onclick="toggleAllInterns(false)">Clear</button>
        </div>
        ${interns.map((i) => `<label data-name="${i.name.toLowerCase()}"><input type="checkbox" class="tInternCb" value="${i.id}" onchange="updateAssignCount()"> ${i.name}</label>`).join("")}
      </div>
    </div>
    <div class="form-group"><label>Category</label><select id="tCat"><option>Office</option><option>Academic</option><option>Personal</option></select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
      <div class="form-group" style="margin-bottom:0;"><label>Points</label><input type="number" id="tPoints" value="10" min="0"></div>
      <div class="form-group" style="margin-bottom:0;"><label>Repeat</label>
        <button type="button" class="btn btn-secondary btn-full" onclick="openRepeatDlg('t')"><span id="tRepLabel">None</span> 🔁</button>
      </div>
    </div>
    <div class="form-group"><label>Due Date (optional)</label><input type="date" id="tDue"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:9px 13px;margin-bottom:9px;">
      <span style="font-size:13px;font-weight:600;">Required approval upon completion</span>
      <label class="toggle"><input type="checkbox" id="tApproval" onchange="handleApprovalToggle(this)"><span class="toggle-slider"></span></label>
    </div>
    <div id="approvalContribDisplay" style="display:none;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:9px 13px;margin-bottom:9px;font-size:13px;">
      <span id="approvalContribLabel" style="color:#1d4ed8;font-weight:600;"></span>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveTask()">Create</button>
    </div>`);
}

function toggleAllInterns(check) {
  document
    .querySelectorAll("#tAssignList label:not(.pick-all-row)")
    .forEach((lbl) => {
      if (lbl.style.display !== "none")
        lbl.querySelector("input").checked = check;
    });
  updateAssignCount();
}
function updateAssignCount() {
  const n = document.querySelectorAll(".tInternCb:checked").length;
  const el = document.getElementById("tAssignCount");
  if (el) el.textContent = `(${n} selected)`;
}
function filterInternPicker() {
  const q = (
    document.getElementById("tInternSearch")?.value || ""
  ).toLowerCase();
  document.querySelectorAll("#tAssignList label[data-name]").forEach((lbl) => {
    lbl.style.display = lbl.dataset.name.includes(q) ? "" : "none";
  });
}

function handleApprovalToggle(cb) {
  if (cb.checked) openApprovalContribDlg();
  else {
    _approvalContribId = null;
    document.getElementById("approvalContribDisplay").style.display = "none";
  }
}

function openApprovalContribDlg() {
  document.getElementById("subDialogOverlay")?.remove();
  const ov = document.createElement("div");
  ov.id = "subDialogOverlay";
  ov.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(2px);z-index:2000;display:flex;align-items:center;justify-content:center;";
  ov.innerHTML = `<div style="background:#fff;border-radius:14px;padding:26px;width:350px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.2);">
    <div style="font-size:16px;font-weight:700;margin-bottom:4px;">Approval Settings</div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:16px;">Task cannot be completed without contributor's code</div>
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin-bottom:6px;">Select Contributor</label>
      ${
        db.contributors.length === 0
          ? `<div style="color:#e53e3e;font-size:13px;padding:10px;background:#fff0f0;border-radius:8px;">⚠ No contributors yet. Add one in Settings first.</div>`
          : `<select id="subContribSel" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:9px;font-size:14px;font-family:inherit;outline:none;background:#fff;">
            ${db.contributors.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}
          </select>`
      }
    </div>
    <div style="display:flex;gap:7px;justify-content:flex-end;">
      <button class="btn btn-secondary" onclick="cancelApprovalDlg()">Cancel</button>
      <button class="btn btn-primary" onclick="confirmApprovalDlg()">OK</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

function cancelApprovalDlg() {
  document.getElementById("subDialogOverlay")?.remove();
  const t = document.getElementById("tApproval");
  if (t) t.checked = false;
  _approvalContribId = null;
  const d = document.getElementById("approvalContribDisplay");
  if (d) d.style.display = "none";
}

function confirmApprovalDlg() {
  const sel = document.getElementById("subContribSel");
  if (!sel) {
    document.getElementById("subDialogOverlay")?.remove();
    return;
  }
  const contrib = db.contributors.find((c) => c.id === sel.value);
  _approvalContribId = sel.value;
  document.getElementById("subDialogOverlay")?.remove();
  const d = document.getElementById("approvalContribDisplay");
  const l = document.getElementById("approvalContribLabel");
  if (d && l && contrib) {
    l.textContent = "✓ Contributor: " + contrib.name;
    d.style.display = "block";
  }
}

// ╔══════════════════════════════════════════════════╗
// ║           REPEAT UTILITIES                        ║
// ╚══════════════════════════════════════════════════╝

// Human-readable label for a repeat config object
function repeatLabel(r) {
  if (!r) return "None";
  const dn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (r.freq === "Days" && r.interval === 1) return "Daily";
  if (r.freq === "Days") return `Every ${r.interval} Days`;
  if (r.freq === "Weekdays") return "Every Weekday (Mon–Fri)";
  if (r.freq === "Weeks") {
    const dayStr = r.days?.length
      ? " (" +
        r.days
          .slice()
          .sort((a, b) => a - b)
          .map((d) => dn[d])
          .join(", ") +
        ")"
      : "";
    return r.interval === 1
      ? `Every Week${dayStr}`
      : `Every ${r.interval} Weeks${dayStr}`;
  }
  if (r.freq === "Months")
    return r.interval === 1 ? "Monthly" : `Every ${r.interval} Months`;
  if (r.freq === "Years")
    return r.interval === 1 ? "Yearly" : `Every ${r.interval} Years`;
  return `Every ${r.interval} ${r.freq}`;
}

// Auto-refresh timer: re-runs processRepeatTasks every 5 min while logged in.
// Catches the midnight rollover when a user stays logged in all day.
let _repeatCheckTimer = null;
function startRepeatTimer() {
  if (_repeatCheckTimer) clearInterval(_repeatCheckTimer);
  _repeatCheckTimer = setInterval(
    async () => {
      if (!currentUser || !db) return;
      const changed = processRepeatTasks();
      if (changed) {
        try {
          await saveDB();
          updateBadges();
          if (currentPage) navigateTo(currentPage);
          showStatus("✓ New recurring tasks generated");
        } catch (e) {
          /* silent — will catch on next sync */
        }
      }
    },
    5 * 60 * 1000,
  ); // every 5 minutes
}

// ── Repeat Dialog ──
function openRepeatDlg(ctx) {
  document.getElementById("subDialogOverlay")?.remove();
  const cur = _repeatConfig || { freq: "Days", interval: 1, days: [] };
  const dn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Detect which quick preset matches the current config
  function detectPreset(r) {
    if (!r) return "daily";
    if (r.freq === "Days" && r.interval === 1) return "daily";
    if (r.freq === "Weekdays") return "weekdays";
    if (r.freq === "Weeks" && r.interval === 1) return "weekly";
    if (r.freq === "Months" && r.interval === 1) return "monthly";
    return "custom";
  }
  const initPreset = detectPreset(cur);
  const showDays =
    initPreset === "weekly" ||
    (initPreset === "custom" && cur.freq === "Weeks");
  const showCustom = initPreset === "custom";

  const ov = document.createElement("div");
  ov.id = "subDialogOverlay";
  ov.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(2px);z-index:2000;display:flex;align-items:center;justify-content:center;";
  ov._rs = {
    freq: cur.freq || "Days",
    interval: cur.interval || 1,
    days: [...(cur.days || [])],
    preset: initPreset,
  };

  const pillStyle = (active) =>
    `padding:6px 14px;border-radius:20px;border:1.5px solid ${active ? "#e85d26" : "#444"};background:${active ? "#e85d26" : "transparent"};color:${active ? "#fff" : "#a8adc0"};font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;`;
  const presets = [
    { k: "daily", label: "⚡ Daily" },
    { k: "weekdays", label: "📅 Weekdays" },
    { k: "weekly", label: "🗓 Weekly" },
    { k: "monthly", label: "📆 Monthly" },
    { k: "custom", label: "⚙ Custom" },
  ];

  ov.innerHTML = `
    <div style="background:#2c2f3a;border-radius:14px;padding:24px;width:370px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.4);">
      <div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:4px;">🔁 Repeat Schedule</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">A NEW copy of this task is auto-created each day on the chosen schedule.</div>
      <div style="background:#1a1d23;border-radius:6px;padding:6px 10px;font-size:11px;color:#e85d26;margin-bottom:14px;">⚡ <strong>Daily</strong> = a fresh task appears every day for the intern — they complete it each day.</div>

      <!-- Quick Preset Pills -->
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">
        ${presets.map((p) => `<button id="rp-${p.k}" onclick="selectRepPreset('${p.k}')" style="${pillStyle(initPreset === p.k)}">${p.label}</button>`).join("")}
      </div>

      <!-- Custom Controls (visible only in Custom mode) -->
      <div id="repCustomSection" style="display:${showCustom ? "flex" : "none"};align-items:center;gap:10px;margin-bottom:12px;">
        <div style="background:#1a1d23;border-radius:8px;display:flex;align-items:center;border:1px solid #444;flex-shrink:0;">
          <button onclick="chRI(-1)" style="background:none;border:none;color:#fff;padding:7px 12px;cursor:pointer;font-size:15px;">−</button>
          <span id="riVal" style="color:#fff;font-weight:700;min-width:26px;text-align:center;">${cur.interval || 1}</span>
          <button onclick="chRI(1)"  style="background:none;border:none;color:#fff;padding:7px 12px;cursor:pointer;font-size:15px;">+</button>
        </div>
        <select id="rfSel" onchange="updateRFUI()" style="background:#1a1d23;color:#fff;border:1px solid #444;border-radius:8px;padding:8px 11px;font-size:14px;font-family:inherit;flex:1;outline:none;">
          ${["Days", "Weekdays", "Weeks", "Months", "Years"].map((f) => `<option value="${f}" ${(cur.freq || "Days") === f ? "selected" : ""}>${f}</option>`).join("")}
        </select>
      </div>

      <!-- Day-of-Week Picker (Weekly preset or Weeks in Custom) -->
      <div id="rDaysRow" style="display:${showDays ? "flex" : "none"};gap:5px;flex-wrap:wrap;margin-bottom:14px;">
        ${dn.map((d, i) => `<button id="rd-${i}" onclick="togRD(${i})" style="width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;font-size:11px;font-weight:700;background:${cur.days?.includes(i) ? "#e85d26" : "#1a1d23"};color:${cur.days?.includes(i) ? "#fff" : "#a8adc0"};transition:all .15s;">${d}</button>`).join("")}
      </div>

      <!-- Live Preview -->
      <div style="background:#1a1d23;border-radius:8px;padding:9px 13px;font-size:12px;color:#a8adc0;margin-bottom:18px;">
        Task repeats: <strong id="repPreviewLabel" style="color:#e85d26;">${repeatLabel(ov._rs)}</strong>
      </div>

      <div style="display:flex;gap:7px;justify-content:flex-end;">
        <button onclick="cancelRep()" style="background:none;border:1px solid #555;color:#aaa;border-radius:8px;padding:7px 14px;cursor:pointer;font-family:inherit;">Cancel</button>
        <button onclick="clearRep('${ctx}')" style="background:none;border:1px solid #e53e3e;color:#e53e3e;border-radius:8px;padding:7px 14px;cursor:pointer;font-family:inherit;">Remove</button>
        <button onclick="confirmRep('${ctx}')" style="background:#e85d26;color:#fff;border:none;border-radius:8px;padding:7px 14px;cursor:pointer;font-family:inherit;font-weight:600;">✓ Done</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

// Select a quick preset pill
function selectRepPreset(p) {
  const ov = document.getElementById("subDialogOverlay");
  if (!ov) return;
  ov._rs.preset = p;
  // Update pill styles
  ["daily", "weekdays", "weekly", "monthly", "custom"].forEach((k) => {
    const btn = document.getElementById("rp-" + k);
    if (!btn) return;
    const active = k === p;
    btn.style.background = active ? "#e85d26" : "transparent";
    btn.style.borderColor = active ? "#e85d26" : "#444";
    btn.style.color = active ? "#fff" : "#a8adc0";
  });
  // Apply preset config
  const map = {
    daily: { freq: "Days", interval: 1 },
    weekdays: { freq: "Weekdays", interval: 1 },
    weekly: { freq: "Weeks", interval: 1 },
    monthly: { freq: "Months", interval: 1 },
  };
  if (map[p]) {
    ov._rs.freq = map[p].freq;
    ov._rs.interval = map[p].interval;
  }
  // Show/hide custom controls
  const cs = document.getElementById("repCustomSection");
  if (cs) cs.style.display = p === "custom" ? "flex" : "none";
  // Sync the custom select with current freq
  const rfSel = document.getElementById("rfSel");
  if (rfSel) rfSel.value = ov._rs.freq;
  const riVal = document.getElementById("riVal");
  if (riVal) riVal.textContent = ov._rs.interval;
  // Show/hide day picker
  const showDays =
    p === "weekly" || (p === "custom" && ov._rs.freq === "Weeks");
  const dr = document.getElementById("rDaysRow");
  if (dr) dr.style.display = showDays ? "flex" : "none";
  updateRepPreview();
}

// Update the live "Task repeats: X" preview line
function updateRepPreview() {
  const ov = document.getElementById("subDialogOverlay");
  if (!ov) return;
  const lbl = document.getElementById("repPreviewLabel");
  if (!lbl) return;
  lbl.textContent = repeatLabel(ov._rs);
}

function chRI(d) {
  const ov = document.getElementById("subDialogOverlay");
  const el = document.getElementById("riVal");
  let v = parseInt(el.textContent) + d;
  if (v < 1) v = 1;
  if (v > 365) v = 365;
  el.textContent = v;
  ov._rs.interval = v;
  updateRepPreview();
}

function updateRFUI() {
  const freq = document.getElementById("rfSel").value;
  const ov = document.getElementById("subDialogOverlay");
  if (ov) ov._rs.freq = freq;
  const dr = document.getElementById("rDaysRow");
  if (dr) dr.style.display = freq === "Weeks" ? "flex" : "none";
  updateRepPreview();
}

function togRD(i) {
  const ov = document.getElementById("subDialogOverlay");
  const st = ov._rs;
  const btn = document.getElementById("rd-" + i);
  if (st.days.includes(i)) {
    st.days = st.days.filter((d) => d !== i);
    btn.style.background = "#1a1d23";
    btn.style.color = "#a8adc0";
  } else {
    st.days.push(i);
    btn.style.background = "#e85d26";
    btn.style.color = "#fff";
  }
  updateRepPreview();
}

function cancelRep() {
  document.getElementById("subDialogOverlay")?.remove();
}

function clearRep(ctx) {
  _repeatConfig = null;
  document.getElementById("subDialogOverlay")?.remove();
  const lel = document.getElementById(ctx === "t" ? "tRepLabel" : "ptRepLabel");
  if (lel) lel.textContent = "None";
}

function confirmRep(ctx) {
  const ov = document.getElementById("subDialogOverlay");
  const st = ov._rs;
  // Weekly preset requires at least one day selected
  if ((st.preset === "weekly" || st.freq === "Weeks") && st.days.length === 0) {
    document.getElementById("repPreviewLabel").textContent =
      "⚠ Select at least one day";
    document.getElementById("repPreviewLabel").style.color = "#e53e3e";
    return;
  }
  _repeatConfig = { freq: st.freq, interval: st.interval, days: [...st.days] };
  ov.remove();
  const lel = document.getElementById(ctx === "t" ? "tRepLabel" : "ptRepLabel");
  if (lel) lel.textContent = repeatLabel(_repeatConfig);
}

async function saveTask() {
  const title = document.getElementById("tTitle").value.trim();
  if (!title) {
    showToast("Title required", "error");
    return;
  }
  const approvalRequired = document.getElementById("tApproval").checked;
  if (approvalRequired && !_approvalContribId) {
    showToast("Select a contributor for approval", "error");
    openApprovalContribDlg();
    return;
  }
  const selectedIds = [...document.querySelectorAll(".tInternCb:checked")].map(
    (cb) => parseInt(cb.value),
  );
  if (selectedIds.length === 0) {
    showToast("Select at least one intern", "error");
    return;
  }
  const hasRepeat = !!_repeatConfig;
  const baseData = {
    title,
    description: document.getElementById("tDesc").value,
    category: document.getElementById("tCat").value,
    points: parseInt(document.getElementById("tPoints").value) || 0,
    dueDate: document.getElementById("tDue").value,
    repeat: _repeatConfig,
    approvalRequired,
    approvalContribId: _approvalContribId,
    isPersonal: false,
    createdDate: today(),
    createdAt: Date.now(),
    isTemplate: hasRepeat,
    lastGenerated: hasRepeat ? null : undefined,
  };
  const ts = Date.now();
  selectedIds.forEach((assignedTo, idx) => {
    const task = { ...baseData, id: "t-" + (ts + idx), assignedTo };
    db.tasks.unshift(task);
    if (!db.notifications[assignedTo]) db.notifications[assignedTo] = [];
    db.notifications[assignedTo].unshift({
      id: "n-" + Date.now() + "-" + assignedTo,
      msg: `New task assigned: "${title}"`,
      type: "task",
      read: false,
      date: today(),
    });
  });
  closeModal();
  _approvalContribId = null;
  _repeatConfig = null;
  // If any of the new tasks are repeating templates, generate today's instances immediately
  // so interns see them now without having to re-login.
  if (hasRepeat) processRepeatTasks();
  await saveAndRefresh(
    `Task created for ${selectedIds.length} intern(s)!`,
    "adminTasks",
  );
}

// ╔══════════════════════════════════════════════════╗
// ║            ADMIN TASK ALERTS                     ║
// ╚══════════════════════════════════════════════════╝
function renderAdminNotifs(ca) {
  const notifs = db.adminNotifications || [];
  const requests = (db.pendingRequests || []).filter(
    (r) => r.status === "pending",
  );
  // BUG-20 FIX: only write to Firebase if there were unread notifications to mark
  const hadUnread = notifs.some((n) => !n.isRequest && !n.read);
  notifs.forEach((n) => {
    if (!n.isRequest) n.read = true;
  });
  if (hadUnread) saveDB();
  updateBadges();

  const reqHtml =
    requests.length === 0
      ? ""
      : `
    <div class="section-title" style="margin-bottom:8px;">📨 Pending Requests (${requests.length})</div>
    ${requests
      .map((r) => {
        const intern = INTERNS.find((i) => i.id === r.internId);
        // BUG-05 FIX: sanitize all user-supplied content in request cards
        const typeLabel =
          r.type === "entry"
            ? `Entry: ${sanitize(r.category || "")}`
            : `Task: "${sanitize(r.taskTitle || "")}"`;
        return `<div class="complaint-card" style="border-left:3px solid var(--accent);">
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:6px;">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;">${sanitize(intern?.name?.[0] || "?")}</div>
          <div style="flex:1;">
            <div style="font-weight:700;font-size:13px;">📨 ${sanitize(intern?.name || "Unknown")} — ${typeLabel}</div>
            ${r.note ? `<div style="font-size:12px;color:var(--text2);margin-top:2px;">"${sanitize(r.note)}"</div>` : ""}
          </div>
          <div style="font-size:11px;color:var(--text2);">${sanitize(r.date || "")}</div>
        </div>
        <div style="display:flex;gap:7px;margin-top:4px;">
          <button class="btn btn-success btn-sm" onclick="approveRequest('${r.id}')">✅ Approve</button>
          <button class="btn btn-danger btn-sm" onclick="denyRequest('${r.id}')">❌ Deny</button>
        </div>
      </div>`;
      })
      .join("")}
    <hr style="margin:14px 0;">`;

  const taskNotifs = notifs.filter((n) => !n.isRequest);
  ca.innerHTML = `<div>
    <div class="page-title">Notifications</div>
    <div class="page-sub">Task alerts &amp; intern requests</div>
    ${reqHtml}
    ${taskNotifs.length > 0 ? `<div class="section-title" style="margin-bottom:8px;">✅ Task Completion Alerts</div>` : ""}
    ${taskNotifs.length === 0 && requests.length === 0 ? `<div style="text-align:center;padding:40px;color:var(--text2);">No notifications yet.</div>` : ""}
    ${taskNotifs
      .map((n) => {
        const intern = INTERNS.find((i) => i.id === n.internId);
        return `<div class="complaint-card">
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:4px;">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;">${sanitize(intern?.name?.[0] || "✅")}</div>
          <div style="font-weight:600;">✅ ${sanitize(n.msg)}</div>
        </div>
        <div style="font-size:11px;color:var(--text2);margin-left:42px;">${sanitize(n.date || "")}</div>
      </div>`;
      })
      .join("")}
    ${taskNotifs.length > 0 ? `<div style="margin-top:10px;"><button class="btn btn-danger btn-sm" onclick="clearAdminNotifs()" title="Only clears completion alerts — pending requests are unaffected">Clear Task Completion Alerts</button></div>` : ""}
  </div>`;
}
async function clearAdminNotifs() {
  db.adminNotifications = db.adminNotifications.filter((n) => n.isRequest); // keep request notifications
  await saveAndRefresh("Cleared", "adminNotifs");
}

// ╔══════════════════════════════════════════════════╗
// ║            ADMIN COMPLAINTS                      ║
// ╚══════════════════════════════════════════════════╝
function renderAdminComplaints(ca) {
  const complaints = db.complaints || [];
  const showDone = window.complaintsShowDone || false;
  // BUG-20 FIX: only write to Firebase if there were unread complaints to mark
  const hadUnread = complaints.some((c) => !c.read);
  complaints.forEach((c) => (c.read = true));
  if (hadUnread) saveDB();
  updateBadges();
  const visible = showDone ? complaints : complaints.filter((c) => !c.done);
  ca.innerHTML = `<div>
    <div class="page-title">Complaints</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div class="page-sub" style="margin:0;">${complaints.length} complaint(s) received</div>
      <label style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;cursor:pointer;">
        <input type="checkbox" ${showDone ? "checked" : ""} onchange="window.complaintsShowDone=this.checked;navigateTo('adminComplaints')"> Show Resolved
      </label>
    </div>
    ${visible.length === 0 ? `<div style="text-align:center;padding:40px;color:var(--text2);">${complaints.length === 0 ? "No complaints yet." : "No open complaints."}</div>` : ""}
    ${visible
      .map((c) => {
        const from = INTERNS.find((i) => i.id === c.from);
        const against = INTERNS.find((i) => i.id === c.against);
        return `<div class="complaint-card" style="${c.done ? "opacity:.6;" : ""}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
          <div style="font-weight:700;">${c.done ? "<s>" : ""} ${sanitize(c.subject)} ${c.done ? "</s>" : ""}</div>
          <div style="display:flex;gap:5px;align-items:center;">
            ${c.done ? '<span class="badge badge-green">✓ Resolved</span>' : `<button class="btn btn-success btn-sm" onclick="markComplaintDone('${c.id}')">✓ Mark Done</button>`}
            <span class="badge badge-red">Against: ${sanitize(against?.name || "?")}</span>
          </div>
        </div>
        <div style="font-size:13px;color:var(--text2);">${sanitize(c.desc || "")}</div>
        <div style="display:flex;gap:10px;margin-top:7px;font-size:11px;color:var(--text2);">
          <span>From: ${sanitize(from?.name || "?")}</span><span>${sanitize(c.date || "")}</span>
        </div>
      </div>`;
      })
      .join("")}
  </div>`;
}

async function markComplaintDone(id) {
  const c = db.complaints.find((x) => x.id === id);
  if (!c) return;
  c.done = true;
  await saveAndRefresh("Complaint marked as resolved", "adminComplaints");
}

// ╔══════════════════════════════════════════════════╗
// ║              ADMIN SETTINGS                      ║
// ╚══════════════════════════════════════════════════╝
function renderAdminSettings(ca) {
  const contribs = db.contributors || [];
  const catPts = db.catPoints || DEF_POINTS;
  ca.innerHTML = `<div>
    <div class="page-title">Settings</div>
    <div class="page-sub">Configure points, contributors, export and reset</div>

    <div class="section-title">Category Points</div>
    <div class="card" style="margin-bottom:16px;">
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">Set default points per submission category</div>
      ${Object.entries(catPts)
        .map(
          ([cat, pts]) =>
            `<div class="point-input-row"><span class="point-input-label">${CAT_ICONS[cat] || ""} ${cat}</span><input type="number" class="point-input-field" id="cp-${cat.replace(/\s+/g, "_")}" value="${pts}" min="0"></div>`,
        )
        .join("")}
      <div style="margin-top:10px;"><button class="btn btn-primary" onclick="saveCatPoints()">Save Points</button></div>
    </div>

    <div class="section-title">Contributors</div>
    <div class="card" style="margin-bottom:16px;padding:0;overflow:hidden;">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);">
        <button class="btn btn-primary" onclick="openAddContributor()">+ Add Contributor</button>
      </div>
      ${
        contribs.length === 0
          ? `<div style="padding:18px;color:var(--text2);text-align:center;">No contributors yet.</div>`
          : `<div style="overflow-x:auto;"><table class="table">
            <thead><tr><th>Name</th><th>Code</th><th>Category</th><th>Actions</th></tr></thead>
            <tbody>
              ${contribs
                .map(
                  (c) => `<tr>
                <td style="font-weight:600;">${c.name}</td>
                <td><span style="font-family:'Courier New',monospace;background:#f3f4f6;color:#6b7280;border-radius:5px;padding:2px 8px;font-size:13px;letter-spacing:2px;">●●●●●●</span></td>
                <td style="color:var(--text2);">${c.taskApprovalOnly ? '<span class="badge badge-blue">Task Approval Only</span>' : c.category || "All"}</td>
                <td><div style="display:flex;gap:5px;">
                  <button class="btn btn-secondary btn-sm" onclick="openEditContrib('${c.id}')">Edit</button>
                  <button class="btn btn-danger btn-sm" onclick="delContrib('${c.id}')">Delete</button>
                </div></td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table></div>`
      }
    </div>

    <div class="section-title">Export &amp; Reset</div>
    <div class="grid-2">
      <div class="card">
        <div style="font-weight:700;margin-bottom:5px;">📊 Export Report</div>
        <div style="color:var(--text2);font-size:12px;margin-bottom:10px;">Export selected intern's performance as Excel</div>
        <div class="form-group" style="margin-bottom:9px;">
          <label>Select Intern</label>
          <select id="exportInternSel" style="border:1.5px solid var(--border);border-radius:8px;padding:7px;font-size:13px;font-family:inherit;width:100%;outline:none;background:#fff;">
            ${INTERNS.filter((i) => i.id !== 99)
              .map((i) => `<option value="${i.id}">${i.name}</option>`)
              .join("")}
          </select>
        </div>
        <button class="btn btn-success" onclick="exportData()">⬇ Export as Excel</button>
      </div>
      <div class="card">
        <div style="font-weight:700;margin-bottom:5px;color:#e53e3e;">⚠️ Reset All Data</div>
        <div style="color:var(--text2);font-size:12px;margin-bottom:10px;">Wipes all performance data from the <strong>shared server</strong>. Cannot be undone.</div>
        <button class="btn btn-danger" onclick="confirmReset()">Reset System</button>
      </div>
    </div>
  </div>`;
}

async function saveCatPoints() {
  if (!db.catPoints) db.catPoints = {};
  Object.keys(DEF_POINTS).forEach((cat) => {
    const el = document.getElementById("cp-" + cat.replace(/\s+/g, "_"));
    if (el) db.catPoints[cat] = parseInt(el.value) || 0;
  });
  await saveAndRefresh("Category points saved!", "adminSettings");
}

function openAddContributor() {
  const usedCats = db.contributors
    .filter((c) => c.category !== "All" && !c.taskApprovalOnly)
    .map((c) => c.category);
  const availCats = Object.keys(CAT_KEYS).filter((c) => !usedCats.includes(c));
  const hasAllTaken = db.contributors.some(
    (c) => c.category === "All" && !c.taskApprovalOnly,
  );
  const allOpt = hasAllTaken
    ? ""
    : `<option value="All">All Categories</option>`;
  const catOptions = availCats
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");
  openModal(`<div class="modal-title">Add Contributor</div>
    <div class="form-group"><label>Name</label><input type="text" id="cName" placeholder="Contributor name"></div>
    <div class="form-group">
      <label>Unique Code</label>
      <input type="text" id="cCode" placeholder="e.g. CONTRIB-001">
      <div style="font-size:11px;color:var(--text2);margin-top:4px;">🔒 This code will never be shown to interns</div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:9px 13px;margin-bottom:10px;">
      <div>
        <div style="font-size:13px;font-weight:600;">Task Approval Only</div>
        <div style="font-size:11px;color:var(--text2);">When ON: used only for task approval, not for Add Entry</div>
      </div>
      <label class="toggle"><input type="checkbox" id="cTaskOnly" onchange="toggleContribCatField(this)"><span class="toggle-slider"></span></label>
    </div>
    <div id="cCatWrap" class="form-group">
      <label>Category Assignment</label>
      <select id="cCat">${allOpt}${catOptions}</select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveContributor()">Add</button>
    </div>`);
}

function toggleContribCatField(cb) {
  const wrap = document.getElementById("cCatWrap");
  if (wrap) wrap.style.display = cb.checked ? "none" : "block";
}

async function saveContributor() {
  const name = document.getElementById("cName").value.trim();
  const code = document.getElementById("cCode").value.trim();
  if (!name || !code) {
    showToast("Name and code required", "error");
    return;
  }
  if (db.contributors.find((c) => c.code === code)) {
    showToast("Code already exists", "error");
    return;
  }
  const taskApprovalOnly =
    document.getElementById("cTaskOnly")?.checked || false;
  const category = taskApprovalOnly
    ? null
    : document.getElementById("cCat")?.value || "All";
  db.contributors.push({
    id: "contrib-" + Date.now(),
    name,
    code,
    category,
    taskApprovalOnly,
  });
  closeModal();
  await saveAndRefresh("Contributor added!", "adminSettings");
}

function openEditContrib(id) {
  const c = db.contributors.find((x) => x.id === id);
  if (!c) return;
  const usedCats = db.contributors
    .filter((x) => x.id !== id && x.category !== "All" && !x.taskApprovalOnly)
    .map((x) => x.category);
  const availCats = Object.keys(CAT_KEYS).filter(
    (cat) => !usedCats.includes(cat),
  );
  const otherHasAll = db.contributors.some(
    (x) => x.id !== id && x.category === "All" && !x.taskApprovalOnly,
  );
  const allOpt = otherHasAll
    ? ""
    : `<option value="All" ${c.category === "All" ? "selected" : ""}>All Categories</option>`;
  const catOptions = availCats
    .map(
      (cat) =>
        `<option value="${cat}" ${c.category === cat ? "selected" : ""}>${cat}</option>`,
    )
    .join("");
  const isTaskOnly = !!c.taskApprovalOnly;
  openModal(`<div class="modal-title">Edit Contributor</div>
    <div class="form-group"><label>Name</label><input type="text" id="ecName" value="${c.name}"></div>
    <div class="form-group">
      <label>New Code (leave blank to keep current)</label>
      <input type="password" id="ecCode" placeholder="Enter new code to change it" autocomplete="new-password">
      <div style="font-size:11px;color:var(--text2);margin-top:4px;">🔒 Current code is hidden for security.</div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:9px 13px;margin-bottom:10px;">
      <div>
        <div style="font-size:13px;font-weight:600;">Task Approval Only</div>
        <div style="font-size:11px;color:var(--text2);">When ON: used only for task approval, not for Add Entry</div>
      </div>
      <label class="toggle"><input type="checkbox" id="ecTaskOnly" ${isTaskOnly ? "checked" : ""} onchange="toggleEditContribCatField(this)"><span class="toggle-slider"></span></label>
    </div>
    <div id="ecCatWrap" class="form-group" style="display:${isTaskOnly ? "none" : "block"};">
      <label>Category Assignment</label>
      <select id="ecCat">${allOpt}${catOptions}</select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="updateContrib('${id}')">Save</button>
    </div>`);
}

function toggleEditContribCatField(cb) {
  const wrap = document.getElementById("ecCatWrap");
  if (wrap) wrap.style.display = cb.checked ? "none" : "block";
}

async function updateContrib(id) {
  const name = document.getElementById("ecName").value.trim();
  const newCode = document.getElementById("ecCode").value.trim();
  if (!name) {
    showToast("Name required", "error");
    return;
  }
  const idx = db.contributors.findIndex((c) => c.id === id);
  if (idx < 0) return;
  const taskApprovalOnly =
    document.getElementById("ecTaskOnly")?.checked || false;
  const category = taskApprovalOnly
    ? null
    : document.getElementById("ecCat")?.value || "All";
  const updated = { ...db.contributors[idx], name, category, taskApprovalOnly };
  if (newCode) {
    if (db.contributors.find((c) => c.code === newCode && c.id !== id)) {
      showToast("Code already used", "error");
      return;
    }
    updated.code = newCode;
  }
  db.contributors[idx] = updated;
  closeModal();
  await saveAndRefresh("Contributor updated!", "adminSettings");
}

function delContrib(id) {
  openModal(`<div class="modal-title" style="color:#e53e3e;">Delete Contributor?</div>
    <div style="color:var(--text2);font-size:13px;margin-bottom:16px;">This will permanently remove this contributor from the server for everyone.</div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="doDelContrib('${id}')">Delete</button>
    </div>`);
}
async function doDelContrib(id) {
  db.contributors = db.contributors.filter((c) => c.id !== id);
  closeModal();
  await saveAndRefresh("Contributor deleted", "adminSettings");
}

function exportData() {
  const sel = document.getElementById("exportInternSel");
  const internId = parseInt(sel.value);
  const intern = INTERNS.find((i) => i.id === internId);
  if (!intern) return;
  const s = db.submissions[internId] || {};
  const ob = getObedience(internId);
  const adminTasks = db.tasks.filter(
    (t) => t.assignedTo === internId && !t.isPersonal,
  );
  const esc = (v) =>
    String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const cell = (v) => `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  const row = (...cells) => `<Row>${cells.map(cell).join("")}</Row>`;
  const rows = [
    row("TraineeXP Performance Report", ""),
    row("Name", intern.name),
    row("Username", intern.username),
    row(""),
    row("Metric", "Value"),
    row("Total Points", s.points || 0),
    row("College Attendance", s.college || 0),
    row("Office Attendance", s.office || 0),
    row("Projects", s.project || 0),
    row("Bugs", s.bugs || 0),
    row("Suggestions", s.suggestions || 0),
    row("Obedience %", ob + "%"),
    row("Total Admin Tasks", adminTasks.length),
    row(
      "Completed",
      adminTasks.filter((t) => isTaskDone(t.id, internId)).length,
    ),
    row("Report Date", today()),
    row(""),
    row("Task Title", "Category", "Points", "Due Date", "Repeat", "Status"),
    ...adminTasks.map((t) =>
      row(
        t.title,
        t.category,
        t.points,
        t.dueDate || "—",
        t.repeat ? `Every ${t.repeat.interval} ${t.repeat.freq}` : "None",
        isTaskDone(t.id, internId) ? "Completed" : "Pending",
      ),
    ),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Report"><Table>${rows.join("")}</Table></Worksheet></Workbook>`;
  const blob = new Blob([xml], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `TraineeXP_${intern.name.replace(/\s+/g, "_")}_${today()}.xls`;
  a.click();
  showToast("Exported " + intern.name + "'s report!", "success");
}

function confirmReset() {
  openModal(`<div class="modal-title" style="color:#e53e3e;">⚠️ Confirm Reset</div>
    <div style="color:var(--text2);font-size:13px;margin-bottom:16px;"><strong>This will erase ALL data from the shared server</strong> for every intern — points, task completions, complaints, and notifications. Contributors and task definitions are kept. This cannot be undone.</div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="doReset()">Yes, Reset Everything</button>
    </div>`);
}
async function doReset() {
  INTERNS.filter((i) => i.id !== 99).forEach((i) => {
    db.submissions[i.id] = {
      college: 0,
      office: 0,
      project: 0,
      bugs: 0,
      suggestions: 0,
      dailyCounts: {},
      points: 0,
    };
    db.notifications[i.id] = [];
  });
  db.taskCompletions = {};
  db.complaints = [];
  db.adminNotifications = [];
  db.tasks = [];
  db.pendingRequests = []; // wipe ALL tasks — admin + personal
  closeModal();
  await saveAndRefresh("System reset — all data cleared", "adminSettings");
}

// ╔══════════════════════════════════════════════════╗
// ║                   UTILITIES                      ║
// ╚══════════════════════════════════════════════════╝
// Returns today's date in YYYY-MM-DD using LOCAL timezone.
// CRITICAL: toISOString() returns UTC — in Pakistan (UTC+5) between midnight and 5am
// it would return yesterday's date. We must use local year/month/day.
function today() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

// Format any Date object to YYYY-MM-DD using LOCAL timezone (not UTC)
function dateToLocalStr(d) {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}
function openModal(html) {
  document.getElementById("modalBody").innerHTML = html;
  document.getElementById("modalOverlay").classList.add("open");
}
function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
}
document.getElementById("modalOverlay").addEventListener("click", function (e) {
  if (e.target === this) closeModal();
});

let toastTimer;
function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.className = "toast toast-" + type + " show";
  document.getElementById("toastIcon").textContent =
    type === "success" ? "✓" : "✕";
  document.getElementById("toastMsg").textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

// BUG-10 FIX: Undo toast — shows a dismissable toast with an Undo button.
// onUndo fires if user clicks Undo within 5 seconds.
// onCommit fires after 5 seconds (or immediately if toast is dismissed).
function showUndoToast(msg, onUndo, onCommit) {
  // Reuse existing toast element but with extra undo button
  const t = document.getElementById("toast");
  t.className = "toast toast-success show";
  t.innerHTML = `<span style="flex:1;">✓ ${sanitize(msg)}</span><button onclick="undoTaskNow()" style="background:rgba(255,255,255,.25);border:1px solid rgba(255,255,255,.4);border-radius:5px;color:#fff;font-size:11px;font-weight:700;padding:3px 9px;cursor:pointer;flex-shrink:0;">↩ Undo</button>`;
  if (_undoTimer) clearTimeout(_undoTimer);
  window._undoCallbacks = { onUndo, onCommit, committed: false };
  _undoTimer = setTimeout(() => {
    if (window._undoCallbacks && !window._undoCallbacks.committed) {
      window._undoCallbacks.committed = true;
      onCommit();
    }
    t.classList.remove("show");
    t.innerHTML = `<span id="toastIcon">✓</span><span id="toastMsg">Done!</span>`;
  }, 5000);
}

function undoTaskNow() {
  if (_undoTimer) clearTimeout(_undoTimer);
  const t = document.getElementById("toast");
  t.classList.remove("show");
  t.innerHTML = `<span id="toastIcon">✓</span><span id="toastMsg">Done!</span>`;
  if (window._undoCallbacks && !window._undoCallbacks.committed) {
    window._undoCallbacks.committed = true;
    window._undoCallbacks.onUndo();
    showToast("Task completion undone", "success");
  }
  window._undoCallbacks = null;
}

// ╔══════════════════════════════════════════════════╗
// ║                     INIT                         ║
// ╚══════════════════════════════════════════════════╝

// BUG-21 FIX: Show / hide password on login form
function togglePwVisibility() {
  const inp = document.getElementById("loginPass");
  const btn = document.getElementById("pwToggleBtn");
  if (!inp) return;
  if (inp.type === "password") {
    inp.type = "text";
    if (btn) btn.textContent = "🙈";
  } else {
    inp.type = "password";
    if (btn) btn.textContent = "👁";
  }
}

window.addEventListener("load", () => {
  // Just show the login screen — Firebase loads on login
  setTimeout(() => {
    document.getElementById("loadingOverlay").classList.add("hidden");
    document.getElementById("loginScreen").classList.add("active");
  }, 800);
});
