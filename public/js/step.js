// Facilitator page for the training steps 2〜8 (工程2〜8).
//   /step.html?code=XXXXXX&step=N
// Left: live sticky board (same as participants see). Right: inputs from the
// earlier steps, prompt copy (free) / API generation (optional), AI result,
// and the decision that feeds the next step.

import {
  getRoomAsync, subscribeNotes, subscribeParticipants, listNotes
} from "./store.js";
import {
  subscribeStepNotes, subscribeStepData, listStepNotes,
  getStepData, getStepDataRecord, setStepData, getCurrentStep, setCurrentStep
} from "./step-store.js";
import { getStep, STEP1, STEPS, makeCtx, stepUrl, TOTAL_STEPS } from "./steps.js";
import { mountStepBoard } from "./step-board.js";
import { renderStepsNav } from "./steps-nav.js";
import { renderMarkdown, extractHexColors } from "./markdown.js";
import { openPromptModal } from "./prompt-modal.js";
import { generateText, MODELS, DEFAULT_MODEL } from "./claude-client.js";
import {
  getQuery, getStoredName, getClientId, showToast, escapeHtml, formatDate
} from "./common.js";

const code = getQuery("code").toUpperCase();
if (!/^[A-Z0-9]{6}$/.test(code)) {
  location.href = "/admin.html";
  throw new Error("invalid code");
}
const step = parseInt(getQuery("step"), 10);
const def = getStep(step);
if (!def || step < 2) {
  location.href = `/analyze.html?code=${code}`;
  throw new Error("invalid step");
}

const room = await getRoomAsync(code);
if (!room) {
  alert("このセッション部屋は存在しません。");
  location.href = "/admin.html";
  throw new Error("room not found");
}

const myName = getStoredName() || room?.hostName || "主催者";
const myId   = getClientId();

// ---- Static header ----
document.title = `工程${step} ${def.short} | 3C Live`;
document.getElementById("seminarTitle").textContent = room?.title || "(無題)";
document.getElementById("seminarMeta").textContent = `${formatDate(room?.scheduledAt)} ・ 主催: ${room?.hostName || ""}`;
document.getElementById("sCode").textContent = code;
document.getElementById("stepHeading").textContent = `${def.icon} 工程${step}: ${def.title}`;
document.getElementById("stepGoal").textContent = def.goal || "";
document.getElementById("stepGuide").textContent = def.participantGuide ? `参加者への声かけ例: ${def.participantGuide}` : "";
document.getElementById("aiHeading").textContent = `🤖 AIで作る: ${def.short}`;
document.getElementById("decisionLabel").textContent = `✅ ${def.decision.label}`;
document.getElementById("decisionText").placeholder = def.decision.placeholder || "";

const joinUrl = `${location.origin}${stepUrl(code, step, true)}`;
document.getElementById("openBoardBtn").href = stepUrl(code, step, true);
document.getElementById("qrUrl").textContent = joinUrl;
if (typeof QRCode !== "undefined") {
  new QRCode(document.getElementById("qr"), {
    text: joinUrl, width: 150, height: 150,
    colorDark: "#15293D", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M
  });
}
document.getElementById("copyUrlBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(joinUrl); showToast("参加URLをコピーしました"); }
  catch { prompt("以下のURLをコピーしてください", joinUrl); }
});

const prevBtn = document.getElementById("prevStepBtn");
const nextBtn = document.getElementById("nextStepBtn");
prevBtn.href = stepUrl(code, step - 1);
prevBtn.textContent = `← 工程${step - 1}: ${getStep(step - 1).short}`;
if (step < TOTAL_STEPS) {
  nextBtn.href = stepUrl(code, step + 1);
  nextBtn.textContent = `工程${step + 1}: ${getStep(step + 1).short} へ →`;
} else {
  nextBtn.style.display = "none";
}

