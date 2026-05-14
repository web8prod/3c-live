import { getRoomAsync } from "./store.js";
import { getStoredName, setStoredName, getClientId, showToast } from "./common.js";

const joinNameInput = document.getElementById("joinName");
const joinCodeInput = document.getElementById("joinCode");
const joinBtn       = document.getElementById("joinRoomBtn");

const storedName = getStoredName();
if (storedName) joinNameInput.value = storedName;

joinCodeInput.addEventListener("input", () => {
  joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
});

joinBtn.addEventListener("click", async () => {
  const name = joinNameInput.value.trim();
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!name) { showToast("名前を入力してください"); joinNameInput.focus(); return; }
  if (!/^[A-Z0-9]{6}$/.test(code)) { showToast("6桁のコードを入力してください"); joinCodeInput.focus(); return; }

  joinBtn.disabled = true;
  try {
    const room = await getRoomAsync(code);
    if (!room) { showToast("その部屋は見つかりませんでした"); return; }
    setStoredName(name);
    getClientId();
    location.href = `/room.html?code=${code}`;
  } finally {
    joinBtn.disabled = false;
  }
});

// Quick-join via ?code=XXXXXX (from QR scan).
const params = new URLSearchParams(location.search);
const presetCode = params.get("code");
if (presetCode) {
  joinCodeInput.value = presetCode.toUpperCase().slice(0, 6);
  setTimeout(() => joinNameInput.focus(), 50);
}
