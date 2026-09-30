// Prompt modal with manual-copy fallback (same UX as the 3C analyze page).
import { showToast } from "./common.js";

export function openPromptModal(prompt, { title = "📋 AI 分析用プロンプト" } = {}) {
  document.getElementById("promptModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "promptModal";
  modal.className = "modal-backdrop show";
  modal.innerHTML = `
    <div class="modal" style="max-width:680px;width:100%;">
      <h3>${title}</h3>
      <div class="modal-meta" style="margin-bottom:10px;">
        下のテキストを全選択（⌘+A / Ctrl+A）→ コピー（⌘+C / Ctrl+C）して、
        <a href="https://claude.ai" target="_blank" rel="noopener" style="color:var(--teal);text-decoration:underline;">claude.ai</a>
        や ChatGPT に貼り付けてください。返ってきた結果は「AIの結果」欄に貼り付けて保存すると次の工程で使えます。
      </div>
      <textarea id="promptText" readonly
        style="width:100%;height:280px;padding:12px;border:1.5px solid var(--border);border-radius:10px;font-size:13px;line-height:1.6;font-family:'SF Mono',Menlo,monospace;resize:vertical;background:#FAFBFC;"></textarea>
      <div class="modal-actions" style="margin-top:12px;justify-content:space-between;">
        <a href="https://claude.ai" target="_blank" rel="noopener" class="btn btn-outline btn-sm">🚀 Claude.ai を開く</a>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost" id="promptCloseBtn">閉じる</button>
          <button class="btn btn-teal" id="promptCopyBtn">📋 自動コピー</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const textarea = modal.querySelector("#promptText");
  textarea.value = prompt;
  setTimeout(() => { textarea.focus(); textarea.select(); }, 50);

  modal.querySelector("#promptCloseBtn").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

  modal.querySelector("#promptCopyBtn").addEventListener("click", async () => {
    let copied = false;
    try { await navigator.clipboard.writeText(prompt); copied = true; }
    catch {
      textarea.select();
      try { copied = document.execCommand("copy"); } catch {}
    }
    if (copied) showToast("✅ コピーしました。Claude.ai に貼り付けてください。", 3000);
    else {
      showToast("自動コピー失敗。上のテキストを手動で選択してコピーしてください。", 4000);
      textarea.focus(); textarea.select();
    }
  });
  return modal;
}