// ---- View mode for the embedded board ----
const viewStickyBtn = document.getElementById("viewSticky");
const viewListBtn   = document.getElementById("viewList");
function applyView(mode) {
  document.body.dataset.view = mode;
  viewStickyBtn.classList.toggle("active", mode === "sticky");
  viewListBtn.classList.toggle("active", mode === "list");
}
applyView(localStorage.getItem("c3live.viewMode") || "sticky");
viewStickyBtn.addEventListener("click", () => applyView("sticky"));
viewListBtn.addEventListener("click",   () => applyView("list"));

// ---- Board ----
const sNotes = document.getElementById("sNotes");
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
  onCount: total => { sNotes.textContent = total; }
});

// ---- State ----
let dataMap = {};
let stepNotesAll = [];

function ctx() {
  return makeCtx({ room, notes3c: listNotes(code), stepNotesAll, dataMap });
}

// Table view (e.g. funnel): rows = columns, cells = sub themes
function renderTableView() {
  const wrap = document.getElementById("tableView");
  if (def.columns.length < 3) { wrap.style.display = "none"; return; }
  const notes = stepNotesAll.filter(n => n.step === step);
  if (!notes.length) { wrap.style.display = "none"; return; }
  const subs = [...new Set(def.columns.flatMap(c => c.subs))];
  const extra = [...new Set(notes.map(n => n.sub).filter(s => !subs.includes(s)))];
  const cols = [...subs, ...extra];
  const html = `<div class="md-table-wrap"><table class="md-table"><thead><tr><th>段階</th>${cols.map(s => `<th>${escapeHtml(s)}</th>`).join("")}</tr></thead><tbody>` +
    def.columns.map(c => {
      const cells = cols.map(s => {
        const list = notes.filter(n => n.category === c.key && n.sub === s).map(n => `・${escapeHtml(n.text)}`);
        return `<td>${list.join("<br>")}</td>`;
      }).join("");
      return `<tr><th>${escapeHtml(c.label)}</th>${cells}</tr>`;
    }).join("") + "</tbody></table></div>";
  document.getElementById("tableViewBody").innerHTML = html;
  wrap.style.display = "block";
}

// Inputs from earlier steps
function renderInputs() {
  const c = ctx();
  const el = document.getElementById("inputsList");
  el.innerHTML = def.inputs.map(inp => {
    if (inp.notes3c) {
      const n = c.notes3c.filter(x => x.category === inp.notes3c).length;
      return `<div class="input-card ${n ? "ok" : "missing"}">
        <div class="input-card-head"><span>${escapeHtml(inp.label)}</span>
          <a href="/analyze.html?code=${escapeHtml(code)}" target="_blank">分析画面</a></div>
        <div class="input-card-body">${n ? `${n}枚の付箋を使います` : "付箋がありません"}</div>
      </div>`;
    }
    const s = inp.step;
    const decision = c.data(s, "decision").trim();
    const result   = c.data(s, "result").trim();
    const val = decision || result;
    const label = decision ? "決定事項" : (result ? "AIの結果（決定事項が未入力）" : "");
    const short = val.length > 240 ? val.slice(0, 240) + "…" : val;
    return `<div class="input-card ${val ? "ok" : "missing"}">
      <div class="input-card-head"><span>工程${s}: ${escapeHtml(inp.label)}</span>
        <a href="${stepUrl(code, s)}">工程${s}を開く</a></div>
      <div class="input-card-body">${val
        ? `<span class="input-kind">${label}</span>${escapeHtml(short)}`
        : `未入力です。工程${s}で「AIの結果」か「決定事項」を保存してください。`}</div>
    </div>`;
  }).join("");
}

// Result / decision fields
const resultText   = document.getElementById("resultText");
const decisionText = document.getElementById("decisionText");
const resultMeta   = document.getElementById("resultMeta");
const decisionMeta = document.getElementById("decisionMeta");
const resultRendered = document.getElementById("resultRendered");
const swatches = document.getElementById("swatches");
let resultDirty = false, decisionDirty = false;
resultText.addEventListener("input", () => { resultDirty = true; });
decisionText.addEventListener("input", () => { decisionDirty = true; });

