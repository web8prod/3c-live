// Supabase-backed data store. Replaces the previous Firestore implementation.
// Keeps the same exported API so the rest of the app stays unchanged.
//
// Public reads & writes go through the anon "publishable" key. The actual
// access boundary is the admin password (auth-guard.js) and the per-room
// hostToken kept in the creator's localStorage.
//
// Sync getters (listRooms, listNotes, listParticipants, getRoom) read from
// an in-memory cache populated by Supabase Realtime subscriptions. Pages that
// need a value at first paint should `await getRoomAsync(code)`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } }
});

// ===== Field name mapping (DB snake_case ↔ JS camelCase) =====
function roomFromRow(r) {
  if (!r) return null;
  return {
    code:        r.code,
    title:       r.title,
    scheduledAt: r.scheduled_at,
    hostName:    r.host_name,
    memo:        r.memo,
    status:      r.status,
    hostToken:   r.host_token,
    createdAt:   r.created_at
  };
}
function roomToRow(o) {
  const row = {};
  if (o.code        !== undefined) row.code         = o.code;
  if (o.title       !== undefined) row.title        = o.title;
  if (o.scheduledAt !== undefined) row.scheduled_at = o.scheduledAt;
  if (o.hostName    !== undefined) row.host_name    = o.hostName;
  if (o.memo        !== undefined) row.memo         = o.memo;
  if (o.status      !== undefined) row.status       = o.status;
  if (o.hostToken   !== undefined) row.host_token   = o.hostToken;
  if (o.createdAt   !== undefined) row.created_at   = o.createdAt;
  return row;
}
function noteFromRow(r) {
  if (!r) return null;
  return {
    id:              r.id,
    category:        r.category,
    sub:             r.sub,
    text:            r.text,
    authorName:      r.author_name,
    authorClientId:  r.author_client_id,
    createdAt:       r.created_at,
    updatedAt:       r.updated_at
  };
}
function noteToRow(o, code) {
  const row = {};
  if (code !== undefined)                  row.room_code        = code;
  if (o.id !== undefined)                  row.id               = o.id;
  if (o.category !== undefined)            row.category         = o.category;
  if (o.sub !== undefined)                 row.sub              = o.sub;
  if (o.text !== undefined)                row.text             = o.text;
  if (o.authorName !== undefined)          row.author_name      = o.authorName;
  if (o.authorClientId !== undefined)      row.author_client_id = o.authorClientId;
  if (o.createdAt !== undefined)           row.created_at       = o.createdAt;
  if (o.updatedAt !== undefined)           row.updated_at       = o.updatedAt;
  return row;
}
function partFromRow(r) {
  if (!r) return null;
  return {
    clientId:   r.client_id,
    name:       r.name,
    joinedAt:   r.joined_at,
    lastSeenAt: r.last_seen_at
  };
}

// ===== Host token management (admin-side only) =====
const HOST_TOKENS_KEY = "c3live.hostTokens";
function readHostTokens() {
  try { return JSON.parse(localStorage.getItem(HOST_TOKENS_KEY) || "{}"); }
  catch { return {}; }
}
function writeHostTokens(map) {
  localStorage.setItem(HOST_TOKENS_KEY, JSON.stringify(map));
}
export function getHostToken(code) { return readHostTokens()[code] || null; }
function setHostToken(code, token) {
  const m = readHostTokens(); m[code] = token; writeHostTokens(m);
}
function generateHostToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ===== Caches =====
const roomCache  = {};  // { code: room }
const notesCache = {};  // { code: [note] }
const partsCache = {};  // { code: [participant] }

const roomsListeners = new Set();
const notesListeners = {};  // { code: Set<cb> }
const partsListeners = {};

let roomsChannelInit = false;
const noteChannels = {};
const partChannels = {};

// ===== Rooms =====
async function loadAllRoomsOnce() {
  const { data, error } = await supabase.from("rooms").select("*");
  if (error) { console.error("[rooms] initial load failed:", error); return; }
  for (const k in roomCache) delete roomCache[k];
  for (const row of (data || [])) roomCache[row.code] = roomFromRow(row);
}

function ensureRoomsChannel() {
  if (roomsChannelInit) return;
  roomsChannelInit = true;
  supabase
    .channel("rooms-rt")
    .on("postgres_changes",
        { event: "*", schema: "public", table: "rooms" },
        payload => {
          const ev = payload.eventType;
          if (ev === "DELETE") {
            const code = payload.old?.code;
            if (code) delete roomCache[code];
          } else {
            const r = roomFromRow(payload.new);
            if (r) roomCache[r.code] = r;
          }
          const arr = listRooms();
          roomsListeners.forEach(cb => { try { cb(arr); } catch (e) { console.error(e); } });
        })
    .subscribe();
}

export function listRooms() {
  return Object.values(roomCache)
    .filter(r => r.status !== "archived")
    .sort((a, b) => (b.scheduledAt || 0) - (a.scheduledAt || 0));
}

export function getRoom(code) {
  return roomCache[code] || null;
}

export async function getRoomAsync(code) {
  if (roomCache[code]) return roomCache[code];
  const { data, error } = await supabase
    .from("rooms").select("*").eq("code", code).maybeSingle();
  if (error) { console.error("[getRoomAsync]", error); return null; }
  if (!data) return null;
  const r = roomFromRow(data);
  roomCache[code] = r;
  return r;
}

export async function createRoom(room) {
  const token = generateHostToken();
  setHostToken(room.code, token);
  const payload = roomToRow({
    ...room,
    hostToken: token,
    status: room.status || "active",
    createdAt: room.createdAt || Date.now()
  });
  const { data, error } = await supabase.from("rooms").insert(payload).select().single();
  if (error) throw error;
  const r = roomFromRow(data);
  roomCache[r.code] = r;
  return r;
}

