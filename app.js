// === CONFIG ===
// Pon aquí la URL base de tu backend InfinityFree
// const API_BASE = "https://album-boda.free.nf/api";
const API_BASE = "http://localhost/photos/backend/api";

// Identificador simple por dispositivo (si luego haces login, esto se reemplaza)
let userKey = localStorage.getItem("album_user_key");
if (!userKey) {
  userKey = (crypto?.randomUUID?.() || String(Date.now()) + Math.random()).replace(/[^a-zA-Z0-9_-]/g, "");
  localStorage.setItem("album_user_key", userKey);
}

const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const toast = document.getElementById("toast");

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const cameraRow = document.getElementById("cameraRow");

const btnCamera = document.getElementById("btnCamera");
const btnSnap = document.getElementById("btnSnap");
const btnCloseCam = document.getElementById("btnCloseCam");
const btnReload = document.getElementById("btnReload");
const btnUpload = document.getElementById("btnUpload");
const filePick = document.getElementById("filePick");

let stream = null;

function showToast(msg) {
  toast.textContent = msg;
  toast.style.display = "block";
  setTimeout(() => toast.style.display = "none", 2200);
}

function setBusy(isBusy) {
  btnCamera.disabled = isBusy;
  btnSnap.disabled = isBusy;
  btnReload.disabled = isBusy;
  btnUpload.disabled = isBusy;
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Tu navegador no soporta cámara.");
    return;
  }
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false
  });

  video.srcObject = stream;
  video.style.display = "block";
  cameraRow.style.display = "flex";
}

function closeCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.srcObject = null;
  video.style.display = "none";
  cameraRow.style.display = "none";
}

async function captureToBlob() {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("La cámara aún no está lista.");

  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(video, 0, 0, w, h);

  const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.9));
  if (!blob) throw new Error("No se pudo crear la foto.");
  return blob;
}

async function uploadBlob(blob) {
  const fd = new FormData();
  fd.append("photo", blob, `camera_${Date.now()}.jpg`);
  fd.append("user_key", userKey);

  const r = await fetch(`${API_BASE}/upload.php`, { method: "POST", body: fd });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) {
    throw new Error(data.error || "Error subiendo la foto.");
  }
  return data;
}

function addImageCard(url) {
  const card = document.createElement("div");
  card.className = "card";
  const img = document.createElement("img");
  img.loading = "lazy";
  img.src = url;
  card.appendChild(img);
  grid.appendChild(card);
}

async function loadGallery() {
  setBusy(true);
  grid.innerHTML = "";
  empty.style.display = "none";

  const r = await fetch(`${API_BASE}/list.php?user_key=${encodeURIComponent(userKey)}`);
  const data = await r.json();
  const ids = data?.ids || [];

  if (!ids.length) {
    empty.style.display = "block";
    setBusy(false);
    return;
  }

  // Pedimos urls una por una (simple). Si quieres, luego lo optimizamos con un endpoint batch.
  for (const file_id of ids) {
    try {
      const u = await fetch(`${API_BASE}/get_url.php?file_id=${encodeURIComponent(file_id)}`);
      const j = await u.json();
      if (j?.url) addImageCard(j.url);
    } catch {}
  }

  setBusy(false);
}

btnCamera.onclick = async () => {
  try {
    await openCamera();
  } catch (e) {
    alert("No se pudo abrir la cámara: " + e.message);
  }
};

btnCloseCam.onclick = () => closeCamera();

btnSnap.onclick = async () => {
  try {
    setBusy(true);
    const blob = await captureToBlob();
    await uploadBlob(blob);
    showToast("✅ Foto subida");
    closeCamera();
    await loadGallery();
  } catch (e) {
    alert(e.message);
  } finally {
    setBusy(false);
  }
};

btnReload.onclick = loadGallery;

// Subir desde archivo (galería)
btnUpload.onclick = () => filePick.click();
filePick.onchange = async () => {
  const file = filePick.files?.[0];
  if (!file) return;
  try {
    setBusy(true);
    await uploadBlob(file);
    showToast("✅ Foto subida");
    await loadGallery();
  } catch (e) {
    alert(e.message);
  } finally {
    filePick.value = "";
    setBusy(false);
  }
};

loadGallery();
