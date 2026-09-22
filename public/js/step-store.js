// Data store for the training steps 2〜8 (工程2〜8).
// Uses the same Supabase client / Realtime socket as store.js.
//
// Two storage backends, chosen automatically at runtime:
//
//   native : tables step_notes / step_data exist (supabase-migration-steps.sql was run)
//   legacy : the migration has NOT been run. Everything is stored in the existing
//            tables without any schema change:
//              - step notes → `notes` rows in a hidden child room (status 'archived',
//                so it never shows in the admin list); sub = "step|column|theme"
//              - step data  → JSON in that child room's `memo` column
//            The 3C pages never read the child room, so the 3C flow is unaffected.
//
// Public API is identical in both modes. Same conventions as store.js: sync list
// getters read an in-memory cache that Realtime keeps fresh; subscribe*() fires
// immediately with cached state, then again once the initial load finished.

import { supabase } from "./store.js";

// ===== Backend detection =====
let mode = null;          // "native" | "legacy"
let modePromise = null;

function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const msg = String(error.message || "");
  return code === "42P01" || code === "PGRST205" ||
         /schema cache|does not exist/i.test(msg);
}

export async function detectMode() {
  if (mode) return mode;
  if (!modePromise) {
    modePromise = (async () => {
      const { error } = await supabase.from("step_data").select("room_code").limit(1);
      mode = (error && isMissingTable(error)) ? "legacy" : "native";
      if (mode === "legacy") console.info("[step-store] step tables not found → storing in existing tables (legacy mode)");
      return mode;
    })();
  }
  return modePromise;
}
export function getMode() { return mode; }

// ===== Legacy helpers (hidden child room per session) =====
const CHILD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const childTitle = parent => `§steps:${parent}`;

function hashCode6(str) {
  // FNV-1a 32bit → 6 chars of the room-code alphabet (30 bits)
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  let out = "";
  for (let i = 0; i < 6; i++) { out += CHILD_ALPHABET[h & 31]; h >>>= 5; }
  return out;
}

const childCache = {};   // parent → child code
const childPromises = {};

/**
 * Resolve the hidden child room code for a parent room.
 * Readers call this with create=false: they never create anything, so opening a
 * plain 3C session leaves no trace. Writers call it with create=true.
 * Both walk the same deterministic candidate sequence (hash, hash#, hash##…), so
 * a reader that resolved before the room existed lands on the same code the
 * writer will create.
 */
async function resolveChildRoom(parent, create) {
  if (childCache[parent]) return childCache[parent];
  const key = `${parent}:${create ? "w" : "r"}`;
  if (!childPromises[key]) {
    childPromises[key] = (async () => {
      let seed = `steps:${parent}`;
      for (let attempt = 0; attempt < 4; attempt++) {
        const code = hashCode6(seed);
        const { data: existing, error } = await supabase
          .from("rooms").select("code,title").eq("code", code).maybeSingle();
        if (error) throw error;
        if (existing && existing.title !== childTitle(parent)) { seed += "#"; continue; } // real room with that code → next hash
        if (existing) { childCache[parent] = code; return code; }
        if (!create) return code;   // not created yet; readers just use the future code
        const token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, "0")).join("");
        const { error: insErr } = await supabase.from("rooms").insert({
          code, title: childTitle(parent), scheduled_at: null, host_name: "",
          memo: "{}", status: "archived", host_token: token, created_at: Date.now()
        });
        if (insErr && !/duplicate/i.test(insErr.message || "")) throw insErr;
        childCache[parent] = code;
        return code;
      }
      throw new Error("child room allocation failed");
    })().finally(() => { delete childPromises[key]; });
  }
  return childPromises[key];
}
const ensureChildRoom = parent => resolveChildRoom(parent, true);
const findChildRoom   = parent => resolveChildRoom(parent, false);

// notes.sub encoding for legacy mode: "step|column|theme" (≤ 32 chars)
const encSub = (step, category, sub) => `${step}|${category}|${sub}`;
function decSub(s) {
  const m = String(s).match(/^(\d)\|([^|]+)\|(.+)$/);
  return m ? { step: Number(m[1]), category: m[2], sub: m[3] } : null;
}

// ===== Row mapping =====
function noteFromRow(r) {
  if (!r) return null;
  let step = r.step, category = r.category, sub = r.sub;
  if (mode === "legacy") {
    const d = decSub(r.sub);
    if (!d) return null;
    step = d.step; category = d.category; sub = d.sub;
  }
  return {
    id:             r.id,
    step,
    category,
    sub,
    text:           r.text,
    authorName:     r.author_name,
    authorClientId: r.author_client_id,
    createdAt:      r.created_at,
    updatedAt:      r.updated_at
  };
}
function dataFromRow(r) {
  if (!r) return null;
  return {
    step:      r.step,
    key:       r.key,
    content:   r.content || "",
    updatedAt: r.updated_at,
    updatedBy: r.updated_by || ""
  };
}
function parseMemoMap(memo) {
  try {
    const obj = JSON.parse(memo || "{}");
    return (obj && typeof obj === "object") ? obj : {};
  } catch { return {}; }
}