export async function updateRoom(code, patch) {
  const token = getHostToken(code);
  if (!token) { console.warn("[updateRoom] no host token for", code); return null; }
  const payload = roomToRow(patch);
  // Match the hostToken: only the original creator can update.
  const { data, error } = await supabase
    .from("rooms")
    .update(payload)
    .eq("code", code)
    .eq("host_token", token)
    .select()
    .maybeSingle();
  if (error) { console.warn("[updateRoom]", error); return null; }
  if (data) {
    const r = roomFromRow(data);
    roomCache[code] = r;
    return r;
  }
  return null;
}

export async function deleteRoom(code) {
  // Soft delete to keep notes/participants for later analysis.
  return updateRoom(code, { status: "archived" });
}

export function subscribeRooms(cb) {
  roomsListeners.add(cb);
  // Fire cached state immediately, then ensure realtime + initial load.
  cb(listRooms());
  ensureRoomsChannel();
  loadAllRoomsOnce().then(() => {
    cb(listRooms());
  });
  return () => roomsListeners.delete(cb);
}

// ===== Notes =====
async function loadNotesOnce(code) {
  const { data, error } = await supabase
    .from("notes").select("*").eq("room_code", code)
    .order("created_at", { ascending: true });
  if (error) { console.error("[notes] load failed:", error); return; }
  notesCache[code] = (data || []).map(noteFromRow);
}

function ensureNotesChannel(code) {
  if (noteChannels[code]) return;
  noteChannels[code] = supabase
    .channel(`notes-rt-${code}`)
    .on("postgres_changes",
        { event: "*", schema: "public", table: "notes", filter: `room_code=eq.${code}` },
        payload => {
          const list = notesCache[code] = (notesCache[code] || []).slice();
          if (payload.eventType === "INSERT") {
            const n = noteFromRow(payload.new);
            if (!list.some(x => x.id === n.id)) list.push(n);
          } else if (payload.eventType === "UPDATE") {
            const n = noteFromRow(payload.new);
            const i = list.findIndex(x => x.id === n.id);
            if (i >= 0) list[i] = n; else list.push(n);
          } else if (payload.eventType === "DELETE") {
            const id = payload.old?.id;
            const idx = list.findIndex(x => x.id === id);
            if (idx >= 0) list.splice(idx, 1);
          }
          list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          notesCache[code] = list;
          (notesListeners[code] || new Set()).forEach(cb => {
            try { cb(list); } catch (e) { console.error(e); }
          });
        })
    .subscribe();
}

export function listNotes(code) {
  return notesCache[code] || [];
}

export async function addNote(code, note) {
  const now = Date.now();
  const row = noteToRow({ ...note, createdAt: now, updatedAt: now }, code);
  const { error } = await supabase.from("notes").insert(row);
  if (error) throw error;
}

export async function updateNote(code, id, patch) {
  const row = noteToRow({ ...patch, updatedAt: Date.now() });
  const { error } = await supabase.from("notes").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteNote(code, id) {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}

export function subscribeNotes(code, cb) {
  if (!notesListeners[code]) notesListeners[code] = new Set();
  notesListeners[code].add(cb);
  cb(listNotes(code));
  ensureNotesChannel(code);
  loadNotesOnce(code).then(() => cb(listNotes(code)));
  return () => notesListeners[code].delete(cb);
}

// ===== Participants =====
async function loadParticipantsOnce(code) {
  const { data, error } = await supabase
    .from("participants").select("*").eq("room_code", code);
  if (error) { console.error("[participants] load failed:", error); return; }
  partsCache[code] = (data || []).map(partFromRow);
}

function ensurePartsChannel(code) {
  if (partChannels[code]) return;
  partChannels[code] = supabase
    .channel(`parts-rt-${code}`)
    .on("postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `room_code=eq.${code}` },
        payload => {
          const list = partsCache[code] = (partsCache[code] || []).slice();
          if (payload.eventType === "DELETE") {
            const cid = payload.old?.client_id;
            const i = list.findIndex(x => x.clientId === cid);
            if (i >= 0) list.splice(i, 1);
          } else {
            const p = partFromRow(payload.new);
            const i = list.findIndex(x => x.clientId === p.clientId);
            if (i >= 0) list[i] = p; else list.push(p);
          }
          partsCache[code] = list;
          (partsListeners[code] || new Set()).forEach(cb => {
            try { cb(list); } catch (e) { console.error(e); }
          });
        })
    .subscribe();
}

export function listParticipants(code) {
  return partsCache[code] || [];
}

export async function setParticipant(code, p) {
  const id = p.clientId;
  if (!id) return;
  const now = Date.now();
  // Update first (don't touch joined_at on heartbeats). If 0 rows updated,
  // insert as new participant.
  const { data: updated, error: upErr } = await supabase
    .from("participants")
    .update({ name: p.name || "", last_seen_at: now })
    .eq("room_code", code)
    .eq("client_id", id)
    .select();
  if (upErr) { console.warn("[setParticipant update]", upErr); return; }
  if (updated && updated.length > 0) return; // already existed

  const { error: insErr } = await supabase
    .from("participants")
    .upsert(
      { room_code: code, client_id: id, name: p.name || "",
        joined_at: now, last_seen_at: now },
      { onConflict: "room_code,client_id", ignoreDuplicates: true }
    );
  if (insErr) console.warn("[setParticipant insert]", insErr);
}

export function subscribeParticipants(code, cb) {
  if (!partsListeners[code]) partsListeners[code] = new Set();
  partsListeners[code].add(cb);
  cb(listParticipants(code));
  ensurePartsChannel(code);
  loadParticipantsOnce(code).then(() => cb(listParticipants(code)));
  return () => partsListeners[code].delete(cb);
}
