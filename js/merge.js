// Слияние данных двух устройств (трёхстороннее): base — последняя общая версия,
// local — данные этого устройства, remote — данные из облака.
// Запись, изменённая только на одном устройстве, берётся оттуда; удалённая на одном — удаляется;
// изменённая на обоих — побеждает версия этого устройства. Ничего не теряется молча.

export const COLLECTIONS = ['purposes', 'equipment', 'spools', 'movements', 'consumables', 'purchases', 'models', 'prints', 'sales'];

export function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
const same = (a, b) => stable(a) === stable(b);

function mergeValue(b, l, r) {
  if (same(l, b)) return r;
  if (same(r, b)) return l;
  return l;
}

function mergeArray(b = [], l = [], r = []) {
  const map = (arr) => new Map(arr.map((x) => [x.id, x]));
  const B = map(b), L = map(l), R = map(r);
  const ids = [...R.keys(), ...[...L.keys()].filter((id) => !R.has(id))];
  const out = [];
  for (const id of ids) {
    const inB = B.has(id), inL = L.has(id), inR = R.has(id);
    const bv = B.get(id), lv = L.get(id), rv = R.get(id);
    if (inL && inR) out.push(mergeValue(bv, lv, rv));
    else if (inL && !inR) {
      // В облаке нет: либо новая запись этого устройства, либо удалена на другом.
      if (!inB) out.push(lv);
      else if (!same(lv, bv)) out.push(lv); // удалили там, но здесь меняли — сохраняем
    } else if (!inL && inR) {
      if (!inB) out.push(rv);
      else if (!same(rv, bv)) out.push(rv);
    }
  }
  return out;
}

export function merge3(base, local, remote) {
  base = base || {};
  const out = { ...remote, ...local };
  for (const key of new Set([...Object.keys(local || {}), ...Object.keys(remote || {})])) {
    if (COLLECTIONS.includes(key)) out[key] = mergeArray(base[key], local[key], remote[key]);
    else if (key === 'settings') {
      const s = {};
      const keys = new Set([...Object.keys(local.settings || {}), ...Object.keys(remote.settings || {})]);
      for (const k of keys) s[k] = mergeValue(base.settings?.[k], local.settings?.[k], remote.settings?.[k]) ?? local.settings?.[k] ?? remote.settings?.[k];
      out.settings = s;
    } else if (key === 'setupDone') out.setupDone = !!(local.setupDone || remote.setupDone);
    else out[key] = mergeValue(base[key], local[key], remote[key]) ?? local[key] ?? remote[key];
  }
  return out;
}
