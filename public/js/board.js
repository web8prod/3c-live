// Participant board for the training steps 2〜8 (工程2〜8).
// Same flow as the 3C board (room.js): enter with the room code, post sticky
// notes, see everyone's notes live. Columns / themes come from steps.js and
// notes are stored in step_notes. When the facilitator pushes another step
// ("参加者に配信"), this page follows automatically.

import { getRoom, getRoomAsync, setParticipant } from "./store.js";
import { subscribeStepNotes, subscribeStepData, getCurrentStep } from "./step-store.js";
import { getStep, stepUrl } from "./steps.js";
import { mountStepBoard } from "./step-board.js";
import {
  getQuery, getStoredName, setStoredName, getClientId, showToast
} from "./common.js";

const code = getQuery("code").toUpperCase();
if (!/^[A-Z0-9]{6}$/.test(code)) {
  alert("不正な部屋コードです");
  location.href = "/";
}
const step = parseInt(getQuery("step"), 10);
const def = getStep(step);
if (!def || step < 2) {
  location.href = `/room.html?code=${code}`;
  throw new Error("invalid step");
}

const initialRoom = await getRoomAsync(code);
if (!initialRoom) {
  alert("このセッション部屋は存在しません。\n主催者からもらったコードを再度ご確認ください。");
  location.href = "/";
}

const codePill    = document.getElementById("codePill");
const stepPill    = document.getElementById("stepPill");
const meNameEl    = document.getElementById("meName");
const titleMetaEl = document.getElementById("roomTitleMeta");
const noteCountLabel = document.getElementById("noteCountLabel");
const viewStickyBtn = document.getElementById("viewSticky");
const viewListBtn   = document.getElementById("viewList");

codePill.textContent = code;
stepPill.textContent = `工程${step}`;
titleMetaEl.textContent = (getRoom(code) || initialRoom)?.title || "研修セッション";
document.title = `工程${step} ${def.short} | 3C Live`;
document.getElementById("stepTitle").textContent = `${def.icon} 工程${step}: ${def.title}`;
document.getElementById("stepGuide").textContent = def.participantGuide || def.goal || "";

// ---- Identity (same as the 3C board) ----
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

// ---- Board ----
const board = mountStepBoard({
  container: document.getElementById("board"),
  modal: {
    el: document.getElementById("modal"),
    text: document.getElementById("modalText"),
    title: document.getElementById("modalTitle"),
    meta: document.getElementById("modalMeta"),
    save: document.getElementById("modalSave"),
    cancel: document.getElementById("modalCancel")
  },
  code, step, def, myName, myId,
  onCount: total => { noteCountLabel.textContent = `付箋: ${total}枚`; }
});
subscribeStepNotes(code, notes => board.render(notes));

// ---- Follow the facilitator ----
// If the facilitator has pushed a step (live >= 2) we always go there, so a
// latecomer scanning an older step's QR lands on the current step. A direct
// link is respected only while nothing has been pushed yet (live == 1); after
// that we move whenever the pushed step changes.
let lastLive = null;
let redirecting = false;
function goTo(live) {
  if (redirecting) return;
  redirecting = true;
  showToast(`主催者が工程${live}に進みました。移動します…`, 1500);
  setTimeout(() => {
    const now = getCurrentStep(code);
    if (now !== step) location.href = stepUrl(code, now, true);
    else redirecting = false;
  }, 1200);
}
subscribeStepData(code, (_map, loaded) => {
  if (!loaded) return;
  const live = getCurrentStep(code);
  if (lastLive === null) {
    lastLive = live;
    if (live >= 2 && live !== step) goTo(live);
    return;
  }
  if (live !== lastLive) {
    lastLive = live;
    if (live !== step) goTo(live);
  }
});
