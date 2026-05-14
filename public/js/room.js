import {
  getRoom, getRoomAsync, addNote, updateNote, deleteNote, subscribeNotes, setParticipant
} from "./store.js";
import {
  CATEGORIES, MAX_CUSTOM_THEME_LEN, isFixedSub,
  getQuery, getStoredName, setStoredName, getClientId,
  showToast, escapeHtml
} from "./common.js";

const code = getQuery("code").toUpperCase();
if (!/^[A-Z0-9]{6}$/.test(code)) {
  alert("不正な部屋コードです");
  location.href = "/admin.html";
}

// Wait for room data (Firestore is async).
const initialRoom = await getRoomAsync(code);
if (!initialRoom) {
  alert("このセッション部屋は存在しません。\n主催者からもらったコードを再度ご確認ください。");
  location.href = "/";
}

const board       = document.getElementById("board");
const codePill    = document.getElementById("codePill");
const meNameEl    = document.getElementById("meName");
const titleMetaEl = document.getElementById("roomTitleMeta");
const noteCountLabel = document.getElementById("noteCountLabel");
const viewStickyBtn = document.getElementById("viewSticky");
const viewListBtn   = document.getElementById("viewList");

const modal      = document.getElementById("modal");
const modalText  = document.getElementById("modalText");
const modalTitle = document.getElementById("modalTitle");
const modalMeta  = document.getElementById("modalMeta");
const modalSave  = document.getElementById("modalSave");
const modalCancel = document.getElementById("modalCancel");

codePill.textContent = code;
titleMetaEl.textContent = (getRoom(code) || initialRoom)?.title || "3C分析セッション";

// ---- Identity ----
let myName = getStoredName();
if (!myName) {
  myName = (prompt("お名前を入力してください") || "").trim();
  if (!myName) {
    location.href = "/?code=" + code;
    throw new Error("名前未入力");
  }
  setStoredName(myName);
}
meNameEl.textContent = myName;
const myId = getClientId();

// Register participant + heartbeat.
setParticipant(code, { clientId: myId, name: myName });
setInterval(() => setParticipant(code, { clientId: myId, name: myName }), 60_000);

// ---- View mode ----
const VIEW_KEY = "c3live.viewMode";
function applyView(mode) {
  document.body.dataset.view = mode;
  viewStickyBtn.classList.toggle("active", mode === "sticky");
  viewListBtn.classList.toggle("active", mode === "list");
  viewStickyBtn.setAttribute("aria-selected", mode === "sticky");
  viewListBtn.setAttribute("aria-selected", mode === "list");
  localStorage.setItem(VIEW_KEY, mode);
}
const savedMode = localStorage.getItem(VIEW_KEY);
const defaultMode = matchMedia("(max-width:767px)").matches ? "list" : "sticky";
applyView(savedMode || defaultMode);
viewStickyBtn.addEventListener("click", () => applyView("sticky"));
viewListBtn.addEventListener("click",   () => applyView("list"));

// ---- Build board: fixed subgroups first, dynamic custom subs added on demand ----
let columns = {};        // catKey -> column element
let subgroupNodes = {};  // `${cat}::${sub}` -> notes-area element

function ensureColumn(cat) {
  if (columns[cat.key]) return columns[cat.key];
  const col = document.createElement("section");
  col.className = "category-column";

  const head = document.createElement("div");
  head.className = `category-header ${cat.key}`;
  head.innerHTML = `<span>${escapeHtml(cat.label)}</span><span class="count" data-count-cat="${cat.key}">0枚</span>`;
  col.appendChild(head);

  // Footer "create custom theme" button (always at column bottom).
  const customAdd = document.createElement("div");
  customAdd.className = "custom-theme-add";
  customAdd.dataset.cat = cat.key;
  customAdd.textContent = "+ 自分でテーマを作って追加";
  customAdd.addEventListener("click", () => openAddModal(cat.key, null, /*custom*/ true));
  col._customAdd = customAdd;
  col.appendChild(customAdd);

  board.appendChild(col);
  columns[cat.key] = col;
  return col;
}

