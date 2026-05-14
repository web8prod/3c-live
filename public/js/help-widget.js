// Help widget — floating bottom-right button that opens a quick-help panel.
// Pure JS, no external dependencies. Loaded on every page.

const FAQ = [
  {
    keywords: ["パスワード", "ログイン", "admin", "管理画面"],
    q: "管理画面のパスワードは？",
    a: "<strong>Web82525</strong> です（W は大文字、それ以外は小文字+数字）。Web8 社員で共有してください。"
  },
  {
    keywords: ["api", "キー", "claude", "ai", "分析", "プロンプト", "claude.ai"],
    q: "AI 提案を使うのに API キーは要る？",
    a: "<strong>不要</strong>です。分析画面の緑のボタン「📋 プロンプトをコピー」を押して <a href='https://claude.ai' target='_blank' rel='noopener'>claude.ai</a> や ChatGPT の無料プランに貼り付けるだけで AI 分析できます。"
  },
  {
    keywords: ["使い方", "始め方", "ヘルプ", "わからない", "とは", "なに", "どう"],
    q: "そもそも使い方が分からない",
    a: "<a href='/help'>使い方ページ</a>に4ステップで解説してます。<br>① 管理画面でセッション作る → ② 実施画面の QR を投影 → ③ 参加者がスマホで付箋投稿 → ④ 分析画面で AI 提案。"
  },
  {
    keywords: ["qr", "コード", "参加", "入る", "受講"],
    q: "参加者はどうやって入る？",
    a: "実施画面に表示される <strong>QR コード</strong> をスマホで読み取ると、自動で受講者画面が開きます。または 6桁の参加コードを直接 <code>https://3c-live-app.vercel.app/?code=XXXXXX</code> の形で開いてもOK。"
  },
  {
    keywords: ["付箋", "削除", "編集", "消す"],
    q: "投稿した付箋を消したい",
    a: "自分が投稿した付箋にカーソルを合わせると、右上に「✎ 編集」「✕ 削除」ボタンが出ます。他人の付箋は消せません。"
  },
  {
    keywords: ["テーマ", "カスタム", "自分で", "追加"],
    q: "用意されてないテーマで付箋書きたい",
    a: "各カテゴリ列の下のほうにある「+ 自分でテーマを作って追加」ボタンを押すと、自由なテーマ名（最大16文字）で付箋を作れます。例: 「コスト感」「価格帯」「営業時間」"
  },
  {
    keywords: ["セッション", "削除", "外す", "消す", "管理"],
    q: "セッション一覧から要らないものを消したい",
    a: "管理画面でセッション行の「削除」ボタンを押すと一覧から外せます（データ本体は Supabase に残ります）。分析画面の URL <code>/analyze?code=XXXXXX</code> を直接開けば後で見ることもできます。"
  },
  {
    keywords: ["人数", "上限", "何人", "最大"],
    q: "参加者の人数に上限は？",
    a: "技術的には数百人 OK ですが、議論しやすいのは <strong>30〜50人くらい</strong>です。それ以上だとライブフィードが速く流れすぎて読みきれません。"
  },
  {
    keywords: ["料金", "無料", "値段", "コスト", "課金"],
    q: "料金はかかる？",
    a: "<strong>完全無料</strong>です。Vercel・Supabase・Claude.ai すべて無料プランで動きます。Anthropic API キーを使う場合のみ1セッション数十円ですが、緑のボタンで Claude.ai に貼り付ければ無料です。"
  },
  {
    keywords: ["オフライン", "wifi", "通信", "ネット"],
    q: "オフラインで使える？",
    a: "<strong>使えません</strong>。参加者全員がインターネット接続している必要があります。会場の Wi-Fi が不安定な場合は、各自スマホの 4G/5G を使ってもらってください。"
  },
  {
    keywords: ["url", "アドレス", "リンク"],
    q: "全画面の URL を知りたい",
    a: "本番URL: <code>https://3c-live-app.vercel.app/</code><br>" +
       "- 管理画面: <code>/admin</code>（パスワード保護）<br>" +
       "- 実施画面: <code>/host?code=XXXXXX</code><br>" +
       "- 受講者画面: <code>/?code=XXXXXX</code><br>" +
       "- 分析画面: <code>/analyze?code=XXXXXX</code>"
  }
];

// ===== Build the widget =====
(function init() {
  // Don't show on the help page itself (the user is already there).
  if (location.pathname === "/help" || location.pathname === "/help.html") return;

  // Don't show during admin password gate (would clash with overlay).
  if (sessionStorage.getItem("c3live.admin.authed") === null
      && (location.pathname === "/admin" || location.pathname === "/admin.html")) {
    // Wait until auth-guard resolves then re-init.
    const t = setInterval(() => {
      if (sessionStorage.getItem("c3live.admin.authed") === "1") {
        clearInterval(t);
        mountWidget();
      }
    }, 500);
    return;
  }
  mountWidget();
})();

