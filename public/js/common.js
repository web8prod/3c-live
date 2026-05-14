// Shared helpers used by every page.

export const CATEGORIES = [
  { key: "customer",   label: "顧客 (Customer)",
    subs: ["欲求", "不満", "不安", "不便"] },
  { key: "competitor", label: "競合 (Competitor)",
    subs: ["印象", "特徴"] },
  { key: "company",    label: "自社 (Company)",
    subs: ["挑戦したいこと", "できそうなこと", "やりたいこと",
           "経験持っているもの", "資産", "資源", "リソース", "その他"] }
];

export const MAX_CUSTOM_THEME_LEN = 16;

export function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const CLIENT_ID_KEY = "c3live.clientId";
export function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

const NAME_KEY = "c3live.name";
export function getStoredName() { return localStorage.getItem(NAME_KEY) || ""; }
export function setStoredName(name) { localStorage.setItem(NAME_KEY, name); }

export function getQuery(name) {
  return new URLSearchParams(location.search).get(name) || "";
}

export function showToast(msg, ms = 2200) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), ms);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

export function formatDate(ms) {
  if (!ms) return "未設定";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

export function formatDateOnly(ms) {
  if (!ms) return "未設定";
  const d = new Date(ms);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function relativeTime(ms) {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  return `${d}日前`;
}

// True if (catKey, sub) is one of the built-in fixed themes.
export function isFixedSub(catKey, sub) {
  const cat = CATEGORIES.find(c => c.key === catKey);
  return !!(cat && cat.subs.includes(sub));
}
