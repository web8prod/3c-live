// Add-on for the 3C analyze page (工程1): step navigation + "save the value
// proposition and go to step 2". Loaded next to analyze.js; does not touch it.
import { getRoomAsync } from "./store.js";
import { subscribeStepData, getStepDataRecord, setStepData, getCurrentStep, setCurrentStep } from "./step-store.js";
import { renderStepsNav } from "./steps-nav.js";
import { stepUrl } from "./steps.js";
import { getQuery, getStoredName, showToast, formatDate } from "./common.js";

const code = getQuery("code").toUpperCase();
if (/^[A-Z0-9]{6}$/.test(code)) {
  const room = await getRoomAsync(code);
  if (!room) throw new Error("room not found");   // analyze.js already redirects to /admin.html
  const myName = room?.hostName || getStoredName() || "主催者";

  const nav = document.getElementById("stepsNav");
  const resultEl   = document.getElementById("vpResult");
  const decisionEl = document.getElementById("vpDecision");
  const resultMeta = document.getElementById("vpResultMeta");
  const decisionMeta = document.getElementById("vpDecisionMeta");
  const nextLink = document.getElementById("goStep2Btn");
  if (nextLink) nextLink.href = stepUrl(code, 2);

  let resultDirty = false, decisionDirty = false;
  resultEl?.addEventListener("input", () => { resultDirty = true; });
  decisionEl?.addEventListener("input", () => { decisionDirty = true; });

  const meta = rec => (rec && rec.content) ? `保存済み ${formatDate(rec.updatedAt)}${rec.updatedBy ? " ・ " + rec.updatedBy : ""}` : "";

  subscribeStepData(code, map => {
    renderStepsNav(nav, { code, current: 1, liveStep: getCurrentStep(code), dataMap: map });
    const r = getStepDataRecord(code, 1, "result");
    const d = getStepDataRecord(code, 1, "decision");
    if (resultEl && !resultDirty) resultEl.value = r?.content || "";
    if (decisionEl && !decisionDirty) decisionEl.value = d?.content || "";
    if (resultMeta) resultMeta.textContent = meta(r);
    if (decisionMeta) decisionMeta.textContent = meta(d);
  });

  document.getElementById("saveVpResultBtn")?.addEventListener("click", async () => {
    try { await setStepData(code, 1, "result", resultEl.value.trim(), myName); resultDirty = false; showToast("AIの結果を保存しました"); }
    catch (e) { console.error(e); showToast("保存に失敗しました: " + (e.message || e)); }
  });
  document.getElementById("saveVpDecisionBtn")?.addEventListener("click", async () => {
    try { await setStepData(code, 1, "decision", decisionEl.value.trim(), myName); decisionDirty = false; showToast("決定事項を保存しました"); }
    catch (e) { console.error(e); showToast("保存に失敗しました: " + (e.message || e)); }
  });

  const pushBtn = document.getElementById("pushStep1Btn");
  pushBtn?.addEventListener("click", async () => {
    try { await setCurrentStep(code, 1, myName); showToast("参加者の画面を3Cボードに戻しました"); }
    catch (e) { console.error(e); showToast("失敗しました: " + (e.message || e)); }
  });

  // When the API path on this page produces output, offer it as the result.
  const aiOutput = document.getElementById("aiOutput");
  if (aiOutput && resultEl) {
    new MutationObserver(() => {
      if (aiOutput.querySelector('[style*="--red"]')) return;   // analyze.js renders API errors in red
      const t = aiOutput.innerText.trim();
      if (t && !resultEl.value.trim()) { resultEl.value = t; resultDirty = true; }
    }).observe(aiOutput, { childList: true, subtree: true });
  }
}
