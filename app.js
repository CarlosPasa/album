// === Config ===
const API_BASE = "https://backend-album.onrender.com"; // SIN slash al final
const API_UPLOAD = `${API_BASE}/upload`;

// === UI ===
const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const video = document.getElementById("video");
const cameraRow = document.getElementById("cameraRow");
const canvas = document.getElementById("canvas");

const btnReload = document.getElementById("btnReload");
const filePick = document.getElementById("filePick");

const btnClose = document.getElementById("btnClose");
const btnSnap = document.getElementById("btnSnap");

const btnOpenGallery = document.getElementById("btnOpenGallery");
const btnOpenCamera  = document.getElementById("btnOpenCamera");
const fileGallery = document.getElementById("fileGallery");
const fileCamera  = document.getElementById("fileCamera");

// Abre galería
btnOpenGallery.onclick = () => fileGallery.click();

// Abre cámara (selector del sistema)
btnOpenCamera.onclick = () => fileCamera.click();

async function handlePickedFile(file) {
  if (!file) return;
  try {
    const url = await uploadToRender(file, file.name || `upload_${Date.now()}.jpg`);
    await idbAddPhoto(url);
    await render();
  } catch (e) {
    alert(e.message);
  }
}

fileGallery.onchange = () => {
  const f = fileGallery.files?.[0];
  fileGallery.value = "";
  handlePickedFile(f);
};

fileCamera.onchange = () => {
  const f = fileCamera.files?.[0];
  fileCamera.value = "";
  handlePickedFile(f);
};

let stream = null;

// ===== IndexedDB (guardamos {url, ts}) =====
const DB_NAME = "album_db_v1";
const STORE = "photos";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      store.createIndex("ts", "ts");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbAddPhoto(url) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ url, ts: Date.now() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbListPhotos() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = req.result || [];
      rows.sort((a,b) => b.ts - a.ts);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

async function render() {
  grid.innerHTML = "";
  const items = await idbListPhotos();
  empty.style.display = items.length ? "none" : "block";

  for (const it of items) {
    const card = document.createElement("div");
    card.className = "card";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = it.url;
    card.appendChild(img);
    grid.appendChild(card);
  }
}

// ===== Cámara =====
async function openCamera() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }, audio: false
  });
  video.srcObject = stream;
  video.style.display = "block";
  cameraRow.style.display = "flex";
}

function closeCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  video.srcObject = null;
  video.style.display = "none";
  cameraRow.style.display = "none";
}

async function captureBlob() {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) throw new Error("La cámara aún no está lista.");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(video, 0, 0, w, h);
  const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 1.0));
  if (!blob) throw new Error("No se pudo capturar.");
  return blob;
}

// ===== Subida =====
async function uploadToRender(fileOrBlob, filename="photo.jpg") {
  const fd = new FormData();
  fd.append("photo", fileOrBlob, filename);

  const r = await fetch(API_UPLOAD, { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || "Error subiendo");
  return j.url; // url directa del archivo
}

// ===== Eventos =====

btnClose.onclick = closeCamera;

btnSnap.onclick = async () => {
  try {
    const blob = await captureBlob();
    await uploadAndRefresh(blob, `camera_${Date.now()}.jpg`);
    closeCamera();
  } catch (e) {
    alert(e.message);
    setBusy(false);
  }
};

function setBusy(busy) {
  btnReload.disabled = busy;

  // botones nuevos
  btnOpenGallery.disabled = busy;
  btnOpenCamera.disabled = busy;

  btnSnap && (btnSnap.disabled = busy);
  btnClose && (btnClose.disabled = busy);

  // también deshabilita inputs para evitar doble click
  fileGallery.disabled = busy;
  fileCamera.disabled = busy;
  filePick && (filePick.disabled = busy);
}


async function uploadAndRefresh(fileOrBlob, name) {
  setBusy(true);
  try {
    const url = await uploadToRender(fileOrBlob, name);
    await idbAddPhoto(url);
    await render(); // recarga galería
  } finally {
    setBusy(false);
  }
}

btnReload.onclick = async () => {
  setBusy(true);
  try { await render(); }
  finally { setBusy(false); }
};

render();
