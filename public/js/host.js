import {
  getRoom, getRoomAsync, updateRoom, subscribeNotes, subscribeParticipants, listNotes, listParticipants
} from "./store.js";
import { CATEGORIES, getQuery, escapeHtml, formatDate, showToast, relativeTime } from "./common.js";

const code = getQuery("code").toUpperCase();
if (!/^[A-Z0-9]{6}$/.test(code)) {
  alert("不正な部屋コードです");
  location.href = "/admin.html";
}

// Wait for room data to load (Firestore is async)
const initialRoom = await getRoomAsync(code);

const titleEl   = document.getElementById("hostTitle");
const metaEl    = document.getElementById("hostMeta");
const codeEl    = document.getElementById("roomCode");
const qrEl      = document.getElementById("qr");
const qrUrlEl   = document.getElementById("qrUrl");
const copyBtn   = document.getElementById("copyUrlBtn");
const enterBtn  = document.getElementById("enterRoomBtn");
const anaBtn    = document.getElementById("analyzeBtn");
const pListEl   = document.getElementById("pList");
const pCountEl  = document.getElementById("pCount");
const liveFeed  = document.getElementById("liveFeed");

const joinUrl    = `${location.origin}/room.html?code=${code}`;
const analyzeUrl = `/analyze.html?code=${code}`;

codeEl.textContent = code;
qrUrlEl.textContent = joinUrl;
enterBtn.href = `/room.html?code=${code}`;
anaBtn.href   = analyzeUrl;

// Render QR.
new QRCode(qrEl, {
  text: joinUrl, width: 220, height: 220,
  colorDark: "#15293D", colorLight: "#ffffff",
  correctLevel: QRCode.CorrectLevel.M
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(joinUrl);
    showToast("参加URLをコピーしました");
  } catch {
    prompt("以下のURLをコピーしてください", joinUrl);
  }
});

// ===== Room metadata =====
function renderRoom() {
  const r = getRoom(code) || initialRoom;
  if (!r) {
    titleEl.textContent = "セッションが見つかりません";
    metaEl.innerHTML = `<a href="/admin.html">管理画面に戻る</a>`;
    return;
  }
  titleEl.textContent = r.title || "(無題のセッション)";
  metaEl.innerHTML = `
    <span>📅 ${escapeHtml(formatDate(r.scheduledAt))}</span>
    <span>👤 ${escapeHtml(r.hostName || "")}</span>
    ${r.memo ? `<span>📝 ${escapeHtml(r.memo)}</span>` : ""}
  `;
  // Move "scheduled" → "active" once host opens the run screen.
  if (r.status === "scheduled") updateRoom(code, { status: "active" });
}
renderRoom();

// ===== Participants =====
subscribeParticipants(code, parts => {
  pCountEl.textContent = `(${parts.length}人)`;
  if (parts.length === 0) {
    pListEl.innerHTML = '<span style="color:var(--subtle);font-size:13px;">QRコードを読み取った人がここに表示されます。</span>';
    return;
  }
  pListEl.innerHTML = parts
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
    .map(p => `<span class="participant-chip">${escapeHtml(p.name || "匿名")}</span>`)
    .join("");
});

// ===== Counts + live feed =====
const seenIds = new Set();
let firstLoad = true;

function paintCounts(notes) {
  const counts = { customer: 0, competitor: 0, company: 0 };
  for (const n of notes) if (counts[n.category] != null) counts[n.category]++;
  for (const c of CATEGORIES) {
    const el = document.getElementById(`cnt-${c.key}`);
    if (el) el.textContent = counts[c.key];
  }
}

function paintFeed(notes) {
  // Sort newest first.
  const sorted = [...notes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (sorted.length === 0) {
    liveFeed.innerHTML = '<div class="empty-state">まだ付箋がありません。</div>';
    return;
  }
  liveFeed.innerHTML = sorted.slice(0, 60).map(n => `
    <div class="feed-note ${n.category}" data-id="${escapeHtml(n.id)}">
      <div class="feed-note-cat">${categoryLabel(n.category)} / ${escapeHtml(n.sub)}</div>
      <div class="feed-note-text">${escapeHtml(n.text)}</div>
      <div class="feed-note-meta">${escapeHtml(n.authorName || "匿名")} ・ ${escapeHtml(relativeTime(n.createdAt))}</div>
    </div>
  `).join("");

  // Animate brand-new notes.
  if (!firstLoad) {
    for (const n of sorted) {
      if (!seenIds.has(n.id)) {
        const el = liveFeed.querySelector(`[data-id="${cssEscape(n.id)}"]`);
        if (el) el.classList.add("just-added");
      }
    }
  }
  for (const n of sorted) seenIds.add(n.id);
  firstLoad = false;
}

function categoryLabel(k) {
  return ({ customer: "顧客", competitor: "競合", company: "自社" })[k] || k;
}
function cssEscape(s) {
  return CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

subscribeNotes(code, notes => {
  paintCounts(notes);
  paintFeed(notes);
});