function ensureSubgroup(catKey, sub, isCustom) {
  const key = `${catKey}::${sub}`;
  if (subgroupNodes[key]) return subgroupNodes[key];

  const cat = CATEGORIES.find(c => c.key === catKey);
  if (!cat) return null;
  const col = ensureColumn(cat);

  const sg = document.createElement("div");
  sg.className = "subgroup" + (isCustom ? " custom" : "");
  sg.dataset.cat = catKey;
  sg.dataset.sub = sub;

  const title = document.createElement("div");
  title.className = "subgroup-title";
  const customBadge = isCustom ? `<span class="custom-badge">カスタム</span>` : "";
  title.innerHTML = `<span>${escapeHtml(sub)} ${customBadge}</span>`;
  const addBtn = document.createElement("button");
  addBtn.className = "add-btn";
  addBtn.textContent = "+ 追加";
  addBtn.addEventListener("click", () => openAddModal(catKey, sub));
  title.appendChild(addBtn);
  sg.appendChild(title);

  const area = document.createElement("div");
  area.className = "notes-area";
  area.dataset.cat = catKey;
  area.dataset.sub = sub;
  sg.appendChild(area);

  const add = document.createElement("div");
  add.className = "note-add-inline";
  add.textContent = "+ ここに追加";
  add.addEventListener("click", () => openAddModal(catKey, sub));
  area.appendChild(add);

  // Insert before the custom-theme-add footer.
  if (col._customAdd) col.insertBefore(sg, col._customAdd);
  else col.appendChild(sg);

  subgroupNodes[key] = area;
  return area;
}

function buildBoard() {
  board.innerHTML = "";
  columns = {};
  subgroupNodes = {};
  for (const cat of CATEGORIES) {
    ensureColumn(cat);
    for (const sub of cat.subs) {
      ensureSubgroup(cat.key, sub, /*isCustom*/ false);
    }
  }
}
buildBoard();

// ---- Modal handling ----
let modalContext = null;
let modalThemeInput = null;

// Inject theme-name input row into modal once.
function ensureModalThemeInput() {
  if (modalThemeInput) return modalThemeInput;
  const wrap = document.createElement("div");
  wrap.id = "modalThemeWrap";
  wrap.style.marginBottom = "10px";
  wrap.style.display = "none";
  wrap.innerHTML = `
    <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:var(--navy);">
      テーマ名（${MAX_CUSTOM_THEME_LEN}文字以内）
    </label>
    <input id="modalThemeInput" type="text" maxlength="${MAX_CUSTOM_THEME_LEN}"
           placeholder="例: コスト感"
           style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;outline:0;font-size:14px;" />
  `;
  modalText.parentNode.insertBefore(wrap, modalText);
  modalThemeInput = wrap.querySelector("#modalThemeInput");
  return modalThemeInput;
}

function openAddModal(cat, sub, customMode = false) {
  const catLabel = CATEGORIES.find(c => c.key === cat).label;
  modalContext = { mode: "add", cat, sub, customMode };
  modalTitle.textContent = customMode ? "テーマを作って付箋を追加" : "付箋を追加";
  modalMeta.textContent  = customMode ? `${catLabel} / 新しいテーマ` : `${catLabel} / ${sub}`;
  modalText.value = "";

  ensureModalThemeInput();
  const wrap = document.getElementById("modalThemeWrap");
  if (customMode) {
    wrap.style.display = "block";
    modalThemeInput.value = "";
  } else {
    wrap.style.display = "none";
  }

  modal.classList.add("show");
  setTimeout(() => (customMode ? modalThemeInput : modalText).focus(), 50);
}

function openEditModal(note) {
  const catLabel = CATEGORIES.find(c => c.key === note.category)?.label || note.category;
  modalContext = { mode: "edit", noteId: note.id, cat: note.category, sub: note.sub };
  modalTitle.textContent = "付箋を編集";
  modalMeta.textContent = `${catLabel} / ${note.sub}`;
  modalText.value = note.text;
  ensureModalThemeInput();
  document.getElementById("modalThemeWrap").style.display = "none";
  modal.classList.add("show");
  setTimeout(() => modalText.focus(), 50);
}

