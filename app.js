// === Config ===
const API_UPLOAD = "https://backend-album.onrender.com//upload"; // <-- cambia esto

// === UI ===
const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const video = document.getElementById("video");
const cameraRow = document.getElementById("cameraRow");
const canvas = document.getElementById("canvas");

const btnReload = document.getElementById("btnReload");
const btnCamera = document.getElementById("btnCamera");
const btnUpload = document.getElementById("btnUpload");
const filePick = document.getElementById("filePick");

const btnClose = document.getElementById("btnClose");
const btnSnap = document.getElementById("btnSnap");

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
  const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.9));
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
btnCamera.onclick = async () => {
  try { await openCamera(); }
  catch (e) { alert("No se pudo abrir la cámara: " + e.message); }
};

btnClose.onclick = closeCamera;

btnSnap.onclick = async () => {
  try {
    const blob = await captureBlob();
    const url = await uploadToRender(blob, `camera_${Date.now()}.jpg`);
    await idbAddPhoto(url);
    closeCamera();
    await render();
  } catch (e) {
    alert(e.message);
  }
};

btnUpload.onclick = () => filePick.click();

filePick.onchange = async () => {
  const f = filePick.files?.[0];
  if (!f) return;
  try {
    const url = await uploadToRender(f, f.name || `upload_${Date.now()}.jpg`);
    await idbAddPhoto(url);
    await render();
  } catch (e) {
    alert(e.message);
  } finally {
    filePick.value = "";
  }
};

btnReload.onclick = render;

render();
