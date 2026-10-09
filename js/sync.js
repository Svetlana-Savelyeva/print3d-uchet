// Синхронизация между устройствами через закрытый репозиторий GitHub.
// Данные: data.json, фото: photos/<id>.jpg. Ключ доступа хранится только на этом устройстве.
import { store, kv, photos, migrate } from './store.js';
import { merge3, stable } from './merge.js';

const CFG_KEY = 'p3d-sync';
const DATA_PATH = 'data.json';

export const sync = {
  status: 'off', // off | ok | busy | error | offline
  message: '',
  lastSync: null,
  listeners: new Set(),
};

export function getConfig() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch { return null; }
}
function setConfig(cfg) {
  if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(CFG_KEY);
}

function setStatus(status, message = '') {
  sync.status = status;
  sync.message = message;
  if (status === 'ok') sync.lastSync = new Date();
  sync.listeners.forEach((l) => l());
}

// ---------- GitHub ----------
async function api(cfg, path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
    ...opts,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: opts.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  return res;
}

const toB64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0));

async function getFile(cfg, path) {
  const meta = await api(cfg, `/contents/${path}`);
  if (meta.status === 404) return null;
  if (!meta.ok) throw httpError(meta);
  const j = await meta.json();
  let bytes;
  if (j.content && j.encoding === 'base64') bytes = fromB64(j.content);
  else {
    const raw = await api(cfg, `/contents/${path}`, { raw: true });
    if (!raw.ok) throw httpError(raw);
    bytes = new Uint8Array(await raw.arrayBuffer());
  }
  return { sha: j.sha, bytes };
}

async function putFile(cfg, path, bytes, sha, message) {
  const res = await api(cfg, `/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: toB64(bytes), ...(sha ? { sha } : {}) }),
  });
  if (res.status === 409 || res.status === 422) { const e = new Error('conflict'); e.conflict = true; throw e; }
  if (!res.ok) throw httpError(res);
  return (await res.json()).content.sha;
}

function httpError(res) {
  const map = { 401: 'Ключ доступа не подходит или истёк', 403: 'Нет прав на запись в репозиторий', 404: 'Репозиторий не найден' };
  const e = new Error(map[res.status] || `GitHub ответил ошибкой ${res.status}`);
  e.status = res.status;
  return e;
}

const enc = (state) => new TextEncoder().encode(JSON.stringify(state));
const dec = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

// ---------- Основной цикл ----------
let chain = Promise.resolve();
const queue = (fn) => (chain = chain.then(fn, fn));

/** Забирает данные из облака и сливает с локальными. */
export function pull() {
  return queue(async () => {
    const cfg = getConfig();
    if (!cfg) return;
    if (!navigator.onLine) return setStatus('offline', 'Нет интернета — изменения отправятся позже');
    setStatus('busy');
    try {
      const remoteFile = await getFile(cfg, DATA_PATH);
      const base = await kv.get('syncBase');
      if (!remoteFile) { await pushNow(cfg); return; }
      const remote = dec(remoteFile.bytes);
      const merged = migrate(merge3(base, store.state, remote));
      await kv.put('syncBase', remote);
      await kv.put('syncSha', remoteFile.sha);
      if (stable(merged) !== stable(store.state)) await store.replace(merged);
      if (stable(merged) !== stable(remote)) await pushNow(cfg);
      else setStatus('ok');
      uploadPendingPhotos(cfg);
    } catch (e) { fail(e); }
  });
}

/** Отправляет локальные изменения (со слиянием, если в облаке успели появиться чужие). */
async function pushNow(cfg, attempt = 0) {
  const base = await kv.get('syncBase');
  if (base && stable(base) === stable(store.state)) return setStatus('ok');
  const sha = await kv.get('syncSha');
  try {
    const snapshot = JSON.parse(JSON.stringify(store.state));
    const newSha = await putFile(cfg, DATA_PATH, enc(snapshot), sha, `Данные ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
    await kv.put('syncBase', snapshot);
    await kv.put('syncSha', newSha);
    setStatus('ok');
  } catch (e) {
    if (e.conflict && attempt < 3) {
      const remoteFile = await getFile(cfg, DATA_PATH);
      const remote = remoteFile ? dec(remoteFile.bytes) : null;
      if (remote) {
        const merged = migrate(merge3(base, store.state, remote));
        await kv.put('syncBase', remote);
        await kv.put('syncSha', remoteFile.sha);
        if (stable(merged) !== stable(store.state)) await store.replace(merged);
      } else await kv.del('syncSha');
      return pushNow(cfg, attempt + 1);
    }
    throw e;
  }
}

