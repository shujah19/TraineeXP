// ╔══════════════════════════════════════════════════╗
// ║           FIREBASE REALTIME DATABASE             ║
// ║  All data stored at: traineexp-default-rtdb      ║
// ║  Every save/load goes through the internet       ║
// ╚══════════════════════════════════════════════════╝
const FIREBASE_URL = "https://traineexp-default-rtdb.firebaseio.com";

// Read the entire database from Firebase
async function fbRead() {
  const res = await fetch(FIREBASE_URL + "/txp.json");
  if (!res.ok) throw new Error("Server error: " + res.status);
  return await res.json(); // returns null if empty
}

// Write the entire database to Firebase (PUT replaces everything)
async function fbWrite(data) {
  const res = await fetch(FIREBASE_URL + "/txp.json", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Save error: " + res.status);
  return true;
}

// ╔══════════════════════════════════════════════════╗
// ║                CONSTANTS                         ║
// ╚══════════════════════════════════════════════════╝
const INTERNS = [
  {
    id: 1,
    name: "Shuja Haider",
    username: "shuja.haider@aioapp.com",
    password: "shuja1314",
  },
  {
    id: 2,
    name: "Aamir Ali",
    username: "aamir.ali@aioapp.com",
    password: "124654",
  },
  {
    id: 3,
    name: "Ali Jee",
    username: "ali.jee@aioapp.com",
    password: "635737",
  },
  {
    id: 4,
    name: "Huzaifa Akbar",
    username: "huzaifa.akbar@aioapp.com",
    password: "173592",
  },
  {
    id: 5,
    name: "Qasim Abbas",
    username: "qasim.abbas@aioapp.com",
    password: "255362",
  },
  {
    id: 6,
    name: "Tahir Ali",
    username: "tahir.ali@aioapp.com",
    password: "635644",
  },
  {
    id: 7,
    name: "Aizaz Ali",
    username: "aizaz.ali@aioapp.com",
    password: "783464",
  },
  {
    id: 8,
    name: "Hamza Asghar",
    username: "hamza.asghar@aioapp.com",
    password: "934843",
  },
  {
    id: 9,
    name: "Jaffar Ali",
    username: "jaffar.ali@aioapp.com",
    password: "894356",
  },
  {
    id: 10,
    name: "Kazim Ali",
    username: "kazim.ali@aioapp.com",
    password: "874355",
  },
  {
    id: 11,
    name: "Asif Ali",
    username: "asif.ali@aioapp.com",
    password: "425668",
  },
  {
    id: 99,
    name: "Admin",
    username: "admin@traineexp.com",
    password: "Sunlight@1819",
    role: "admin",
  },
];
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
  // Ensure every intern slot exists (safe to call every load)
  if (!data.submissions) data.submissions = {};
  if (!data.notifications) data.notifications = {};
  if (!data.adminNotifications) data.adminNotifications = [];
  if (!data.contributors) data.contributors = [];
  if (!data.tasks) data.tasks = [];
  if (!data.complaints) data.complaints = [];
  if (!data.taskCompletions) data.taskCompletions = {};
  if (!data.catPoints) data.catPoints = Object.assign({}, DEF_POINTS);
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
  const raw = await fbRead();
  if (!raw) {
    db = blankDB();
    await fbWrite(db); // first-ever run: write blank structure
  } else {
    db = patchDB(raw);
  }
}

async function saveDB() {
  await fbWrite(db);
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
// ║                SYNC BUTTON                       ║
// ╚══════════════════════════════════════════════════╝
async function manualSync() {
  const btn = document.getElementById("syncBtn");
  btn.classList.add("syncing");
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
    btn.classList.remove("syncing");
  }
}

// ╔══════════════════════════════════════════════════╗
// ║                   LOGIN                          ║
// ╚══════════════════════════════════════════════════╝
async function doLogin() {
  const u = document.getElementById("loginUser").value.trim();
  const p = document.getElementById("loginPass").value.trim();
  const user = INTERNS.find((i) => i.username === u && i.password === p);
  if (!user) {
    document.getElementById("loginError").style.display = "block";
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
    document.getElementById("topName").textContent = user.name;
    document.getElementById("topRole").textContent =
      currentRole === "admin" ? "Administrator" : "Intern";
    document.getElementById("topAvatar").textContent = user.name[0];
    window.taskFilter = "Today";
    window.adminTaskFilter = "Sent";
    window.adminSelectedIntern = null;
    window.atFilterAssignee = "";
    window.atFilterCat = "";
    renderSidebar();
    await navigateTo(
      currentRole === "admin" ? "adminDashboard" : "internDashboard",
    );
  } catch (e) {
    hideLoading();
    const err = document.getElementById("loginError");
    err.textContent =
      "⚠ Cannot connect to server. Check your internet connection.";
    err.style.display = "block";
  }
}

