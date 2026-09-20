// ============================================================
//  Imágenes GRUPALES — QuintiAmigas v2
//
//  Organización por SECCIONES:
//    DUOS | TRIOS | CUARTETOS | QUINTETOS
//
//  Cada entrada usa un tag legible, ej:
//    nino_ichika_doble_mamada
//    nino_miku_ichika_triple_mamada
//
//  Al buscar, el orden de nombres en el chat NO importa:
//  se prueba la clave tal cual y también permutaciones de nombres.
//  Agregá solo las que tengan URL real.
// ============================================================

const CHICAS_VALIDAS = ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia'];

// ---------------------------------------------------------------------------
//  DUOS (2 chicas)
// ---------------------------------------------------------------------------
const DUOS = {
  nino_ichika_doble_mamada: {
    url: 'https://raw.githubusercontent.com/SORFAR123123/Putas-de-fabri/main/imagenes/img_1772841651283.jpg',
    descripcion: 'Nino e Ichika mamando al usuario',
    audio: ''
  },
};

// ---------------------------------------------------------------------------
//  TRIOS (3 chicas)
// ---------------------------------------------------------------------------
const TRIOS = {
};

// ---------------------------------------------------------------------------
//  CUARTETOS (4 chicas)
// ---------------------------------------------------------------------------
const CUARTETOS = {
};

// ---------------------------------------------------------------------------
//  QUINTETOS (las 5)
// ---------------------------------------------------------------------------
const QUINTETOS = {
};

/** Mapa plano tag → entrada (se arma al cargar) */
export const IMAGENES_GRUPALES = {
  ...DUOS,
  ...TRIOS,
  ...CUARTETOS,
  ...QUINTETOS
};

function normalizarNombre(n) {
  const fixed = CHICAS_VALIDAS.find((c) => c.toLowerCase() === String(n || '').toLowerCase());
  return fixed ? fixed.toLowerCase() : null;
}

function permutaciones(arr) {
  if (arr.length <= 1) return [arr];
  if (arr.length > 5) return [arr];
  const out = [];
  const used = new Array(arr.length).fill(false);
  const path = [];
  function dfs() {
    if (path.length === arr.length) {
      out.push([...path]);
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      path.push(arr[i]);
      dfs();
      path.pop();
      used[i] = false;
    }
  }
  dfs();
  return out;
}

function sufijoPorCantidadYAccion(n, accionBase) {
  const a = String(accionBase || 'mamada').toLowerCase();
  if (n >= 5) return a.includes('handjob') ? 'quintuple_handjob' : a.includes('paizuri') ? 'quintuple_paizuri' : 'quintuple_mamada';
  if (n === 4) return a.includes('handjob') ? 'cuadruple_handjob' : 'cuadruple_mamada';
  if (n === 3) return a.includes('handjob') ? 'triple_handjob' : 'triple_mamada';
  if (a.includes('handjob') || a === 'doble_handjob') return 'doble_handjob';
  if (a.includes('paizuri')) return 'doble_paizuri';
  if (a.includes('penetr')) return 'doble_penetracion';
  return 'doble_mamada';
}

export function detectarAccionGrupal(mensajeUsuario) {
  const t = String(mensajeUsuario || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!t.trim()) return null;
  const sobreUsuario =
    /\b(me|mi|mis)\b/.test(t) ||
    /\b(mamen|chupen|follen|mamadme|chupadme)\b/.test(t) ||
    /\b(los dos|las dos|juntas|al mismo tiempo|a la vez|doble|triple)\b/.test(t);
  if (/\b(doble\s*handjob|doble\s*paja|paja\s*doble)\b/.test(t) || (/\b(paja|handjob)\b/.test(t) && /\b(las dos|ambas|juntas)\b/.test(t) && sobreUsuario)) return 'handjob';
  if (/\b(doble\s*paizuri|doble\s*titjob)\b/.test(t) || (/\bpaizuri|titjob\b/.test(t) && /\b(las dos|ambas|juntas)\b/.test(t))) return 'paizuri';
  if (/\b(doble\s*penetraci|sandwich|entre las dos)\b/.test(t) && sobreUsuario) return 'penetracion';
  if (/\b(doble\s*blowjob|doble\s*mamada|triple\s*mamada|triple\s*blowjob)\b/.test(t) || (/\b(maman|chupan|mamando|chupando|mamada)\b/.test(t) && sobreUsuario && (/\b(y|e)\b/.test(t) || /\b(las dos|ambas|juntas|doble|triple)\b/.test(t)))) return 'mamada';
  return null;
}

export function extraerChicasGrupales(mensajeUsuario, bloquesChicas = []) {
  const t = String(mensajeUsuario || '').toLowerCase();
  const found = [];
  for (const c of CHICAS_VALIDAS) {
    if (t.includes(c.toLowerCase())) found.push(c);
  }
  if (found.length >= 2) return found;
  for (const n of bloquesChicas || []) {
    const fixed = CHICAS_VALIDAS.find((c) => c.toLowerCase() === String(n || '').toLowerCase());
    if (fixed && !found.some((x) => x === fixed)) found.push(fixed);
  }
  return found;
}

export function buscarImagenGrupal(nombresChicas, accionBase) {
  const names = [];
  for (const n of nombresChicas || []) {
    const x = normalizarNombre(n);
    if (x && !names.includes(x)) names.push(x);
  }
  if (names.length < 2) return null;
  const sufijo = sufijoPorCantidadYAccion(names.length, accionBase);
  const perms = permutaciones(names);
  for (const perm of perms) {
    const tag = `${perm.join('_')}_${sufijo}`;
    const entry = IMAGENES_GRUPALES[tag];
    if (entry && entry.url) {
      return { tag, url: entry.url, descripcion: entry.descripcion || '', audio: entry.audio || '', participantes: names, accion: sufijo };
    }
  }
  return null;
}

export function resolverImagenGrupalDesdeMensaje(mensajeUsuario, bloquesChicas = []) {
  const accionBase = detectarAccionGrupal(mensajeUsuario);
  if (!accionBase) return null;
  const chicas = extraerChicasGrupales(mensajeUsuario, bloquesChicas);
  if (chicas.length < 2) return null;
  return buscarImagenGrupal(chicas, accionBase);
}

export function listarClavesGrupales() {
  return Object.keys(IMAGENES_GRUPALES);
}

export function hayImagenesGrupales() {
  return Object.keys(IMAGENES_GRUPALES).some((k) => IMAGENES_GRUPALES[k]?.url);
}

/** Lista solo escenas con URL real para que Qwen elija. */
export function listarEscenasDisponibles() {
  const out = [];
  for (const [tag, entry] of Object.entries(IMAGENES_GRUPALES)) {
    if (entry && entry.url && String(entry.url).startsWith('http')) {
      out.push({ tag, url: entry.url, descripcion: entry.descripcion || '', audio: entry.audio || '', tipo: 'grupal' });
    }
  }
  return out;
}

export function getEscenaPorTag(tag) {
  const entry = IMAGENES_GRUPALES[tag];
  if (!entry || !entry.url) return null;
  return { tag, url: entry.url, descripcion: entry.descripcion || '', audio: entry.audio || '', tipo: 'grupal' };
}