let pushTimer = null;
export function schedulePush() {
  const cfg = getConfig();
  if (!cfg) return;
  clearTimeout(pushTimer);
  setStatus('busy');
  pushTimer = setTimeout(() => queue(async () => {
    if (!navigator.onLine) return setStatus('offline', 'Нет интернета — изменения отправятся позже');
    try { await pushNow(getConfig()); uploadPendingPhotos(getConfig()); } catch (e) { fail(e); }
  }), 1500);
}

function fail(e) {
  console.error(e);
  if (!navigator.onLine || e instanceof TypeError) setStatus('offline', 'Нет связи с GitHub — изменения отправятся позже');
  else setStatus('error', e.message);
}

// ---------- Фото ----------
const PENDING = 'p3d-photo-queue';
const pending = () => { try { return JSON.parse(localStorage.getItem(PENDING) || '[]'); } catch { return []; } };
export function queuePhoto(id) {
  if (!getConfig()) return;
  localStorage.setItem(PENDING, JSON.stringify([...new Set([...pending(), id])]));
}
let uploading = false;
async function uploadPendingPhotos(cfg) {
  if (uploading || !cfg) return;
  uploading = true;
  try {
    for (const id of pending()) {
      const blob = await photos.get(id);
      if (blob) {
        try { await putFile(cfg, `photos/${id}.jpg`, new Uint8Array(await blob.arrayBuffer()), null, `Фото ${id}`); }
        catch (e) { if (!e.conflict) throw e; } // уже загружено
      }
      localStorage.setItem(PENDING, JSON.stringify(pending().filter((x) => x !== id)));
    }
  } catch (e) { console.error(e); } finally { uploading = false; }
}
/** Фото, которого нет на этом устройстве, подтягиваем из облака. */
export async function fetchPhoto(id) {
  const cfg = getConfig();
  if (!cfg) return null;
  const f = await getFile(cfg, `photos/${id}.jpg`);
  if (!f) return null;
  const blob = new Blob([f.bytes], { type: 'image/jpeg' });
  await photos.put(id, blob);
  return blob;
}

// ---------- Подключение ----------
/**
 * Проверяет доступ и смотрит, что лежит в облаке.
 * Возвращает { remote } — данные из облака или null, если там пусто.
 */
export async function testConnection(repo, token) {
  const cfg = { repo: repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, ''), token: token.trim() };
  const res = await fetch(`https://api.github.com/repos/${cfg.repo}`, { cache: 'no-store', headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw httpError(res);
  const info = await res.json();
  if (!info.private) throw new Error('Репозиторий открытый — данные увидят все. Сделайте его Private');
  if (info.permissions && !info.permissions.push) throw new Error('У ключа нет права записи (Contents: Read and write)');
  const file = await getFile(cfg, DATA_PATH);
  return { cfg, remote: file ? dec(file.bytes) : null, sha: file?.sha || null };
}

/** mode: 'merge' — объединить, 'cloud' — взять из облака, 'device' — отправить с этого устройства. */
export async function connect({ cfg, remote, sha }, mode) {
  setConfig(cfg);
  if (remote && mode === 'cloud') await store.replace(migrate(remote));
  else if (remote && mode === 'merge') await store.replace(migrate(merge3(null, store.state, remote)));
  await kv.put('syncBase', mode === 'device' || !remote ? null : remote);
  await kv.put('syncSha', sha);
  // Все фото этого устройства — в очередь на загрузку.
  localStorage.setItem(PENDING, JSON.stringify(await photos.keys()));
  await pull();
  startSync();
}

export async function disconnect() {
  setConfig(null);
  store.listeners.delete(schedulePush);
  await kv.del('syncBase');
  await kv.del('syncSha');
  localStorage.removeItem(PENDING);
  setStatus('off');
}

let started = false;
export function startSync() {
  if (!getConfig()) return setStatus('off');
  store.listeners.add(schedulePush);
  if (started) return;
  started = true;
  pull();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
  window.addEventListener('online', () => pull());
  setInterval(() => { if (document.visibilityState === 'visible') pull(); }, 60000);
}
