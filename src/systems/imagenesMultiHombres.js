// ============================================================
//  Imágenes MULTI HOMBRES — QuintiAmigas v2
//
//  1 chica + 2 o más chicos (usuario, Aldo, etc.)
//  Ej: Nino en doggy recibiendo y chupando a la vez.
//
//  Tag ejemplo:
//    nino_follando_en_doggy_y_chupando_polla
//
//  El orden de nombres al buscar no importa (permutaciones).
// ============================================================

const CHICAS_VALIDAS = ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia'];

// ---------------------------------------------------------------------------
//  ESCENAS (agregá solo con URL real)
// ---------------------------------------------------------------------------
const ESCENAS = {
  follando_en_el_aire_nino_recibe_por_el_ano_y_por_la_concha: {
    url: 'https://raw.githubusercontent.com/shaula12171f-commits11111/wwasaxccvbiquintidfar/main/multi_hombres/follando_en_el_aire_nino_recibe_por_el_ano_y_por_la_concha.jpg',
    descripcion: 'nino follada por dos  hombres por el ano y por el coño en el aire',
    audio: ''
  },

  nino_tiene_enfrente_dos_pollas: {
    url: 'https://raw.githubusercontent.com/shaula12171f-commits11111/wwasaxccvbiquintidfar/main/multi_hombres/nino_tiene_enfrente_dos_pollas.jpg',
    descripcion: 'Nino mira dos pollas que estan frente a ella',
    audio: ''
  },

  nino_follando_en_doggy_y_chupando_polla: {
    url: 'https://img.ge/i/ssaly91.png',
    descripcion: 'Nino en doggy follando y chupando polla (multi hombres)',
    audio: ''
  },
  // nino_usuario_aldo_doble_penetracion: {
  //   url: 'https://...',
  //   descripcion: 'Nino con usuario y Aldo',
  //   audio: ''
  // },
};

export const IMAGENES_MULTI_HOMBRES = { ...ESCENAS };

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function normalizarNombre(n) {
  const fixed = CHICAS_VALIDAS.find((c) => c.toLowerCase() === String(n || '').toLowerCase());
  return fixed ? fixed.toLowerCase() : null;
}

/**
 * Detecta escena multi-hombres desde el mensaje del usuario.
 * @returns {string|null} sufijo/clave de acción
 */
export function detectarAccionMultiHombres(mensajeUsuario) {
  const t = String(mensajeUsuario || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (!t.trim()) return null;

  const mencionaAldoODos = /\b(aldo|los dos|ambos|dos pollas|dos vergas|doble)\b/.test(t);
  const doggyYChupa =
    /\b(doggy|a cuatro)\b/.test(t) &&
    /\b(chup|mam|oral|polla|verga)\b/.test(t);
  const sandwich =
    /\b(sandwich|entre los dos|spitroast|spit.?roast)\b/.test(t);
  const doblePen =
    /\b(doble\s*penetr|dp\b|dos a la vez)\b/.test(t);

  if (doggyYChupa || (mencionaAldoODos && /\b(doggy)\b/.test(t) && /\b(chup|mam)\b/.test(t))) {
    return 'follando_en_doggy_y_chupando_polla';
  }
  if (sandwich) return 'sandwich';
  if (doblePen) return 'doble_penetracion';
  if (mencionaAldoODos && /\b(foll|cog|penetr|chup|mam)\b/.test(t)) {
    return 'multi_hombres';
  }
  return null;
}

export function extraerChicaMultiHombres(mensajeUsuario, bloquesChicas = []) {
  const t = String(mensajeUsuario || '').toLowerCase();
  for (const c of CHICAS_VALIDAS) {
    if (t.includes(c.toLowerCase())) return c;
  }
  for (const n of bloquesChicas || []) {
    const fixed = CHICAS_VALIDAS.find((c) => c.toLowerCase() === String(n || '').toLowerCase());
    if (fixed) return fixed;
  }
  return null;
}

/**
 * Busca por tag exacto o chica + sufijo de acción.
 */
export function buscarImagenMultiHombres(chica, sufijoAccion) {
  const name = normalizarNombre(chica);
  if (!name || !sufijoAccion) return null;

  const sufijo = String(sufijoAccion).toLowerCase();
  const candidatos = [
    `${name}_${sufijo}`,
    sufijo, // por si el tag no lleva nombre
  ];

  for (const tag of candidatos) {
    const entry = IMAGENES_MULTI_HOMBRES[tag];
    if (entry && entry.url) {
      return {
        tag,
        url: entry.url,
        descripcion: entry.descripcion || '',
        audio: entry.audio || '',
        participantes: [name],
        accion: sufijo
      };
    }
  }

  // Match flexible: tag contiene nombre de chica y parte del sufijo
  for (const tag of Object.keys(IMAGENES_MULTI_HOMBRES)) {
    const entry = IMAGENES_MULTI_HOMBRES[tag];
    if (!entry?.url) continue;
    const tl = tag.toLowerCase();
    if (!tl.includes(name)) continue;
    if (sufijo === 'follando_en_doggy_y_chupando_polla') {
      if (tl.includes('doggy') && (tl.includes('chup') || tl.includes('polla'))) {
        return {
          tag,
          url: entry.url,
          descripcion: entry.descripcion || '',
          audio: entry.audio || '',
          participantes: [name],
          accion: sufijo
        };
      }
    }
    if (tl.includes(sufijo) || sufijo.split('_').every((p) => p.length < 3 || tl.includes(p))) {
      return {
        tag,
        url: entry.url,
        descripcion: entry.descripcion || '',
        audio: entry.audio || '',
        participantes: [name],
        accion: sufijo
      };
    }
  }

  return null;
}

export function resolverImagenMultiHombresDesdeMensaje(mensajeUsuario, bloquesChicas = []) {
  const accion = detectarAccionMultiHombres(mensajeUsuario);
  if (!accion) return null;

  const chica = extraerChicaMultiHombres(mensajeUsuario, bloquesChicas);
  if (!chica) return null;

  return buscarImagenMultiHombres(chica, accion);
}

export function listarClavesMultiHombres() {
  return Object.keys(IMAGENES_MULTI_HOMBRES);
}

/** Lista solo escenas con URL real para que Qwen elija. */
export function listarEscenasDisponibles() {
  const out = [];
  for (const [tag, entry] of Object.entries(IMAGENES_MULTI_HOMBRES)) {
    if (entry && entry.url && String(entry.url).startsWith('http')) {
      out.push({
        tag,
        url: entry.url,
        descripcion: entry.descripcion || '',
        audio: entry.audio || '',
        tipo: 'multi_hombres'
      });
    }
  }
  return out;
}

export function getEscenaPorTag(tag) {
  const entry = IMAGENES_MULTI_HOMBRES[tag];
  if (!entry || !entry.url) return null;
  return {
    tag,
    url: entry.url,
    descripcion: entry.descripcion || '',
    audio: entry.audio || '',
    tipo: 'multi_hombres'
  };
}
