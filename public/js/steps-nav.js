// Renders the 工程 1〜8 navigation pills into a container element.
// Used by analyze.html (step 1), step.html (2〜8) and board.html.
import { STEP1, STEPS, stepUrl } from "./steps.js";
import { escapeHtml } from "./common.js";

/**
 * @param {HTMLElement} el          container
 * @param {object} opts
 * @param {string} opts.code        room code
 * @param {number} opts.current     current step id
 * @param {boolean} [opts.participant]  link to participant boards instead of facilitator pages
 * @param {number} [opts.liveStep]  step currently pushed to participants (adds a "配信中" badge)
 * @param {object} [opts.dataMap]   step_data map → marks steps that have a saved result/decision
 */
export function renderStepsNav(el, opts) {
  if (!el) return;
  const all = [STEP1, ...STEPS];
  const dataMap = opts.dataMap || {};
  const done = s => !!(dataMap[`${s}:decision`]?.content || dataMap[`${s}:result`]?.content);
  el.className = "steps-nav";
  el.innerHTML = all.map(s => {
    const cls = ["steps-nav-item"];
    if (s.id === opts.current) cls.push("current");
    if (done(s.id)) cls.push("done");
    if (opts.liveStep === s.id) cls.push("live");
    return `<a class="${cls.join(" ")}" href="${escapeHtml(stepUrl(opts.code, s.id, !!opts.participant))}" title="${escapeHtml(s.title)}">
      <span class="num">${s.id}</span><span class="label">${escapeHtml(s.short)}</span>${opts.liveStep === s.id ? '<span class="live-badge">配信中</span>' : ""}
    </a>`;
  }).join("");
}
