// Sticky-note board for a training step (工程2〜8), shared by the participant
// page (board.html) and the facilitator page (step.html).
// Same DOM structure / CSS classes as the 3C board so it looks identical.
//
//   const b = mountStepBoard({ container, modal, code, step, def, myName, myId });
//   b.render(allStepNotes);   // call from subscribeStepNotes

import { addStepNote, updateStepNote, deleteStepNote } from "./step-store.js";
import { columnColor } from "./steps.js";
import { MAX_CUSTOM_THEME_LEN, showToast, escapeHtml } from "./common.js";

export function mountStepBoard({ container, modal, code, step, def, myName, myId, onCount }) {
  const board = container;
  board.classList.add("board", `cols-${Math.min(def.columns.length, 5)}`);

  const modalEl    = modal.el;
  const modalText  = modal.text;
  const modalTitle = modal.title;
  const modalMeta  = modal.meta;
  const modalSave  = modal.save;
  const modalCancel = modal.cancel;

  let columns = {};
  let subgroupNodes = {};

  const colDef = key => def.columns.find(c => c.key === key);
  const colColor = key => columnColor(def.columns.findIndex(c => c.key === key));
  const isFixedSub = (catKey, sub) => { const c = colDef(catKey); return !!(c && c.subs.includes(sub)); };

  function ensureColumn(cat) {
    if (columns[cat.key]) return columns[cat.key];
    const col = document.createElement("section");
    col.className = "category-column";

    const head = document.createElement("div");
    head.className = `category-header ${colColor(cat.key)}`;
    head.innerHTML = `<span>${escapeHtml(cat.label)}</span><span class="count" data-count-cat="${cat.key}">0枚</span>`;
    col.appendChild(head);

    const customAdd = document.createElement("div");
    customAdd.className = "custom-theme-add";
    customAdd.dataset.cat = cat.key;
    customAdd.textContent = "+ 自分でテーマを作って追加";
    customAdd.addEventListener("click", () => openAddModal(cat.key, null, true));
    col._customAdd = customAdd;
    col.appendChild(customAdd);

    board.appendChild(col);
    columns[cat.key] = col;
    return col;
  }

  function ensureSubgroup(catKey, sub, isCustom) {
    const key = `${catKey}::${sub}`;
    if (subgroupNodes[key]) return subgroupNodes[key];
    const cat = colDef(catKey);
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

    if (col._customAdd) col.insertBefore(sg, col._customAdd);
    else col.appendChild(sg);

    subgroupNodes[key] = area;
    return area;
  }

  function buildBoard() {
    board.innerHTML = "";
    columns = {};
    subgroupNodes = {};
    for (const cat of def.columns) {
      ensureColumn(cat);
      for (const sub of cat.subs) ensureSubgroup(cat.key, sub, false);
    }
  }
  buildBoard();

  // ---- Modal ----
  let modalContext = null;
  let modalThemeInput = null;

  function ensureModalThemeInput() {
    if (modalThemeInput) return modalThemeInput;
    const wrap = document.createElement("div");
    wrap.className = "modal-theme-wrap";
    wrap.style.marginBottom = "10px";
    wrap.style.display = "none";
    wrap.innerHTML = `
      <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:var(--navy);">
        テーマ名（${MAX_CUSTOM_THEME_LEN}文字以内）
      </label>
      <input type="text" maxlength="${MAX_CUSTOM_THEME_LEN}" placeholder="例: 価格感"
             style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;outline:0;font-size:14px;" />
    `;
    modalText.parentNode.insertBefore(wrap, modalText);
    modalThemeInput = wrap.querySelector("input");
    modalThemeInput._wrap = wrap;
    return modalThemeInput;
  }

  function openAddModal(cat, sub, customMode = false) {
    const catLabel = colDef(cat).label;
    modalContext = { mode: "add", cat, sub, customMode };
    modalTitle.textContent = customMode ? "テーマを作って付箋を追加" : "付箋を追加";
    modalMeta.textContent  = customMode ? `${catLabel} / 新しいテーマ` : `${catLabel} / ${sub}`;
    modalText.value = "";
    ensureModalThemeInput();
    if (customMode) { modalThemeInput._wrap.style.display = "block"; modalThemeInput.value = ""; }
    else modalThemeInput._wrap.style.display = "none";
    modalEl.classList.add("show");
    setTimeout(() => (customMode ? modalThemeInput : modalText).focus(), 50);
  }

  function openEditModal(note) {
    const catLabel = colDef(note.category)?.label || note.category;
    modalContext = { mode: "edit", noteId: note.id, cat: note.category, sub: note.sub };
    modalTitle.textContent = "付箋を編集";
    modalMeta.textContent = `${catLabel} / ${note.sub}`;
    modalText.value = note.text;
    ensureModalThemeInput();
    modalThemeInput._wrap.style.display = "none";
    modalEl.classList.add("show");
    setTimeout(() => modalText.focus(), 50);
  }

  function closeModal() { modalEl.classList.remove("show"); modalContext = null; }
  modalCancel.addEventListener("click", closeModal);
  modalEl.addEventListener("click", e => { if (e.target === modalEl) closeModal(); });
  document.addEventListener("keydown", e => {
    if (!modalEl.classList.contains("show")) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveModal();
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
        if (sub.length > MAX_CUSTOM_THEME_LEN) { showToast(`テーマ名は${MAX_CUSTOM_THEME_LEN}文字以内にしてください`); return; }
      }
      try {
        await addStepNote(code, step, {
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
        await updateStepNote(code, modalContext.noteId, { text });
        closeModal();
      } catch (e) {
        console.error(e);
        showToast("更新に失敗しました");
      }
    }
  }

  // ---- Render ----
  function renderNoteEl(n) {
    const el = document.createElement("div");
    el.className = `note ${colColor(n.category)}${n.authorClientId === myId ? " mine" : ""}`;
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
        try { await deleteStepNote(code, n.id); }
        catch (err) { showToast("削除に失敗しました"); console.error(err); }
      });
    }
    return el;
  }

  function render(all) {
    const notes = all.filter(n => n.step === step);
    const notesByKey = new Map();
    const countByCat = {};
    for (const c of def.columns) countByCat[c.key] = 0;
    let total = 0;

    for (const n of [...notes].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
      const key = `${n.category}::${n.sub}`;
      if (!notesByKey.has(key)) notesByKey.set(key, []);
      notesByKey.get(key).push(n);
      total++;
      if (countByCat[n.category] != null) countByCat[n.category]++;
    }
    for (const [key] of notesByKey) {
      const [cat, sub] = key.split("::");
      if (!subgroupNodes[key]) ensureSubgroup(cat, sub, !isFixedSub(cat, sub));
    }
    for (const key in subgroupNodes) {
      Array.from(subgroupNodes[key].querySelectorAll(".note")).forEach(n => n.remove());
    }
    for (const [key, list] of notesByKey) {
      const area = subgroupNodes[key];
      if (!area) continue;
      const addBtn = area.querySelector(".note-add-inline");
      for (const n of list) area.insertBefore(renderNoteEl(n), addBtn);
    }
    for (const c of def.columns) {
      const el = board.querySelector(`[data-count-cat="${c.key}"]`);
      if (el) el.textContent = `${countByCat[c.key]}枚`;
    }
    if (onCount) onCount(total, countByCat);
    return total;
  }

  return { render, openAddModal };
}