function closeModal() { modal.classList.remove("show"); modalContext = null; }
modalCancel.addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && modal.classList.contains("show")) closeModal();
  if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) && modal.classList.contains("show")) saveModal();
});
modalSave.addEventListener("click", saveModal);

async function saveModal() {
  if (!modalContext) return;
  const text = modalText.value.trim();
  if (!text) { showToast("内容を入力してください"); return; }
  if (text.length > 200) { showToast("200文字以内で入力してください"); return; }

  if (modalContext.mode === "add") {
    let sub = modalContext.sub;
    if (modalContext.customMode) {
      sub = (modalThemeInput.value || "").trim();
      if (!sub) { showToast("テーマ名を入力してください"); modalThemeInput.focus(); return; }
      if (sub.length > MAX_CUSTOM_THEME_LEN) {
        showToast(`テーマ名は${MAX_CUSTOM_THEME_LEN}文字以内にしてください`); return;
      }
    }
    try {
      await addNote(code, {
        category: modalContext.cat, sub, text,
        authorName: myName, authorClientId: myId
      });
      closeModal();
    } catch (e) {
      console.error(e);
      showToast("送信に失敗しました: " + (e.message || e));
    }
  } else {
    try {
      await updateNote(code, modalContext.noteId, { text });
      closeModal();
    } catch (e) {
      console.error(e);
      showToast("更新に失敗しました");
    }
  }
}

// ---- Realtime subscription ----
const notesByKey = new Map();
let totalCount = 0;
const countByCat = { customer: 0, competitor: 0, company: 0 };

function renderNotes(notes) {
  notesByKey.clear();
  totalCount = 0;
  countByCat.customer = countByCat.competitor = countByCat.company = 0;

  for (const n of [...notes].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
    const key = `${n.category}::${n.sub}`;
    if (!notesByKey.has(key)) notesByKey.set(key, []);
    notesByKey.get(key).push(n);
    totalCount++;
    if (countByCat[n.category] != null) countByCat[n.category]++;
  }

  // Ensure subgroups exist for any custom (or unknown) sub names found in notes.
  for (const [key] of notesByKey) {
    const [cat, sub] = key.split("::");
    if (!subgroupNodes[key]) {
      const isCustom = !isFixedSub(cat, sub);
      ensureSubgroup(cat, sub, isCustom);
    }
  }

  // Clear all note nodes.
  for (const key in subgroupNodes) {
    const area = subgroupNodes[key];
    Array.from(area.querySelectorAll(".note")).forEach(n => n.remove());
  }

  // Re-render notes per subgroup.
  for (const [key, list] of notesByKey) {
    const area = subgroupNodes[key];
    if (!area) continue;
    const addBtn = area.querySelector(".note-add-inline");
    for (const n of list) {
      const el = renderNoteEl(n);
      area.insertBefore(el, addBtn);
    }
  }

  noteCountLabel.textContent = `付箋: ${totalCount}枚`;
  for (const cat of CATEGORIES) {
    const c = document.querySelector(`[data-count-cat="${cat.key}"]`);
    if (c) c.textContent = `${countByCat[cat.key]}枚`;
  }
}

function renderNoteEl(n) {
  const el = document.createElement("div");
  el.className = `note ${n.category}${n.authorClientId === myId ? " mine" : ""}`;
  el.dataset.id = n.id;
  el.innerHTML = `
    <div class="note-text">${escapeHtml(n.text)}</div>
    <span class="author">— ${escapeHtml(n.authorName || "匿名")}</span>
    <span class="note-actions">
      <button class="edit" title="編集">✎</button>
      <button class="del"  title="削除">×</button>
    </span>
  `;
  if (n.authorClientId === myId) {
    el.querySelector(".edit").addEventListener("click", e => { e.stopPropagation(); openEditModal(n); });
    el.querySelector(".del").addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm("この付箋を削除しますか？")) return;
      try { await deleteNote(code, n.id); }
      catch (err) { showToast("削除に失敗しました"); console.error(err); }
    });
  }
  return el;
}

subscribeNotes(code, renderNotes);
