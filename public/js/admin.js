import {
  listRooms, createRoom, deleteRoom, subscribeRooms,
  listNotes, listParticipants
} from "./store.js";
import {
  generateRoomCode, escapeHtml, formatDate, showToast
} from "./common.js";

const rowsEl       = document.getElementById("seminarRows");
const newBtn       = document.getElementById("newSeminarBtn");

const modal        = document.getElementById("newSeminarModal");
const titleEl      = document.getElementById("newTitle");
const scheduleEl   = document.getElementById("newSchedule");
const hostNameEl   = document.getElementById("newHostName");
const memoEl       = document.getElementById("newMemo");
const createBtn    = document.getElementById("newCreateBtn");
const cancelBtn    = document.getElementById("newCancelBtn");

function statusLabel(status) {
  if (status === "active") return '<span class="status-pill active">開催中</span>';
  if (status === "scheduled") return '<span class="status-pill scheduled">予定</span>';
  if (status === "ended") return '<span class="status-pill ended">終了</span>';
  return `<span class="status-pill">${escapeHtml(status || "")}</span>`;
}

function render(rooms) {
  if (!rooms || rooms.length === 0) {
    rowsEl.innerHTML = `<tr><td colspan="8" class="empty-state">まだセッションがありません。「＋ 新しいセッション」から作成してください。</td></tr>`;
    return;
  }
  rowsEl.innerHTML = rooms.map(r => {
    const noteCount = listNotes(r.code).length;
    const partCount = listParticipants(r.code).length;
    const dateStr = r.scheduledAt ? formatDate(r.scheduledAt) : "未設定";
    return `
      <tr data-code="${r.code}">
        <td class="date-cell">${escapeHtml(dateStr)}</td>
        <td class="title-cell"><strong>${escapeHtml(r.title || "(無題)")}</strong>${r.memo ? `<div class="muted-small">${escapeHtml(r.memo)}</div>` : ""}</td>
        <td>${escapeHtml(r.hostName || "")}</td>
        <td class="code-cell">${escapeHtml(r.code)}</td>
        <td class="num">${partCount}</td>
        <td class="num">${noteCount}</td>
        <td>${statusLabel(r.status)}</td>
        <td class="actions">
          <a class="btn btn-teal btn-sm" href="/host.html?code=${r.code}">実施</a>
          <a class="btn btn-outline btn-sm" href="/analyze.html?code=${r.code}">分析</a>
          <button class="btn btn-ghost btn-sm row-del" data-code="${r.code}">削除</button>
        </td>
      </tr>
    `;
  }).join("");

  rowsEl.querySelectorAll(".row-del").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const code = btn.dataset.code;
      if (confirm(`コード ${code} のセッションを一覧から外しますか？\n（過去データは分析画面 /analyze.html?code=${code} から後でも参照可能です）`)) {
        await deleteRoom(code);
        showToast("一覧から外しました");
      }
    });
  });
}

subscribeRooms(render);

// Default schedule = today now+30min, rounded to next quarter hour
function defaultDateTimeLocal() {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openModal() {
  titleEl.value = "";
  scheduleEl.value = defaultDateTimeLocal();
  hostNameEl.value = localStorage.getItem("c3live.name") || "";
  memoEl.value = "";
  modal.classList.add("show");
  setTimeout(() => titleEl.focus(), 50);
}
function closeModal() { modal.classList.remove("show"); }
newBtn.addEventListener("click", openModal);
cancelBtn.addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && modal.classList.contains("show")) closeModal(); });

createBtn.addEventListener("click", async () => {
  const title = titleEl.value.trim();
  if (!title) { showToast("セッション名を入力してください"); titleEl.focus(); return; }

  let code = "";
  for (let i = 0; i < 8; i++) {
    const c = generateRoomCode();
    if (!listRooms().some(r => r.code === c)) { code = c; break; }
  }
  if (!code) { showToast("コード生成に失敗。再度お試しください"); return; }

  const scheduledAt = scheduleEl.value ? new Date(scheduleEl.value).getTime() : Date.now();

  const room = {
    code,
    title,
    scheduledAt,
    hostName: hostNameEl.value.trim() || "主催者",
    memo: memoEl.value.trim(),
    status: "active",
    createdAt: Date.now()
  };
  if (room.hostName) localStorage.setItem("c3live.name", room.hostName);

  createBtn.disabled = true;
  try {
    await createRoom(room);
    closeModal();
    showToast(`セッション「${title}」を作成しました（コード ${code}）`);
    setTimeout(() => window.open(`/host.html?code=${code}`, "_blank"), 200);
  } catch (e) {
    console.error(e);
    showToast("作成に失敗しました: " + (e.message || e));
  } finally {
    createBtn.disabled = false;
  }
});
