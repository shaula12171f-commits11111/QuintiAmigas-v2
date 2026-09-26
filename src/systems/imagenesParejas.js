// ============================================================
//  Imágenes PAREJAS — QuintiAmigas v2
//
//  Escenas compartidas / multi pose (ej. dos chicas en el aire con el usuario)
//  o usuario+chica y Aldo+chica.
//
//  Ej: nino_ichika_follando_en_el_aire
//      ichika_usuario_nino_aldo_parejas
//
// ============================================================

const CHICAS_VALIDAS = ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia'];

// ---------------------------------------------------------------------------
//  ESCENAS (agregá solo con URL real)
// ---------------------------------------------------------------------------
const ESCENAS = {
  nino_ichika_folladas_de_pie_se_corren_dentro_de_ellas: {
    url: 'https://raw.githubusercontent.com/shaula12171f-commits11111/wwasaxccvbiquintidfar/main/parejas/nino_ichika_folladas_de_pie_se_corren_dentro_de_ellas.jpg',
    descripcion: 'nino_ichika_folladas_de_pie_se_corren_dentro_de_ellas',
    audio: ''
  },

  nino_ichika_folladas_de_pie: {
    url: 'https://raw.githubusercontent.com/shaula12171f-commits11111/wwasaxccvbiquintidfar/main/parejas/nino_ichika_folladas_de_pie.jpg',
    descripcion: 'tienen camisas blancas y faldas verdes folladas al lado practicamente sus culos chocando entre si muy pegadas',
    audio: ''
  },

  nino_ichika_follando_en_el_aire: {
    url: 'https://raw.githubusercontent.com/SORFAR123123/Putas-de-fabri/main/imagenes/img_1772900802371.jpg',
    descripcion: 'Nino e Ichika follando en el aire con el usuario',
    audio: ''
  },
  // ichika_usuario_nino_aldo_parejas: {
  //   url: 'https://...',
  //   descripcion: 'Ichika con el usuario y Nino con Aldo',
  //   audio: ''
  // },
};

export const IMAGENES_PAREJAS = { ...ESCENAS };

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

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

/**
 * Detecta tipo de escena pareja/multi desde el mensaje.
 * @returns {string|null} sufijo de acción, ej: 'follando_en_el_aire', 'parejas'
 */
export function detectarAccionParejas(mensajeUsuario) {
  const t = String(mensajeUsuario || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (!t.trim()) return null;

  if (/\b(en el aire|follando.?en.?el.?aire|follando_en_el_aire|aire)\b/.test(t) &&
      /\b(foll|cog|penetr|meto|metiendo)\b/.test(t)) {
    return 'follando_en_el_aire';
  }
  if (/\b(en el aire|follando.?en.?el.?aire)\b/.test(t)) {
    return 'follando_en_el_aire';
  }

  // Parejas mixtas: usuario + aldo + al menos dos chicas
  if (/\b(aldo)\b/.test(t) && /\b(pareja|parejas|conmigo|con aldo)\b/.test(t)) {
    return 'parejas';
  }
  if (/\b(aldo)\b/.test(t) && CHICAS_VALIDAS.filter((c) => t.includes(c.toLowerCase())).length >= 2) {
    // "ichika conmigo y nino con aldo" / similar
    if (/\b(conmigo|yo con|me folla|me monto|follando)\b/.test(t) || /\b(y)\b/.test(t)) {
      return 'parejas';
    }
  }

  return null;
}

export function extraerChicasParejas(mensajeUsuario, bloquesChicas = []) {
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

/**
 * Busca imagen por nombres + sufijo (prueba permutaciones de nombres).
 */
export function buscarImagenParejas(nombresChicas, sufijoAccion) {
  const names = [];
  for (const n of nombresChicas || []) {
    const x = normalizarNombre(n);
    if (x && !names.includes(x)) names.push(x);
  }
  if (names.length < 1 || !sufijoAccion) return null;

  const sufijo = String(sufijoAccion).toLowerCase();
  const perms = names.length >= 2 ? permutaciones(names) : [names];

  for (const perm of perms) {
    const tag = `${perm.join('_')}_${sufijo}`;
    const entry = IMAGENES_PAREJAS[tag];
    if (entry && entry.url) {
      return {
        tag,
        url: entry.url,
        descripcion: entry.descripcion || '',
        audio: entry.audio || '',
        participantes: names,
        accion: sufijo
      };
    }
  }

  // Match flexible: mismos nombres en el tag + sufijo
  for (const tag of Object.keys(IMAGENES_PAREJAS)) {
    const entry = IMAGENES_PAREJAS[tag];
    if (!entry?.url) continue;
    if (!tag.includes(sufijo)) continue;
    const sinSufijo = tag.replace(`_${sufijo}`, '').replace(new RegExp(`_${sufijo}$`), '');
    const partesTag = sinSufijo.split('_').filter(Boolean);
    // quitar tokens que no son chicas (usuario, aldo, fabrizio)
    const soloChicas = partesTag.filter((p) => CHICAS_VALIDAS.some((c) => c.toLowerCase() === p));
    const setTag = new Set(soloChicas);
    if (names.length === setTag.size && names.every((n) => setTag.has(n))) {
      return {
        tag,
        url: entry.url,
        descripcion: entry.descripcion || '',
        audio: entry.audio || '',
        participantes: names,
        accion: sufijo
      };
    }
  }

  return null;
}

export function resolverImagenParejasDesdeMensaje(mensajeUsuario, bloquesChicas = []) {
  const accion = detectarAccionParejas(mensajeUsuario);
  if (!accion) return null;

  const chicas = extraerChicasParejas(mensajeUsuario, bloquesChicas);
  if (chicas.length < 2 && accion !== 'parejas') {
    // follando en el aire con 2 chicas hace falta 2
    if (accion === 'follando_en_el_aire' && chicas.length < 1) return null;
  }
  if (chicas.length < 2) return null;

  return buscarImagenParejas(chicas, accion);
}

export function listarClavesParejas() {
  return Object.keys(IMAGENES_PAREJAS);
}

/** Lista solo escenas con URL real para que Qwen elija. */
export function listarEscenasDisponibles() {
  const out = [];
  for (const [tag, entry] of Object.entries(IMAGENES_PAREJAS)) {
    if (entry && entry.url && String(entry.url).startsWith('http')) {
      out.push({
        tag,
        url: entry.url,
        descripcion: entry.descripcion || '',
        audio: entry.audio || '',
        tipo: 'parejas'
      });
    }
  }
  return out;
}

export function getEscenaPorTag(tag) {
  const entry = IMAGENES_PAREJAS[tag];
  if (!entry || !entry.url) return null;
  return {
    tag,
    url: entry.url,
    descripcion: entry.descripcion || '',
    audio: entry.audio || '',
    tipo: 'parejas'
  };
}