function metaText(rec) {
  if (!rec || !rec.content) return "";
  return `保存済み ${formatDate(rec.updatedAt)}${rec.updatedBy ? " ・ " + rec.updatedBy : ""}`;
}
function renderResultPreview() {
  const md = resultText.value;
  resultRendered.innerHTML = renderMarkdown(md);
  const hex = step === 6 ? extractHexColors(md) : [];
  if (hex.length) {
    swatches.style.display = "flex";
    swatches.innerHTML = hex.slice(0, 12).map(h =>
      `<div class="swatch"><span class="swatch-color" style="background:${h}"></span><span class="swatch-hex">${h}</span></div>`
    ).join("");
  } else {
    swatches.style.display = "none";
    swatches.innerHTML = "";
  }
}
function syncFields() {
  const r = getStepDataRecord(code, step, "result");
  const d = getStepDataRecord(code, step, "decision");
  if (!resultDirty) resultText.value = r?.content || "";
  if (!decisionDirty) decisionText.value = d?.content || "";
  resultMeta.textContent = metaText(r);
  decisionMeta.textContent = metaText(d);
  if (resultRendered.style.display !== "none") renderResultPreview();
}

document.getElementById("saveResultBtn").addEventListener("click", async () => {
  try {
    await setStepData(code, step, "result", resultText.value.trim(), myName);
    resultDirty = false;
    showToast("AIの結果を保存しました");
  } catch (e) { console.error(e); showToast("保存に失敗しました: " + (e.message || e)); }
});
document.getElementById("saveDecisionBtn").addEventListener("click", async () => {
  try {
    await setStepData(code, step, "decision", decisionText.value.trim(), myName);
    decisionDirty = false;
    showToast("決定事項を保存しました");
  } catch (e) { console.error(e); showToast("保存に失敗しました: " + (e.message || e)); }
});
document.getElementById("toggleRenderBtn").addEventListener("click", e => {
  const show = resultRendered.style.display === "none";
  resultRendered.style.display = show ? "block" : "none";
  e.target.textContent = show ? "整形表示を閉じる" : "整形して表示";
  if (show) renderResultPreview(); else { swatches.style.display = "none"; }
});
document.getElementById("copyResultBtn").addEventListener("click", async () => {
  const t = resultText.value;
  if (!t.trim()) { showToast("コピーする内容がありません"); return; }
  try { await navigator.clipboard.writeText(t); showToast("コピーしました"); }
  catch { showToast("コピーに失敗しました"); }
});

// ---- Push step to participants ----
const sLive = document.getElementById("sLive");
const pushBtn = document.getElementById("pushStepBtn");
const pushNotice = document.getElementById("pushNotice");
function renderLive() {
  const live = getCurrentStep(code);
  sLive.textContent = `工程${live}: ${getStep(live).short}`;
  const isLive = live === step;
  pushBtn.textContent = isLive ? "📡 参加者に配信中（この工程）" : "📡 この工程を参加者に配信";
  pushBtn.classList.toggle("btn-outline", isLive);
  pushBtn.classList.toggle("btn-primary", !isLive);
  pushNotice.style.display = isLive ? "block" : "none";
  pushNotice.textContent = isLive
    ? "参加者の画面はこの工程のボードに自動で切り替わっています。3C分析の受講者画面（QR）から入った人もここに誘導されます。"
    : "";
}
pushBtn.addEventListener("click", async () => {
  try {
    await setCurrentStep(code, step, myName);
    showToast(`工程${step}を参加者に配信しました`);
  } catch (e) { console.error(e); showToast("配信に失敗しました: " + (e.message || e)); }
});

// ---- Subscriptions ----
subscribeStepData(code, map => {
  dataMap = map;
  renderStepsNav(document.getElementById("stepsNav"), { code, current: step, liveStep: getCurrentStep(code), dataMap });
  renderInputs();
  syncFields();
  renderLive();
});
subscribeStepNotes(code, notes => {
  stepNotesAll = notes;
  board.render(notes);
  renderTableView();
});
subscribeNotes(code, () => renderInputs());
subscribeParticipants(code, parts => { document.getElementById("sPeople").textContent = parts.length; });