function mountWidget() {
  if (document.getElementById("help-widget-btn")) return;

  const style = document.createElement("style");
  style.textContent = `
    .help-widget-btn {
      position: fixed; bottom: 20px; right: 20px; z-index: 9000;
      width: 56px; height: 56px; border-radius: 50%;
      background: var(--teal, #009A8C); color: #fff; border: 0;
      cursor: pointer; font-size: 24px;
      box-shadow: 0 6px 20px rgba(0,154,140,.4);
      display: flex; align-items: center; justify-content: center;
      transition: transform .15s;
    }
    .help-widget-btn:hover { transform: scale(1.08); }
    .help-panel {
      position: fixed; bottom: 90px; right: 20px; z-index: 9001;
      width: min(380px, calc(100vw - 40px)); max-height: 70vh;
      background: #fff; border-radius: 16px;
      box-shadow: 0 12px 40px rgba(15,28,44,.25);
      display: none; flex-direction: column; overflow: hidden;
      font-family: inherit;
    }
    .help-panel.show { display: flex; }
    .help-panel-header {
      padding: 16px; background: linear-gradient(135deg, #15293D, #0E1C2C);
      color: #fff;
    }
    .help-panel-header h3 { margin: 0; font-size: 16px; }
    .help-panel-header p { font-size: 12px; opacity: .8; margin-top: 4px; }
    .help-panel-search {
      padding: 10px 16px; border-bottom: 1px solid #E3E7EC;
    }
    .help-panel-search input {
      width: 100%; padding: 10px 12px; border: 1.5px solid #E3E7EC;
      border-radius: 8px; font-size: 14px; outline: 0;
    }
    .help-panel-search input:focus { border-color: var(--teal, #009A8C); }
    .help-panel-body {
      flex: 1; overflow-y: auto; padding: 8px;
    }
    .help-item {
      padding: 10px 12px; border-radius: 8px; cursor: pointer;
      font-size: 13px; line-height: 1.5;
      transition: background .12s;
    }
    .help-item:hover { background: #F5F7F8; }
    .help-item .q { font-weight: 600; color: #15293D; }
    .help-item .a {
      display: none;
      font-size: 13px; color: #333D4A; line-height: 1.7;
      margin-top: 8px; padding-top: 8px; border-top: 1px dashed #E3E7EC;
    }
    .help-item .a a { color: var(--teal, #009A8C); text-decoration: underline; }
    .help-item .a code { background: #F5F7F8; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
    .help-item.open .a { display: block; }
    .help-item.open { background: #FFF7E6; }
    .help-panel-footer {
      padding: 10px 16px; border-top: 1px solid #E3E7EC;
      background: #F5F7F8; text-align: center;
      font-size: 12px; color: #6B7783;
    }
    .help-panel-footer a {
      color: var(--teal, #009A8C); font-weight: 600; text-decoration: none;
    }
    .help-panel-footer a:hover { text-decoration: underline; }
    .help-empty { padding: 20px; text-align: center; color: #6B7783; font-size: 13px; }
    .help-empty a { color: var(--teal, #009A8C); font-weight: 600; }
    @media (max-width: 480px) {
      .help-panel { bottom: 80px; right: 10px; left: 10px; width: auto; }
    }
  `;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = "help-widget-btn";
  btn.className = "help-widget-btn";
  btn.title = "ヘルプ";
  btn.textContent = "💬";
  document.body.appendChild(btn);

  const panel = document.createElement("div");
  panel.className = "help-panel";
  panel.innerHTML = `
    <div class="help-panel-header">
      <h3>💬 3C Live ヘルプ</h3>
      <p>質問キーワードで検索 or 下のリストから選ぶ</p>
    </div>
    <div class="help-panel-search">
      <input id="helpSearch" type="text" placeholder="例: パスワード、QR、API キー…" autocomplete="off" />
    </div>
    <div class="help-panel-body" id="helpBody"></div>
    <div class="help-panel-footer">
      探してる答えがない？ <a href="/help" target="_blank">📖 全部の使い方ページを見る</a>
    </div>
  `;
  document.body.appendChild(panel);

  const body = panel.querySelector("#helpBody");
  const search = panel.querySelector("#helpSearch");

  function render(items) {
    if (items.length === 0) {
      body.innerHTML = `
        <div class="help-empty">
          該当する質問が見つかりません。<br>
          <a href="/help" target="_blank">📖 全部の使い方ページ</a> を見るか、<br>
          開発担当に直接ご連絡ください。
        </div>`;
      return;
    }
    body.innerHTML = items.map((item, idx) => `
      <div class="help-item" data-idx="${idx}">
        <div class="q">${escapeHtml(item.q)}</div>
        <div class="a">${item.a}</div>
      </div>
    `).join("");

    body.querySelectorAll(".help-item").forEach(el => {
      el.addEventListener("click", () => {
        el.classList.toggle("open");
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function filterFaq(query) {
    if (!query) return FAQ;
    const q = query.trim().toLowerCase();
    return FAQ.filter(item =>
      item.q.toLowerCase().includes(q) ||
      item.keywords.some(k => k.toLowerCase().includes(q) || q.includes(k.toLowerCase()))
    );
  }

  render(FAQ);

  search.addEventListener("input", () => {
    render(filterFaq(search.value));
  });

  btn.addEventListener("click", () => {
    panel.classList.toggle("show");
    if (panel.classList.contains("show")) {
      setTimeout(() => search.focus(), 100);
    }
  });

  document.addEventListener("click", (e) => {
    if (!panel.classList.contains("show")) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    panel.classList.remove("show");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("show")) {
      panel.classList.remove("show");
    }
  });
}