// ===== Caches =====
const stepNotesCache = {};   // { code: [note] }  (all steps of the room)
const stepDataCache  = {};   // { code: { "step:key": data } }
const noteListeners  = {};
const dataListeners  = {};
const noteChannels   = {};
const dataChannels   = {};
const dkey = (step, key) => `${step}:${key}`;

// ===== Step notes =====
async function loadStepNotesOnce(code) {
  await detectMode();
  let q;
  if (mode === "native") {
    q = supabase.from("step_notes").select("*").eq("room_code", code);
  } else {
    const child = await findChildRoom(code);
    q = supabase.from("notes").select("*").eq("room_code", child);
  }
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) { console.error("[step_notes] load failed:", error); return; }
  stepNotesCache[code] = (data || []).map(noteFromRow).filter(Boolean);
}

function notifyNotes(code) {
  const list = listStepNotes(code);
  (noteListeners[code] || new Set()).forEach(cb => {
    try { cb(list); } catch (e) { console.error(e); }
  });
}

function applyNoteEvent(code, payload) {
  const list = stepNotesCache[code] = (stepNotesCache[code] || []).slice();
  if (payload.eventType === "DELETE") {
    const id = payload.old?.id;
    const i = list.findIndex(x => x.id === id);
    if (i >= 0) list.splice(i, 1);
  } else {
    const n = noteFromRow(payload.new);
    if (!n) return;
    const i = list.findIndex(x => x.id === n.id);
    if (i >= 0) list[i] = n; else list.push(n);
  }
  list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  stepNotesCache[code] = list;
  notifyNotes(code);
}

async function ensureNotesChannel(code) {
  if (noteChannels[code]) return;
  noteChannels[code] = true;
  await detectMode();
  const table = mode === "native" ? "step_notes" : "notes";
  const roomCode = mode === "native" ? code : await findChildRoom(code);
  noteChannels[code] = supabase
    .channel(`step-notes-rt-${code}`)
    .on("postgres_changes",
        { event: "*", schema: "public", table, filter: `room_code=eq.${roomCode}` },
        payload => applyNoteEvent(code, payload))
    .subscribe();
}

/** All step notes of the room (every step). Filter by `step` yourself. */
export function listStepNotes(code, step) {
  const all = stepNotesCache[code] || [];
  return step == null ? all : all.filter(n => n.step === step);
}

export async function addStepNote(code, step, note) {
  await detectMode();
  const now = Date.now();
  const base = {
    text: note.text, author_name: note.authorName, author_client_id: note.authorClientId,
    created_at: now, updated_at: now
  };
  let row;
  if (mode === "native") {
    row = { ...base, room_code: code, step, category: note.category, sub: note.sub };
    const { error } = await supabase.from("step_notes").insert(row);
    if (error) throw error;
  } else {
    const child = await ensureChildRoom(code);
    row = { ...base, room_code: child, category: "company", sub: encSub(step, note.category, note.sub) };
    const { error } = await supabase.from("notes").insert(row);
    if (error) throw error;
  }
}

export async function updateStepNote(code, id, patch) {
  await detectMode();
  const row = { updated_at: Date.now() };
  if (patch.text !== undefined) row.text = patch.text;
  const table = mode === "native" ? "step_notes" : "notes";
  const { error } = await supabase.from(table).update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteStepNote(code, id) {
  await detectMode();
  const table = mode === "native" ? "step_notes" : "notes";
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

/** cb receives ALL step notes of the room; filter by step in the caller. */
export function subscribeStepNotes(code, cb) {
  if (!noteListeners[code]) noteListeners[code] = new Set();
  noteListeners[code].add(cb);
  cb(listStepNotes(code));
  ensureNotesChannel(code).catch(e => { delete noteChannels[code]; console.error("[step_notes] channel", e); });
  loadStepNotesOnce(code).then(() => cb(listStepNotes(code)));
  return () => noteListeners[code].delete(cb);
}

// ===== Step data (results / decisions / current step) =====
async function loadStepDataOnce(code) {
  await detectMode();
  if (mode === "native") {
    const { data, error } = await supabase.from("step_data").select("*").eq("room_code", code);
    if (error) { console.error("[step_data] load failed:", error); return; }
    const map = {};
    for (const row of (data || [])) { const d = dataFromRow(row); map[dkey(d.step, d.key)] = d; }
    stepDataCache[code] = map;
  } else {
    const child = await findChildRoom(code);
    const { data, error } = await supabase.from("rooms").select("memo").eq("code", child).maybeSingle();
    if (error) { console.error("[step_data] load failed:", error); return; }
    stepDataCache[code] = parseMemoMap(data?.memo);
  }
}

function notifyData(code) {
  const map = stepDataCache[code] || {};
  (dataListeners[code] || new Set()).forEach(cb => {
    try { cb(map, true); } catch (e) { console.error(e); }
  });
}

async function ensureDataChannel(code) {
  if (dataChannels[code]) return;
  dataChannels[code] = true;
  await detectMode();
  if (mode === "native") {
    dataChannels[code] = supabase
      .channel(`step-data-rt-${code}`)
      .on("postgres_changes",
          { event: "*", schema: "public", table: "step_data", filter: `room_code=eq.${code}` },
          payload => {
            const map = stepDataCache[code] = { ...(stepDataCache[code] || {}) };
            if (payload.eventType === "DELETE") {
              const o = payload.old || {};
              if (o.step != null && o.key) delete map[dkey(o.step, o.key)];
            } else {
              const d = dataFromRow(payload.new);
              if (d) map[dkey(d.step, d.key)] = d;
            }
            stepDataCache[code] = map;
            notifyData(code);
          })
      .subscribe();
  } else {
    const child = await findChildRoom(code);
    dataChannels[code] = supabase
      .channel(`step-data-rt-${code}`)
      .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "rooms", filter: `code=eq.${child}` },
          payload => {
            stepDataCache[code] = parseMemoMap(payload.new?.memo);
            notifyData(code);
          })
      .subscribe();
  }
}

