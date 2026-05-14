import {
  getRoomAsync, subscribeNotes, subscribeParticipants
} from "./store.js";
import {
  CATEGORIES, getQuery, showToast, escapeHtml, formatDate
} from "./common.js";
import {
  generateValueProp, MODELS, DEFAULT_MODEL
} from "./claude-client.js";

const code = getQuery("code").toUpperCase();
if (!/^[A-Z0-9]{6}$/.test(code)) location.href = "/admin.html";

const room = await getRoomAsync(code);
if (!room) {
  alert("このセッション部屋は存在しません。");
  location.href = "/admin.html";
}

const sCode    = document.getElementById("sCode");
const sPeople  = document.getElementById("sPeople");
const sNotes   = document.getElementById("sNotes");
const sUpdated = document.getElementById("sUpdated");
const sTitleEl = document.getElementById("seminarTitle");
const kwBars   = document.getElementById("kwBars");
const clusters = document.getElementById("clusters");
const tabs     = document.getElementById("catTabs");
const apiKeyEl = document.getElementById("apiKey");
const rememberKey = document.getElementById("rememberKey");
const modelSelect = document.getElementById("modelSelect");
const generateBtn = document.getElementById("generateBtn");
const aiOutput    = document.getElementById("aiOutput");
const copyOutBtn  = document.getElementById("copyOutBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const exportCsvBtn  = document.getElementById("exportCsvBtn");

sCode.textContent = code;
if (sTitleEl && room) {
  sTitleEl.textContent = room.title || "(無題)";
  const meta = document.getElementById("seminarMeta");
  if (meta) meta.textContent = `${formatDate(room.scheduledAt)} ・ 主催: ${room.hostName || ""}`;
}

// Populate model dropdown.
for (const m of MODELS) {
  const opt = document.createElement("option");
  opt.value = m.id; opt.textContent = m.label;
  if (m.id === DEFAULT_MODEL) opt.selected = true;
  modelSelect.appendChild(opt);
}

// Restore session key if present.
const KEY_SESSION = "c3live.sessionApiKey";
if (sessionStorage.getItem(KEY_SESSION)) {
  apiKeyEl.value = sessionStorage.getItem(KEY_SESSION);
  rememberKey.checked = true;
}
apiKeyEl.addEventListener("input", () => {
  if (rememberKey.checked) sessionStorage.setItem(KEY_SESSION, apiKeyEl.value);
});
rememberKey.addEventListener("change", () => {
  if (rememberKey.checked) sessionStorage.setItem(KEY_SESSION, apiKeyEl.value);
  else sessionStorage.removeItem(KEY_SESSION);
});

// ==== State ====
let allNotes = [];
let currentCat = "customer";

tabs.addEventListener("click", e => {
  const btn = e.target.closest("button[data-cat]");
  if (!btn) return;
  currentCat = btn.dataset.cat;
  tabs.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
  renderAnalysis();
});

// ==== Keyword extraction & clustering (must be declared BEFORE subscribeNotes) ====
const STOPWORDS = new Set([
  "こと","もの","ため","よう","それ","これ","あれ","ここ","そこ","あそこ",
  "する","いる","ある","なる","できる","ない","です","ます","して","しない",
  "とき","場合","方","方法","お","ご","だ","の","は","が","を","に","へ","と","で","から","まで","より","も","や","か","ね","よ","わ","ぞ","な"
]);

function normalize(text) {
  return String(text).normalize("NFKC")
    .replace(/[、。!！?？.,「」『』()（）\[\]【】<>《》"'`~^]/g, " ")
    .replace(/\s+/g, " ").trim();
}
function tokenize(text) {
  const norm = normalize(text);
  if (!norm) return [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    try {
      const seg = new Intl.Segmenter("ja", { granularity: "word" });
      const out = [];
      for (const s of seg.segment(norm)) {
        if (!s.isWordLike) continue;
        const t = s.segment.trim();
        if (t.length < 2) continue;
        if (STOPWORDS.has(t)) continue;
        out.push(t);
      }
      if (out.length) return out;
    } catch {}
  }
  const re = /([\p{Script=Katakana}ー]+|[A-Za-z][A-Za-z0-9]*|\p{Script=Han}{2,}|\p{Script=Hiragana}{3,})/gu;
  const out = [];
  for (const m of norm.matchAll(re)) {
    const t = m[0];
    if (t.length < 2) continue;
    if (STOPWORDS.has(t)) continue;
    out.push(t);
  }
  return out;
}
function topKeywords(notes, n = 15) {
  const freq = new Map();
  for (const note of notes) {
    const seen = new Set();
    for (const t of tokenize(note.text)) {
      if (seen.has(t)) continue;
      seen.add(t);
      freq.set(t, (freq.get(t) || 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
function clusterNotes(notes) {
  if (notes.length === 0) return [];
  const tokens = notes.map(n => new Set(tokenize(n.text)));
  const parent = notes.map((_, i) => i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const A = tokens[i], B = tokens[j];
      if (!A.size || !B.size) continue;
      let inter = 0; for (const t of A) if (B.has(t)) inter++;
      const uni = A.size + B.size - inter;
      const jacc = uni ? inter / uni : 0;
      if (jacc >= 0.34) union(i, j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < notes.length; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(notes[i]);
  }
  return [...groups.values()].filter(g => g.length >= 2).sort((a, b) => b.length - a.length);
}

// ==== Render ====
function renderAnalysis() {
  const notes = allNotes.filter(n => n.category === currentCat);
  const kws = topKeywords(notes, 15);
  if (!kws.length) {
    kwBars.innerHTML = '<div class="empty-state">この分類の付箋はまだありません。</div>';
  } else {
    const max = kws[0][1];
    kwBars.innerHTML = kws.map(([w, c]) => `
      <div class="kw-row">
        <div class="kw-label" title="${escapeHtml(w)}">${escapeHtml(w)}</div>
        <div class="bar"><span style="width:${(c / max) * 100}%"></span></div>
        <div class="kw-count">${c}</div>
      </div>
    `).join("");
  }

  const cgs = clusterNotes(notes);
  if (!cgs.length) {
    clusters.innerHTML = '<div class="empty-state">類似する付箋のグループは見つかりませんでした。</div>';
  } else {
    clusters.innerHTML = cgs.map(g => {
      const tally = new Map();
      for (const n of g) for (const t of tokenize(n.text)) tally.set(t, (tally.get(t) || 0) + 1);
      const topTerms = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
      return `
        <div class="cluster-card">
          <div class="cluster-title">${escapeHtml(topTerms.join(" / ") || "グループ")} <span style="color:var(--subtle);font-weight:600;">（${g.length}件）</span></div>
          <div class="cluster-notes">
            ${g.map(n => `<div>・${escapeHtml(n.text)} <span style="color:var(--subtle);font-size:11px;">— ${escapeHtml(n.authorName || "")}</span></div>`).join("")}
          </div>
        </div>
      `;
    }).join("");
  }
}

// ==== Subscriptions (after renderAnalysis is defined) ====
subscribeNotes(code, notes => {
  allNotes = [...notes].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  sNotes.textContent = allNotes.length;
  sUpdated.textContent = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  try { renderAnalysis(); }
  catch (e) { console.error("[analyze] renderAnalysis failed:", e); }
});
subscribeParticipants(code, parts => {
  sPeople.textContent = parts.length;
});

// ==== AI generation ====
generateBtn.addEventListener("click", async () => {
  const apiKey = apiKeyEl.value.trim();
  if (!apiKey) { showToast("APIキーを入力してください"); apiKeyEl.focus(); return; }
  if (allNotes.length === 0) { showToast("まだ付箋がありません"); return; }

  generateBtn.disabled = true;
  const original = generateBtn.textContent;
  generateBtn.innerHTML = '<span class="spinner"></span> 生成中…（10〜30秒）';
  aiOutput.textContent = "";

  const groupTexts = {
    customer:   allNotes.filter(n => n.category === "customer").map(n => `[${n.sub}] ${n.text}`),
    competitor: allNotes.filter(n => n.category === "competitor").map(n => `[${n.sub}] ${n.text}`),
    company:    allNotes.filter(n => n.category === "company").map(n => `[${n.sub}] ${n.text}`)
  };

  try {
    const md = await generateValueProp({
      apiKey, model: modelSelect.value, notes: groupTexts, title: room?.title
    });
    aiOutput.innerHTML = renderMarkdown(md);
  } catch (e) {
    aiOutput.innerHTML = `<div style="color:var(--red);">${escapeHtml(e.message || String(e))}</div>`;
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = original;
  }
});

copyOutBtn.addEventListener("click", async () => {
  const t = aiOutput.innerText;
  if (!t.trim()) { showToast("コピーする内容がありません"); return; }
  try { await navigator.clipboard.writeText(t); showToast("コピーしました"); }
  catch { showToast("コピーに失敗しました"); }
});

// ===== Build & copy a marketing-analysis prompt (for Claude.ai / ChatGPT) =====
function buildClaudePrompt() {
  const groupBySub = (cat) => {
    const notes = allNotes.filter(n => n.category === cat);
    const bySub = new Map();
    for (const n of notes) {
      if (!bySub.has(n.sub)) bySub.set(n.sub, []);
      bySub.get(n.sub).push(n.text);
    }
    if (bySub.size === 0) return "（データなし）";
    return [...bySub.entries()].map(([sub, texts]) =>
      `### ${sub}\n` + texts.map(t => `- ${t}`).join("\n")
    ).join("\n\n");
  };

  const title = room?.title || "（無題のセッション）";
  const host  = room?.hostName || "";
  const dateStr = room?.scheduledAt ? formatDate(room.scheduledAt) : "";

  return `あなたは経営戦略・マーケティングのトップコンサルタントです。
以下は 3C 分析ワークショップで参加者から集めた付箋データです。
このデータをもとに、**未来バリュープロポジション**（数年後の市場を見据えた、競合が真似しにくく、顧客が強く求め、自社のリソースで実現可能な独自価値）を **3案** 提案してください。

# セッション情報
- セッション名: ${title}${host ? `\n- 主催者: ${host}` : ""}${dateStr ? `\n- 開催日時: ${dateStr}` : ""}
- 参加者付箋数: ${allNotes.length}件

# 顧客（Customer）からの声
${groupBySub("customer")}

# 競合（Competitor）の印象・特徴
${groupBySub("competitor")}

# 自社（Company）のリソース・挑戦したいこと
${groupBySub("company")}

---

# 出力フォーマット（Markdown）

## 案 N: 〔キャッチーな提案名〕
- **ターゲット顧客**: …
- **独自価値**: …
- **根拠（3Cからの読み解き）**:
  - 顧客: …
  - 競合: …
  - 自社: …
- **すぐ取れる3つのアクション**:
  1. …
  2. …
  3. …

## 総合考察
3案を貫く戦略的方向性と次の一歩を 4〜6 行で。

日本語で、優秀なマーケターらしい鋭い洞察を含めて書いてください。`;
}

const copyPromptBtn = document.getElementById("copyPromptBtn");
if (copyPromptBtn) {
  copyPromptBtn.addEventListener("click", async () => {
    if (allNotes.length === 0) { showToast("まだ付箋がありません"); return; }
    const prompt = buildClaudePrompt();
    try {
      await navigator.clipboard.writeText(prompt);
      showToast("プロンプトをコピーしました。Claude.ai に貼り付けてください。", 3000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = prompt; document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); showToast("プロンプトをコピーしました。"); }
      catch { showToast("コピーに失敗しました"); }
      ta.remove();
    }
  });
}

function renderMarkdown(md) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let inList = null;
  const closeList = () => { if (inList) { out.push(`</${inList}>`); inList = null; } };
  for (let line of lines) {
    line = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (h)        { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); }
    else if (ul)  { if (inList !== "ul") { closeList(); out.push("<ul>"); inList = "ul"; } out.push(`<li>${inline(ul[1])}</li>`); }
    else if (ol)  { if (inList !== "ol") { closeList(); out.push("<ol>"); inList = "ol"; } out.push(`<li>${inline(ol[1])}</li>`); }
    else if (line.trim() === "") { closeList(); }
    else          { closeList(); out.push(`<div>${inline(line)}</div>`); }
  }
  closeList();
  return out.join("\n");
  function inline(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }
}

// ==== Export ====
exportJsonBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ room, notes: allNotes }, null, 2)], { type: "application/json" });
  download(blob, `3c-${code}.json`);
});
exportCsvBtn.addEventListener("click", () => {
  const header = ["category", "sub", "text", "authorName", "createdAt"];
  const rows = [header.join(",")];
  for (const n of allNotes) {
    rows.push([n.category, n.sub, n.text, n.authorName || "", new Date(n.createdAt || 0).toISOString()].map(csvField).join(","));
  }
  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  download(blob, `3c-${code}.csv`);
});
function csvField(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
