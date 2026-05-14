// Admin password gate. Loaded by admin.html only.
// Password "Web82525" — to change, run:
//   printf '%s' 'NEW_PASSWORD' | shasum -a 256
// then replace EXPECTED_HASH below and re-deploy.
(() => {
  const EXPECTED_HASH = "615bae72df320194b063f94638b7c69be51994131a2c2d1936339fde3ab4a3f7"; // SHA-256("Web82525")
  const SESSION_KEY = "c3live.admin.authed";

  if (sessionStorage.getItem(SESSION_KEY) === "1") return;

  // Hide page contents until authentication succeeds.
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    body > *:not(.auth-overlay) { display: none !important; }
    .auth-overlay {
      position: fixed; inset: 0; z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #15293D, #0E1C2C);
      color: #fff; padding: 20px; font-family: inherit;
    }
    .auth-card {
      background: #fff; color: #333D4A;
      border-radius: 16px; padding: 32px; max-width: 360px; width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,.35);
    }
    .auth-card h2 { color: #15293D; margin-bottom: 6px; font-size: 20px; }
    .auth-card p { color: #6B7783; font-size: 13px; margin-bottom: 18px; line-height: 1.6; }
    .auth-card input {
      width: 100%; padding: 12px 14px; border: 1.5px solid #E3E7EC;
      border-radius: 10px; font-size: 16px; outline: 0; margin-bottom: 12px;
    }
    .auth-card input:focus { border-color: #009A8C; }
    .auth-card button {
      width: 100%; padding: 12px; border: 0; border-radius: 10px;
      background: #009A8C; color: #fff; font-weight: 700; font-size: 14px;
      cursor: pointer;
    }
    .auth-card button:hover { background: #00776C; }
    .auth-error { color: #E74C3C; font-size: 13px; margin-bottom: 8px; min-height: 18px; }
  `;
  document.head.appendChild(styleEl);

  const overlay = document.createElement("div");
  overlay.className = "auth-overlay";
  overlay.innerHTML = `
    <div class="auth-card">
      <h2>管理画面ログイン</h2>
      <p>Web8 社員専用です。共有パスワードを入力してください。</p>
      <div class="auth-error" id="authError"></div>
      <input type="password" id="authPw" placeholder="パスワード" autofocus />
      <button id="authBtn">入る</button>
    </div>
  `;
  document.documentElement.appendChild(overlay);

  const pw = overlay.querySelector("#authPw");
  const btn = overlay.querySelector("#authBtn");
  const errEl = overlay.querySelector("#authError");

  async function sha256Hex(text) {
    const buf = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function tryLogin() {
    const v = pw.value;
    if (!v) { errEl.textContent = "パスワードを入力してください"; pw.focus(); return; }
    btn.disabled = true;
    try {
      const h = await sha256Hex(v);
      if (h === EXPECTED_HASH) {
        sessionStorage.setItem(SESSION_KEY, "1");
        overlay.remove();
        styleEl.remove();
      } else {
        errEl.textContent = "パスワードが違います";
        pw.value = ""; pw.focus();
      }
    } catch (e) {
      errEl.textContent = "認証エラー: " + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener("click", tryLogin);
  pw.addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
})();

// Helper invoked from admin.js logout button.
window.__c3liveAdminLogout = () => {
  sessionStorage.removeItem("c3live.admin.authed");
  location.reload();
};
