// FaceLock core: framework-agnostic. Requires global `faceapi` (vendor/face-api.js).
const fa = faceapi, DB = 'facelock', ST = 'kv';
export const THRESH = 0.5; // max descriptor distance for a match (lower = stricter)

// ---- encrypted local template storage (non-extractable AES-GCM key in IndexedDB) ----
const idb = () => new Promise((ok, no) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const kv = async (mode, fn) => { const d = await idb(); return new Promise((ok, no) => { const t = d.transaction(ST, mode), q = fn(t.objectStore(ST)); t.oncomplete = () => ok(q.result); t.onerror = () => no(t.error); }); };
const get = k => kv('readonly', s => s.get(k)), put = (k, v) => kv('readwrite', s => s.put(v, k)), del = k => kv('readwrite', s => s.delete(k));
async function key() { let k = await get('key'); if (!k) { k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); await put('key', k); } return k; }
export async function saveTemplate(vec) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new Float32Array(vec).buffer); await put('tpl', { iv, ct }); }
export async function loadTemplate() { const r = await get('tpl'); return r ? new Float32Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: r.iv }, await key(), r.ct)) : null; }
export async function deleteTemplate() { await del('tpl'); await del('key'); }

// ---- camera + models ----
export async function init(video, base = './models') {
  await Promise.all([fa.nets.tinyFaceDetector, fa.nets.faceLandmark68Net, fa.nets.faceRecognitionNet].map(n => n.loadFromUri(base)));
  if (video.srcObject?.getVideoTracks().some(track => track.readyState === 'live')) {
    await video.play();
    return;
  }

  stopCamera(video);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: { ideal: 'user' }
    }
  });
  try {
    video.srcObject = stream;
    await video.play();
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    throw error;
  }
}
export const stopCamera = v => { v.srcObject?.getTracks().forEach(t => t.stop()); v.srcObject = null; };
const opt = new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
const detect = (v, desc) => { const q = fa.detectAllFaces(v, opt).withFaceLandmarks(); return desc ? q.withFaceDescriptors() : q; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- landmark geometry ----
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ear = p => (d(p[1], p[5]) + d(p[2], p[4])) / (2 * d(p[0], p[3]));
const eyes = l => { const p = l.positions; return (ear(p.slice(36, 42)) + ear(p.slice(42, 48))) / 2; };
const yaw = l => { const p = l.positions; return (p[30].x - p[0].x) / (p[16].x - p[0].x); }; // ~0.5 = frontal (raw, un-mirrored image)

// ---- liveness: random challenge defeats static photos ----
export const CHALLENGES = [
  { id: 'blink', text: 'Blink twice' },
  { id: 'left', text: 'Turn your head toward the left of the screen' },
  { id: 'right', text: 'Turn your head toward the right of the screen' }];
export async function liveness(v, ch, say, ms = 9000) {
  let n = 0, closed = false; const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    const f = await detect(v);
    if (f.length !== 1) { say?.('Keep exactly one face in view'); continue; }
    const l = f[0].landmarks; say?.(ch.text);
    if (ch.id === 'blink') { const e = eyes(l); if (e < 0.2) closed = true; else if (closed && e > 0.25) { n++; closed = false; } if (n >= 2) return true; }
    else { const y = yaw(l); if (ch.id === 'left' ? y > 0.64 : y < 0.36) return true; } // video is shown mirrored
  }
  return false;
}

// ---- enroll / verify / guard ----
export async function captureTemplate(v, n = 8, say) {
  const ds = [];
  while (ds.length < n) {
    const f = await detect(v, true);
    if (f.length !== 1) { say?.('Show one face to the camera'); continue; }
    const y = yaw(f[0].landmarks); if (y < 0.4 || y > 0.6) { say?.('Look straight at the camera'); continue; }
    ds.push(f[0].descriptor); say?.(`Capturing ${ds.length} of ${n}`); await sleep(250);
  }
  const avg = new Float32Array(128); ds.forEach(x => x.forEach((e, i) => avg[i] += e / n)); return avg;
}
export async function matchFace(v, tpl, tries = 5) {
  const ds = [];
  for (let i = 0; i < tries * 3 && ds.length < tries; i++) { const f = await detect(v, true); if (f.length === 1) ds.push(fa.euclideanDistance(f[0].descriptor, tpl)); }
  if (ds.length < 3) return { ok: false, dist: null };
  ds.sort((a, b) => a - b); const m = ds[ds.length >> 1]; return { ok: m < THRESH, dist: m };
}
// Calls onState('ok'|'absent'|'multiple'|'stranger') about once a second. Returns a stop function.
export function guard(v, tpl, onState, every = 1000) {
  let on = true, miss = 0;
  (async () => { while (on) {
    const f = await detect(v, true); let s = 'ok';
    if (!f.length) { if (++miss >= 3) s = 'absent'; } else { miss = 0; if (f.length > 1) s = 'multiple'; else if (fa.euclideanDistance(f[0].descriptor, tpl) >= THRESH + 0.05) s = 'stranger'; }
    if (on) onState(s); await sleep(every);
  } })();
  return () => { on = false; };
}
