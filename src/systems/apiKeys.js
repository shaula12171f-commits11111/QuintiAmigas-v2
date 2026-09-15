// ============================================================
//  API Keys — localStorage (nunca en el repo público)
//  Cada key: { id, key, note, createdAt }
//  El orden del array = orden de uso en llamarGroq
// ============================================================

const STORAGE_KEY = 'quinti_groq_keys_v1';

/** @returns {{ id: string, key: string, note: string, createdAt: number }[]} */
export function loadApiKeys() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.key === 'string' && x.key.trim())
      .map((x, i) => ({
        id: String(x.id || `k_${i}_${Date.now()}`),
        key: String(x.key).trim(),
        note: String(x.note || '').trim(),
        createdAt: Number(x.createdAt) || Date.now()
      }));
  } catch {
    return [];
  }
}

export function saveApiKeys(list) {
  const clean = (Array.isArray(list) ? list : [])
    .filter((x) => x && String(x.key || '').trim())
    .map((x, i) => ({
      id: String(x.id || `k_${i}_${Date.now()}`),
      key: String(x.key).trim(),
      note: String(x.note || '').trim(),
      createdAt: Number(x.createdAt) || Date.now()
    }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

/** Solo los strings de key, en orden (para llamarGroq) */
export function getGroqKeyStrings() {
  return loadApiKeys().map((x) => x.key).filter(Boolean);
}

export function addApiKey(key, note = '') {
  const k = String(key || '').trim();
  if (!k) throw new Error('La key no puede estar vacía');
  const list = loadApiKeys();
  if (list.some((x) => x.key === k)) throw new Error('Esa key ya está guardada');
  list.push({
    id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    key: k,
    note: String(note || '').trim(),
    createdAt: Date.now()
  });
  return saveApiKeys(list);
}

export function updateApiKey(id, { key, note } = {}) {
  const list = loadApiKeys();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) throw new Error('Key no encontrada');
  if (key !== undefined) {
    const k = String(key).trim();
    if (!k) throw new Error('La key no puede estar vacía');
    list[idx].key = k;
  }
  if (note !== undefined) list[idx].note = String(note || '').trim();
  return saveApiKeys(list);
}

export function removeApiKey(id) {
  return saveApiKeys(loadApiKeys().filter((x) => x.id !== id));
}

/** Mueve la key en la posición fromIndex a toIndex (reordenar) */
export function moveApiKey(fromIndex, toIndex) {
  const list = loadApiKeys();
  if (fromIndex < 0 || fromIndex >= list.length) return list;
  if (toIndex < 0 || toIndex >= list.length) return list;
  const [item] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, item);
  return saveApiKeys(list);
}

export function moveApiKeyUp(id) {
  const list = loadApiKeys();
  const i = list.findIndex((x) => x.id === id);
  if (i <= 0) return list;
  return moveApiKey(i, i - 1);
}

export function moveApiKeyDown(id) {
  const list = loadApiKeys();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0 || i >= list.length - 1) return list;
  return moveApiKey(i, i + 1);
}

export function maskKey(key) {
  const k = String(key || '');
  if (k.length < 12) return '(muy corta)';
  return k.slice(0, 7) + '…' + k.slice(-4);
}

/** Importa keys planas (migración desde config viejo). No duplica. */
export function importPlainKeys(keys, defaultNote = 'importada') {
  const list = loadApiKeys();
  const existing = new Set(list.map((x) => x.key));
  let n = 0;
  for (const k of keys || []) {
    const key = String(k || '').trim();
    if (!key || key.includes('TU_KEY') || existing.has(key)) continue;
    list.push({
      id: `k_${Date.now()}_${n}_${Math.random().toString(36).slice(2, 6)}`,
      key,
      note: defaultNote,
      createdAt: Date.now()
    });
    existing.add(key);
    n++;
  }
  if (n) saveApiKeys(list);
  return n;
}