/** Returns the saved string for (step, key), or "" when absent. */
export function getStepData(code, step, key) {
  const d = (stepDataCache[code] || {})[dkey(step, key)];
  return d ? d.content : "";
}

/** Returns the full record { content, updatedAt, updatedBy } or null. */
export function getStepDataRecord(code, step, key) {
  return (stepDataCache[code] || {})[dkey(step, key)] || null;
}

export const MAX_STEP_CONTENT = 20000;

export async function setStepData(code, step, key, content, updatedBy = "") {
  await detectMode();
  const text = String(content ?? "");
  if (text.length > MAX_STEP_CONTENT) {
    throw new Error(`${MAX_STEP_CONTENT.toLocaleString()}文字以内にしてください（現在 ${text.length.toLocaleString()}文字）`);
  }
  const rec = { step, key, content: text, updatedAt: Date.now(), updatedBy };
  if (mode === "native") {
    const { error } = await supabase.from("step_data").upsert({
      room_code: code, step, key, content: rec.content, updated_at: rec.updatedAt, updated_by: updatedBy
    }, { onConflict: "room_code,step,key" });
    if (error) throw error;
  } else {
    const child = await ensureChildRoom(code);
    // read-modify-write of the JSON map kept in the child room's memo, with an
    // optimistic check on the previous value so concurrent saves don't drop keys.
    let saved = false;
    for (let attempt = 0; attempt < 4 && !saved; attempt++) {
      const { data, error: readErr } = await supabase.from("rooms").select("memo").eq("code", child).maybeSingle();
      if (readErr) throw readErr;
      const prev = (data && typeof data.memo === "string") ? data.memo : "{}";
      const map = parseMemoMap(prev);
      map[dkey(step, key)] = rec;
      const { data: updated, error } = await supabase
        .from("rooms").update({ memo: JSON.stringify(map) })
        .eq("code", child).eq("memo", prev).select();
      if (error) throw error;
      saved = !!(updated && updated.length);
    }
    if (!saved) throw new Error("同時に保存されたため失敗しました。もう一度お試しください");
  }
  // Optimistic local update so the UI reflects the save even before Realtime echoes it.
  const map = stepDataCache[code] = { ...(stepDataCache[code] || {}) };
  map[dkey(step, key)] = rec;
  notifyData(code);
}

/**
 * cb(map, loaded) receives { "step:key": {content, updatedAt, updatedBy} }.
 * `loaded` is false for the immediate cached call, true once the initial
 * load finished and for every Realtime change after that.
 */
export function subscribeStepData(code, cb) {
  if (!dataListeners[code]) dataListeners[code] = new Set();
  dataListeners[code].add(cb);
  cb(stepDataCache[code] || {}, false);
  ensureDataChannel(code).catch(e => { delete dataChannels[code]; console.error("[step_data] channel", e); });
  loadStepDataOnce(code).then(() => cb(stepDataCache[code] || {}, true));
  return () => dataListeners[code].delete(cb);
}

// ===== Current step (which step participants should be on) =====
export const CURRENT_STEP_KEY = "current_step";

/** 1 when nothing is set (= the original 3C board). */
export function getCurrentStep(code) {
  const v = parseInt(getStepData(code, 0, CURRENT_STEP_KEY), 10);
  return Number.isFinite(v) && v >= 1 && v <= 8 ? v : 1;
}

export async function setCurrentStep(code, step, updatedBy = "") {
  return setStepData(code, 0, CURRENT_STEP_KEY, String(step), updatedBy);
}