// ---- Prompt (free path) ----
document.getElementById("copyPromptBtn").addEventListener("click", () => {
  openPromptModal(def.buildPrompt(ctx()), { title: `📋 工程${step} ${def.short} 用プロンプト` });
});

// ---- API path ----
const apiKeyEl = document.getElementById("apiKey");
const rememberKey = document.getElementById("rememberKey");
const modelSelect = document.getElementById("modelSelect");
const generateBtn = document.getElementById("generateBtn");
for (const m of MODELS) {
  const opt = document.createElement("option");
  opt.value = m.id; opt.textContent = m.label;
  if (m.id === DEFAULT_MODEL) opt.selected = true;
  modelSelect.appendChild(opt);
}
const KEY_SESSION = "c3live.sessionApiKey";
if (sessionStorage.getItem(KEY_SESSION)) { apiKeyEl.value = sessionStorage.getItem(KEY_SESSION); rememberKey.checked = true; }
apiKeyEl.addEventListener("input", () => { if (rememberKey.checked) sessionStorage.setItem(KEY_SESSION, apiKeyEl.value); });
rememberKey.addEventListener("change", () => {
  if (rememberKey.checked) sessionStorage.setItem(KEY_SESSION, apiKeyEl.value);
  else sessionStorage.removeItem(KEY_SESSION);
});
generateBtn.addEventListener("click", async () => {
  const apiKey = apiKeyEl.value.trim();
  if (!apiKey) { showToast("APIキーを入力してください"); apiKeyEl.focus(); return; }
  generateBtn.disabled = true;
  const original = generateBtn.textContent;
  generateBtn.innerHTML = '<span class="spinner"></span> 生成中…（20〜60秒）';
  try {
    const md = await generateText({ apiKey, model: modelSelect.value, prompt: def.buildPrompt(ctx()) });
    resultText.value = md;
    resultDirty = true;
    resultRendered.style.display = "block";
    document.getElementById("toggleRenderBtn").textContent = "整形表示を閉じる";
    renderResultPreview();
    await setStepData(code, step, "result", md, myName);
    resultDirty = false;
    showToast("生成して保存しました");
  } catch (e) {
    showToast(e.message || String(e), 4000);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = original;
  }
});

// ---- Export (all steps) ----
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
function buildExportMarkdown() {
  const c = ctx();
  const lines = [`# ${room?.title || "研修セッション"}（${code}）`, `${formatDate(room?.scheduledAt)} ・ 主催: ${room?.hostName || ""}`, ""];
  // Step 1
  lines.push(`## 工程1: ${STEP1.title}`);
  for (const cat of ["customer", "competitor", "company"]) {
    const list = c.notes3c.filter(n => n.category === cat);
    const label = { customer: "顧客", competitor: "競合", company: "自社" }[cat];
    lines.push(`### ${label}の付箋（${list.length}枚）`);
    for (const n of list) lines.push(`- [${n.sub}] ${n.text}（${n.authorName || ""}）`);
  }
  pushData(1);
  for (const s of STEPS) {
    lines.push("", `## 工程${s.id}: ${s.title}`);
    const list = c.stepNotes(s.id);
    lines.push(`### 付箋（${list.length}枚）`);
    for (const col of s.columns) {
      const cl = list.filter(n => n.category === col.key);
      if (!cl.length) continue;
      lines.push(`#### ${col.label}`);
      for (const n of cl) lines.push(`- [${n.sub}] ${n.text}（${n.authorName || ""}）`);
    }
    pushData(s.id);
  }
  function pushData(id) {
    const r = c.data(id, "result"), d = c.data(id, "decision");
    if (r) lines.push(`### AIの結果`, r);
    if (d) lines.push(`### 決定事項`, d);
  }
  return lines.join("\n");
}
document.getElementById("exportMdBtn").addEventListener("click", () => {
  download(new Blob([buildExportMarkdown()], { type: "text/markdown;charset=utf-8" }), `kenshu-${code}.md`);
});
document.getElementById("exportJsonBtn").addEventListener("click", () => {
  const payload = { room, notes3c: listNotes(code), stepNotes: listStepNotes(code), stepData: dataMap };
  download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `kenshu-${code}.json`);
});