function doLogout() {
  currentUser = null;
  currentRole = "intern";
  db = null;
  currentPage = null;
  document.getElementById("mainScreen").classList.remove("active");
  document.getElementById("loginScreen").classList.add("active");
  document.getElementById("loginUser").value = "";
  document.getElementById("loginPass").value = "";
}

// ╔══════════════════════════════════════════════════╗
// ║              SIDEBAR / NAVIGATION                ║
// ╚══════════════════════════════════════════════════╝
const internNav = [
  { id: "internDashboard", icon: "📊", label: "Dashboard" },
  { id: "internTasks", icon: "✅", label: "Tasks", badge: "sb-notif" },
  { id: "internComplaints", icon: "📣", label: "Complaints" },
];
const adminNav = [
  { id: "adminDashboard", icon: "📊", label: "Dashboard" },
  { id: "adminTasks", icon: "📋", label: "Manage Tasks" },
  {
    id: "adminNotifs",
    icon: "🔔",
    label: "Task Alerts",
    badge: "sb-admin-notif",
  },
  {
    id: "adminComplaints",
    icon: "📣",
    label: "Complaints",
    badge: "sb-complaint",
  },
  { id: "adminSettings", icon: "⚙️", label: "Settings" },
];

function renderSidebar() {
  const nav = currentRole === "admin" ? adminNav : internNav;
  document.getElementById("sidebar").innerHTML =
    '<div class="sidebar-section">Menu</div>' +
    nav
      .map(
        (
          n,
        ) => `<div class="sidebar-item" id="nav-${n.id}" onclick="navigateTo('${n.id}')">
      <span class="sidebar-icon">${n.icon}</span>${n.label}
      ${n.badge ? `<span class="sidebar-badge" id="${n.badge}"></span>` : ""}
    </div>`,
      )
      .join("");
  updateBadges();
}

async function navigateTo(page) {
  currentPage = page;
  document
    .querySelectorAll(".sidebar-item")
    .forEach((el) => el.classList.remove("active"));
  const el = document.getElementById("nav-" + page);
  if (el) el.classList.add("active");
  const ca = document.getElementById("contentArea");
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
    const elc = document.getElementById("sb-complaint");
    if (elc) {
      elc.textContent = nc || "";
      elc.className = "sidebar-badge" + (nc ? " show" : "");
    }
    const ela = document.getElementById("sb-admin-notif");
    if (ela) {
      ela.textContent = na || "";
      ela.className = "sidebar-badge" + (na ? " show" : "");
    }
    document.getElementById("notifDot").className =
      "notif-dot" + (nc + na ? " show" : "");
  }
}

function handleNotifClick() {
  navigateTo(currentRole === "admin" ? "adminNotifs" : "internNotifs");
}

// ╔══════════════════════════════════════════════════╗
// ║             INTERN DASHBOARD                     ║
// ╚══════════════════════════════════════════════════╝
function getObedience(id) {
  const tasks = db.tasks.filter((t) => t.assignedTo === id && !t.isPersonal);
  if (!tasks.length) return 0;
  return Math.round(
    (tasks.filter((t) => db.taskCompletions?.[t.id + "-" + id]?.done).length /
      tasks.length) *
      100,
  );
}

function renderInternDashboard(ca) {
  const id = currentUser.id;
  const s = db.submissions[id] || {};
  const pts = s.points || 0;
  const ob = getObedience(id);
  ca.innerHTML = `<div>
    <div class="page-title">Dashboard</div>
    <div class="page-sub">Welcome back, ${currentUser.name}</div>
    <div class="grid-2" style="margin-bottom:12px;">
      <div class="points-big">
        <div><div class="points-label">Total Points</div><div class="points-number">${pts}</div></div>
        <div style="font-size:32px;">🏆</div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;justify-content:center;">
        <div class="section-title" style="margin-bottom:6px;">Obedience Score</div>
        <div style="font-size:28px;font-weight:800;">${ob}%</div>
        <div class="obedience-bar"><div class="obedience-fill" style="width:${ob}%"></div></div>
        <div style="font-size:11px;color:var(--text2);margin-top:5px;">Admin Tasks Completed / Total</div>
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
            `<div class="stat-card"><div class="stat-emoji">${ic}</div><div class="stat-label">${lb}</div><div class="stat-value">${vl}</div></div>`,
        )
        .join("")}
    </div>
    <button class="btn btn-primary" style="margin-bottom:18px;" onclick="openAddModal()">+ Add Entry</button>
    <div class="section-title">Profile</div>
    <div class="card card-sm" style="display:flex;align-items:center;gap:12px;">
      <div style="width:40px;height:40px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;">${currentUser.name[0]}</div>
      <div><div style="font-weight:700;font-size:14px;">${currentUser.name}</div><div style="color:var(--text2);font-size:12px;">@${currentUser.username}</div></div>
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
      <button class="btn btn-primary" onclick="submitAdd()">Submit</button>
    </div>`);
  refreshContribInfo();
}

function refreshContribInfo() {
  const cat = document.getElementById("addCat")?.value;
  if (!cat) return;
  const catPts = db.catPoints || DEF_POINTS;
  document.getElementById("catPtsVal").textContent = catPts[cat] || 5;
  const contrib = db.contributors.find(
    (c) => c.category === cat || c.category === "All",
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
// ║              INTERN TASKS (KANBAN)               ║
// ╚══════════════════════════════════════════════════╝
function isTaskDone(tid, iid) {
  return db.taskCompletions?.[tid + "-" + iid]?.done || false;
}

function renderInternTasks(ca) {
  const id = currentUser.id;
  const filter = window.taskFilter || "Today";
  const td = today();
  const all = db.tasks.filter(
    (t) => t.assignedTo === id || (t.isPersonal && t.createdBy === id),
  );
  let tasks = all;
  if (filter === "Today")
    tasks = all.filter((t) => t.dueDate === td || t.createdDate === td);
  else if (filter === "Completed")
    tasks = all.filter((t) => isTaskDone(t.id, id));
  else if (filter === "Pending")
    tasks = all.filter((t) => !isTaskDone(t.id, id));
  const unread = (db.notifications?.[id] || []).filter((n) => !n.read);
  const ribbon = unread.length
    ? `<div class="notif-ribbon"><span>🔔</span><span class="notif-ribbon-text">${unread.length} new task(s) assigned to you</span><button class="notif-ribbon-dismiss" onclick="markNotifsRead(${id})">✕</button></div>`
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
    <div class="kanban-board">
      ${["Office", "Academic", "Personal"].map((cat) => renderKanbanCol(cat, tasks, id)).join("")}
    </div>
  </div>`;
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
  const pts = task.points ? `<span class="kc-pts">⭐${task.points}</span>` : "";
  const due = task.dueDate
    ? `<span class="badge badge-orange" style="font-size:10px;">${task.dueDate}</span>`
    : "";
  const rep = task.repeat
    ? `<span style="font-size:10px;color:var(--text3);">🔁</span>`
    : "";
  let circle;
  if (done) circle = `<div class="kc-circle done">✓</div>`;
  else if (task.approvalRequired && !task.isPersonal)
    circle = `<div class="kc-circle approval" onclick="event.stopPropagation();openApprovalDlg('${task.id}','${id}')" title="Needs approval">+</div>`;
  else
    circle = `<div class="kc-circle" onclick="event.stopPropagation();completeTask('${task.id}','${id}')" onmouseenter="this.textContent='✓'" onmouseleave="this.textContent=''" title="Complete"></div>`;
  return `<div class="kanban-card ${done ? "completed" : ""}" onclick="openTaskDetail('${task.id}')">
    ${circle}
    <div class="kc-info">
      <div class="kc-title">${done ? "<s>" + task.title + "</s>" : task.title}</div>
      <div class="kc-meta">${pts}${due}${rep}</div>
    </div>
  </div>`;
}

function setTF(f) {
  window.taskFilter = f;
  navigateTo("internTasks");
}

function openTaskDetail(tid) {
  const task = db.tasks.find((t) => t.id == tid);
  if (!task) return;
  openModal(`<div class="modal-title">${task.title}</div>
    <div style="background:var(--surface2);border-radius:8px;padding:12px;font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:12px;">${task.description || "<em>No description.</em>"}</div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;">
      <span class="tag tag-${(task.category || "personal").toLowerCase()}">${task.category || "Personal"}</span>
      ${task.points ? `<span class="badge badge-orange">+${task.points} pts</span>` : ""}
      ${task.dueDate ? `<span class="badge badge-blue">Due: ${task.dueDate}</span>` : ""}
      ${task.repeat ? `<span class="badge badge-gray">🔁 Every ${task.repeat.interval} ${task.repeat.freq}</span>` : ""}
      ${task.approvalRequired ? `<span class="badge badge-green">Approval Required</span>` : ""}
    </div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>`);
}

async function completeTask(tid, iid) {
  const task = db.tasks.find((t) => t.id == tid);
  if (!task) return;
  const key = tid + "-" + iid;
  if (db.taskCompletions[key]?.done) return;
  db.taskCompletions[key] = { done: true };
  if (task.points)
    db.submissions[iid].points =
      (db.submissions[iid].points || 0) + task.points;
  if (!task.isPersonal) {
    const intern = INTERNS.find((i) => i.id == iid);
    db.adminNotifications.unshift({
      id: "an-" + Date.now(),
      msg: `${intern?.name || "Intern"} completed: "${task.title}"`,
      read: false,
      date: today(),
      internId: iid,
      taskId: tid,
    });
  }
  await saveAndRefresh(
    "Task completed! +" + (task.points || 0) + " pts",
    "internTasks",
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
  db.tasks.push({
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
    points: 0,
    approvalRequired: false,
  });
  closeModal();
  _repeatConfig = null;
  await saveAndRefresh("Custom task created!", "internTasks");
}

// ╔══════════════════════════════════════════════════╗
// ║              INTERN NOTIFICATIONS                ║
// ╚══════════════════════════════════════════════════╝
function renderInternNotifs(ca) {
  const notifs = db.notifications?.[currentUser.id] || [];
  (db.notifications[currentUser.id] || []).forEach((n) => (n.read = true));
  saveDB();
  updateBadges();
  ca.innerHTML = `<div>
    <div class="page-title">Notifications</div>
    <div class="page-sub">${notifs.length} notification(s)</div>
    ${notifs.length === 0 ? `<div style="text-align:center;padding:40px;color:var(--text2);">No notifications yet.</div>` : ""}
    ${notifs.map((n) => `<div class="complaint-card"><div style="font-weight:600;">🔔 ${n.msg}</div><div style="font-size:11px;color:var(--text2);margin-top:3px;">${n.date}</div></div>`).join("")}
    <div style="margin-top:12px;"><button class="btn btn-secondary" onclick="navigateTo('internTasks')">← Back to Tasks</button></div>
  </div>`;
}

// ╔══════════════════════════════════════════════════╗
// ║              INTERN COMPLAINTS                   ║
// ╚══════════════════════════════════════════════════╝
function renderInternComplaints(ca) {
  ca.innerHTML = `<div>
    <div class="page-title">Complaints</div>
    <div class="page-sub">Submit a complaint to admin</div>
    <button class="btn btn-primary" style="margin-bottom:16px;" onclick="openComplaintModal()">+ New Complaint</button>
    <div style="padding:18px;text-align:center;color:var(--text2);background:#fff;border:1px solid var(--border);border-radius:10px;font-size:13px;">🔒 Complaints are private and seen only by Admin.</div>
  </div>`;
}

function openComplaintModal() {
  const interns = INTERNS.filter((i) => i.id !== 99 && i.id !== currentUser.id);
  openModal(`<div class="modal-title">Submit Complaint</div>
    <div class="form-group"><label>Against</label><select id="cAgainst"><option value="">Select intern...</option>${interns.map((i) => `<option value="${i.id}">${i.name}</option>`).join("")}</select></div>
    <div class="form-group"><label>Subject</label><input type="text" id="cSubject" placeholder="Subject"></div>
    <div class="form-group"><label>Description</label><textarea id="cDesc" placeholder="Describe the issue..."></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitComplaint()">Submit</button>
    </div>`);
}

async function submitComplaint() {
  const against = document.getElementById("cAgainst").value;
  const subject = document.getElementById("cSubject").value.trim();
  const desc = document.getElementById("cDesc").value.trim();
  if (!against || !subject) {
    showToast("Please fill all required fields", "error");
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
  ca.innerHTML = `<div>
    <div class="page-title">Admin Dashboard</div>
    <div class="page-sub">Monitor intern performance</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <label style="font-size:12px;font-weight:600;color:var(--text2);">Viewing:</label>
      <select onchange="selectAdminIntern(this.value)" style="border:1.5px solid var(--border);border-radius:8px;padding:7px 13px;font-size:14px;font-family:inherit;color:var(--text);outline:none;background:#fff;">
        ${interns.map((i) => `<option value="${i.id}" ${i.id === sid ? "selected" : ""}>${i.name}</option>`).join("")}
      </select>
    </div>
    <div class="card" style="margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;">${intern.name[0]}</div>
        <div style="flex:1;"><div style="font-weight:700;font-size:15px;">${intern.name}</div><div style="color:var(--text2);font-size:12px;">@${intern.username}</div></div>
        <div style="text-align:right;"><div style="font-size:11px;color:var(--text2);font-weight:600;text-transform:uppercase;">Points</div><div style="font-size:26px;font-weight:800;color:var(--accent);">${pts}</div></div>
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
              `<div class="stat-card"><div class="stat-emoji">${ic}</div><div class="stat-label">${lb}</div><div class="stat-value" style="font-size:20px;">${vl}</div></div>`,
          )
          .join("")}
      </div>
      <div><div style="font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;margin-bottom:3px;">Obedience: ${ob}%</div><div class="obedience-bar"><div class="obedience-fill" style="width:${ob}%"></div></div></div>
    </div>
    <div class="section-title">Task Overview</div>
    ${renderAdminTaskOverview(sid)}
  </div>`;
}

function renderAdminTaskOverview(sid) {
  const filter = window.adminTaskFilter || "Sent";
  const tasks = db.tasks.filter((t) => t.assignedTo === sid && !t.isPersonal);
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
  const allT = db.tasks.filter((t) => !t.isPersonal);
  const fa = window.atFilterAssignee || "";
  const fc = window.atFilterCat || "";
  const filtered = allT.filter(
    (t) =>
      (!fa || t.assignedTo == fa) &&
      (!fc || (t.category || "").toLowerCase() === fc.toLowerCase()),
  );
  ca.innerHTML = `<div>
    <div class="page-title">Manage Tasks</div>
    <div class="page-sub">Create and assign tasks to interns</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div class="admin-filter-row">
        <label>Assignee:</label>
        <select onchange="setATaskFilter('a',this.value)">
          <option value="">All Interns</option>
          ${interns.map((i) => `<option value="${i.id}" ${fa == i.id ? "selected" : ""}>${i.name}</option>`).join("")}
        </select>
        <label>Category:</label>
        <select onchange="setATaskFilter('c',this.value)">
          <option value="">All</option>
          ${["Office", "Academic", "Personal"].map((c) => `<option value="${c}" ${fc === c ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </div>
      <button class="btn btn-primary" onclick="openCreateTask()">+ Create Task</button>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <table class="table">
        <thead><tr><th>Title</th><th>Description</th><th>Assigned To</th><th>Category</th><th>Points</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>
          ${filtered.length === 0 ? `<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:20px;">No tasks found.</td></tr>` : ""}
          ${filtered
            .map((t) => {
              const intern = INTERNS.find((i) => i.id === t.assignedTo);
              const done = isTaskDone(t.id, t.assignedTo);
              return `<tr onclick="openAdminTaskDetail('${t.id}')" style="cursor:pointer;">
              <td style="font-weight:600;">${t.title}</td>
              <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text2);">${t.description || "—"}</td>
              <td>${intern?.name || "—"}</td>
              <td><span class="tag tag-${(t.category || "office").toLowerCase()}">${t.category}</span></td>
              <td style="font-weight:700;color:var(--accent);">+${t.points || 0}</td>
              <td style="color:var(--text2);">${t.dueDate || "—"}</td>
              <td>${done ? '<span class="badge badge-green">Done</span>' : '<span class="badge badge-orange">Pending</span>'}</td>
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
  else window.atFilterCat = val;
  navigateTo("adminTasks");
}

function openAdminTaskDetail(tid) {
  const task = db.tasks.find((t) => t.id == tid);
  if (!task) return;
  const intern = INTERNS.find((i) => i.id === task.assignedTo);
  const done = isTaskDone(task.id, task.assignedTo);
  openModal(`<div class="modal-title">${task.title}</div>
    <div style="background:var(--surface2);border-radius:8px;padding:12px;font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:12px;">${task.description || "<em>No description provided.</em>"}</div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">
      <span class="tag tag-${(task.category || "office").toLowerCase()}">${task.category}</span>
      ${task.points ? `<span class="badge badge-orange">+${task.points} pts</span>` : ""}
      ${task.dueDate ? `<span class="badge badge-blue">Due: ${task.dueDate}</span>` : ""}
      ${task.repeat ? `<span class="badge badge-gray">🔁 Every ${task.repeat.interval} ${task.repeat.freq}</span>` : ""}
      ${task.approvalRequired ? `<span class="badge badge-green">Approval Required</span>` : ""}
      ${done ? `<span class="badge badge-green">✓ Completed</span>` : `<span class="badge badge-orange">Pending</span>`}
    </div>
    <div style="font-size:12px;color:var(--text2);">Assigned to: <strong>${intern?.name || "Unknown"}</strong></div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>`);
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
    <div class="form-group"><label>Assign To</label><select id="tAssign">${interns.map((i) => `<option value="${i.id}">${i.name}</option>`).join("")}</select></div>
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
  ov.innerHTML = `<div style="background:#fff;border-radius:14px;padding:26px;width:350px;box-shadow:0 20px 60px rgba(0,0,0,.2);">
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

// ── Repeat Dialog ──
function openRepeatDlg(ctx) {
  document.getElementById("subDialogOverlay")?.remove();
  const cur = _repeatConfig || { freq: "Weeks", interval: 1, days: [] };
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const ov = document.createElement("div");
  ov.id = "subDialogOverlay";
  ov.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(2px);z-index:2000;display:flex;align-items:center;justify-content:center;";
  ov._rs = {
    freq: cur.freq || "Weeks",
    interval: cur.interval || 1,
    days: [...(cur.days || [])],
  };
  ov.innerHTML = `<div style="background:#2c2f3a;border-radius:14px;padding:26px;width:350px;box-shadow:0 20px 60px rgba(0,0,0,.4);">
    <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:18px;">🔁 Repeat</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <div style="background:#1a1d23;border-radius:8px;display:flex;align-items:center;border:1px solid #444;">
        <button onclick="chRI(-1)" style="background:none;border:none;color:#fff;padding:7px 13px;cursor:pointer;font-size:15px;">−</button>
        <span id="riVal" style="color:#fff;font-weight:700;min-width:26px;text-align:center;">${cur.interval || 1}</span>
        <button onclick="chRI(1)" style="background:none;border:none;color:#fff;padding:7px 13px;cursor:pointer;font-size:15px;">+</button>
      </div>
      <select id="rfSel" onchange="updateRFUI()" style="background:#1a1d23;color:#fff;border:1px solid #444;border-radius:8px;padding:8px 11px;font-size:14px;font-family:inherit;flex:1;outline:none;">
        ${["Days", "Weekdays", "Weeks", "Months", "Years"].map((f) => `<option value="${f}" ${(cur.freq || "Weeks") === f ? "selected" : ""}>${f}</option>`).join("")}
      </select>
    </div>
    <div id="rDaysRow" style="display:${cur.freq === "Weeks" || !cur.freq ? "flex" : "none"};gap:5px;flex-wrap:wrap;margin-bottom:18px;">
      ${dayNames.map((d, i) => `<button id="rd-${i}" onclick="togRD(${i})" style="width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;font-size:11px;font-weight:700;background:${cur.days?.includes(i) ? "#e85d26" : "#1a1d23"};color:${cur.days?.includes(i) ? "#fff" : "#aaa"};transition:all .15s;">${d}</button>`).join("")}
    </div>
    <div style="display:flex;gap:7px;justify-content:flex-end;">
      <button onclick="cancelRep()" style="background:none;border:1px solid #555;color:#aaa;border-radius:8px;padding:7px 14px;cursor:pointer;font-family:inherit;">Cancel</button>
      <button onclick="confirmRep('${ctx}')" style="background:#e85d26;color:#fff;border:none;border-radius:8px;padding:7px 14px;cursor:pointer;font-family:inherit;font-weight:600;">Done</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}
function chRI(d) {
  const ov = document.getElementById("subDialogOverlay");
  const el = document.getElementById("riVal");
  let v = parseInt(el.textContent) + d;
  if (v < 1) v = 1;
  if (v > 999) v = 999;
  el.textContent = v;
  ov._rs.interval = v;
}
function updateRFUI() {
  const freq = document.getElementById("rfSel").value;
  const row = document.getElementById("rDaysRow");
  if (row) row.style.display = freq === "Weeks" ? "flex" : "none";
  const ov = document.getElementById("subDialogOverlay");
  if (ov) ov._rs.freq = freq;
}
function togRD(i) {
  const ov = document.getElementById("subDialogOverlay");
  const st = ov._rs;
  const btn = document.getElementById("rd-" + i);
  if (st.days.includes(i)) {
    st.days = st.days.filter((d) => d !== i);
    btn.style.background = "#1a1d23";
    btn.style.color = "#aaa";
  } else {
    st.days.push(i);
    btn.style.background = "#e85d26";
    btn.style.color = "#fff";
  }
}
function cancelRep() {
  document.getElementById("subDialogOverlay")?.remove();
}
function confirmRep(ctx) {
  const ov = document.getElementById("subDialogOverlay");
  const st = ov._rs;
  _repeatConfig = {
    freq: st.freq,
    interval: st.interval,
    days: [...st.days],
  };
  ov.remove();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const label = `Every ${st.interval} ${st.freq}${
    st.days.length
      ? " (" +
        st.days
          .sort()
          .map((d) => dayNames[d])
          .join(", ") +
        ")"
      : ""
  }`;
  const lel = document.getElementById(ctx === "t" ? "tRepLabel" : "ptRepLabel");
  if (lel) lel.textContent = label;
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
  const assignedTo = parseInt(document.getElementById("tAssign").value);
  db.tasks.push({
    id: "t-" + Date.now(),
    title,
    description: document.getElementById("tDesc").value,
    assignedTo,
    category: document.getElementById("tCat").value,
    points: parseInt(document.getElementById("tPoints").value) || 0,
    dueDate: document.getElementById("tDue").value,
    repeat: _repeatConfig,
    approvalRequired,
    approvalContribId: _approvalContribId,
    isPersonal: false,
    createdDate: today(),
  });
  // Notify the intern
  if (!db.notifications[assignedTo]) db.notifications[assignedTo] = [];
  db.notifications[assignedTo].unshift({
    id: "n-" + Date.now(),
    msg: `New task assigned: "${title}"`,
    type: "task",
    read: false,
    date: today(),
  });
  closeModal();
  _approvalContribId = null;
  _repeatConfig = null;
  await saveAndRefresh("Task created & intern notified!", "adminTasks");
}

// ╔══════════════════════════════════════════════════╗
// ║            ADMIN TASK ALERTS                     ║
// ╚══════════════════════════════════════════════════╝
function renderAdminNotifs(ca) {
  const notifs = db.adminNotifications || [];
  notifs.forEach((n) => (n.read = true));
  saveDB();
  updateBadges();
  ca.innerHTML = `<div>
    <div class="page-title">Task Completion Alerts</div>
    <div class="page-sub">Notifications when interns complete assigned tasks</div>
    ${notifs.length === 0 ? `<div style="text-align:center;padding:40px;color:var(--text2);">No task completions yet.</div>` : ""}
    ${notifs
      .map((n) => {
        const intern = INTERNS.find((i) => i.id === n.internId);
        return `<div class="complaint-card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;">${intern?.name?.[0] || "?"}</div>
          <div style="font-weight:600;">✅ ${n.msg}</div>
        </div>
        <div style="font-size:11px;color:var(--text2);margin-left:42px;">${n.date}</div>
      </div>`;
      })
      .join("")}
    ${notifs.length > 0 ? `<div style="margin-top:10px;"><button class="btn btn-danger btn-sm" onclick="clearAdminNotifs()">Clear All</button></div>` : ""}
  </div>`;
}
async function clearAdminNotifs() {
  db.adminNotifications = [];
  await saveAndRefresh("Cleared", "adminNotifs");
}

// ╔══════════════════════════════════════════════════╗
// ║            ADMIN COMPLAINTS                      ║
// ╚══════════════════════════════════════════════════╝
function renderAdminComplaints(ca) {
  const complaints = db.complaints || [];
  complaints.forEach((c) => (c.read = true));
  saveDB();
  updateBadges();
  ca.innerHTML = `<div>
    <div class="page-title">Complaints</div>
    <div class="page-sub">${complaints.length} complaint(s) received</div>
    ${complaints.length === 0 ? `<div style="text-align:center;padding:40px;color:var(--text2);">No complaints yet.</div>` : ""}
    ${complaints
      .map((c) => {
        const from = INTERNS.find((i) => i.id === c.from);
        const against = INTERNS.find((i) => i.id === c.against);
        return `<div class="complaint-card">
        <div style="display:flex;gap:10px;margin-bottom:5px;">
          <div style="font-weight:700;">${c.subject}</div>
          <span class="badge badge-red">Against: ${against?.name || "?"}</span>
        </div>
        <div style="font-size:13px;color:var(--text2);">${c.desc}</div>
        <div style="display:flex;gap:10px;margin-top:7px;font-size:11px;color:var(--text2);">
          <span>From: ${from?.name || "?"}</span><span>${c.date}</span>
        </div>
      </div>`;
      })
      .join("")}
  </div>`;
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
          : `<table class="table">
            <thead><tr><th>Name</th><th>Code</th><th>Category</th><th>Actions</th></tr></thead>
            <tbody>
              ${contribs
                .map(
                  (c) => `<tr>
                <td style="font-weight:600;">${c.name}</td>
                <td><span style="font-family:'Courier New',monospace;background:#f3f4f6;color:#6b7280;border-radius:5px;padding:2px 8px;font-size:13px;letter-spacing:2px;">●●●●●●</span></td>
                <td style="color:var(--text2);">${c.category || "All"}</td>
                <td><div style="display:flex;gap:5px;">
                  <button class="btn btn-secondary btn-sm" onclick="openEditContrib('${c.id}')">Edit</button>
                  <button class="btn btn-danger btn-sm" onclick="delContrib('${c.id}')">Delete</button>
                </div></td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>`
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
    .filter((c) => c.category !== "All")
    .map((c) => c.category);
  const availCats = Object.keys(CAT_KEYS).filter((c) => !usedCats.includes(c));
  const hasAllTaken = db.contributors.some((c) => c.category === "All");
  const allOpt = hasAllTaken
    ? ""
    : `<option value="All">All Categories</option>`;
  const catOptions = availCats
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");
  if (!allOpt && !catOptions) {
    showToast("All categories are already assigned", "error");
    return;
  }
  openModal(`<div class="modal-title">Add Contributor</div>
    <div class="form-group"><label>Name</label><input type="text" id="cName" placeholder="Contributor name"></div>
    <div class="form-group">
      <label>Unique Code</label>
      <input type="text" id="cCode" placeholder="e.g. CONTRIB-001">
      <div style="font-size:11px;color:var(--text2);margin-top:4px;">🔒 This code will never be shown to interns</div>
    </div>
    <div class="form-group"><label>Category Assignment</label><select id="cCat">${allOpt}${catOptions}</select></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveContributor()">Add</button>
    </div>`);
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
  db.contributors.push({
    id: "contrib-" + Date.now(),
    name,
    code,
    category: document.getElementById("cCat").value,
  });
  closeModal();
  await saveAndRefresh("Contributor added!", "adminSettings");
}

function openEditContrib(id) {
  const c = db.contributors.find((x) => x.id === id);
  if (!c) return;
  const usedCats = db.contributors
    .filter((x) => x.id !== id && x.category !== "All")
    .map((x) => x.category);
  const availCats = Object.keys(CAT_KEYS).filter(
    (cat) => !usedCats.includes(cat),
  );
  const otherHasAll = db.contributors.some(
    (x) => x.id !== id && x.category === "All",
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
  openModal(`<div class="modal-title">Edit Contributor</div>
    <div class="form-group"><label>Name</label><input type="text" id="ecName" value="${c.name}"></div>
    <div class="form-group">
      <label>New Code (leave blank to keep current)</label>
      <input type="password" id="ecCode" placeholder="Enter new code to change it" autocomplete="new-password">
      <div style="font-size:11px;color:var(--text2);margin-top:4px;">🔒 Current code is hidden for security.</div>
    </div>
    <div class="form-group"><label>Category</label><select id="ecCat">${allOpt}${catOptions}</select></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="updateContrib('${id}')">Save</button>
    </div>`);
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
  if (newCode) {
    if (db.contributors.find((c) => c.code === newCode && c.id !== id)) {
      showToast("Code already used", "error");
      return;
    }
    db.contributors[idx] = {
      ...db.contributors[idx],
      name,
      code: newCode,
      category: document.getElementById("ecCat").value,
    };
  } else {
    db.contributors[idx] = {
      ...db.contributors[idx],
      name,
      category: document.getElementById("ecCat").value,
    };
  }
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
  db.tasks = db.tasks.filter((t) => !t.isPersonal);
  closeModal();
  await saveAndRefresh("System reset — all data cleared", "adminSettings");
}

// ╔══════════════════════════════════════════════════╗
// ║                   UTILITIES                      ║
// ╚══════════════════════════════════════════════════╝
function today() {
  return new Date().toISOString().split("T")[0];
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

// ╔══════════════════════════════════════════════════╗
// ║                     INIT                         ║
// ╚══════════════════════════════════════════════════╝
window.addEventListener("load", () => {
  // Just show the login screen — Firebase loads on login
  setTimeout(() => {
    document.getElementById("loadingOverlay").classList.add("hidden");
    document.getElementById("loginScreen").classList.add("active");
  }, 800);
});
