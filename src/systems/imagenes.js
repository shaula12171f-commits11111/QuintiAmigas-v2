// ============================================================
//  Imágenes v2.1 — Matcher avanzado (cobertura + pureza + umbral + memoria)
//  Basado en catálogo estructurado por tag
// ============================================================

const ORIGINAL_URL =
  'https://raw.githubusercontent.com/shaula12171f-commits11111/Nakardasputardas17/main/src/systems/imagenes.js';

let QuintiImagenesPrueba = null;
let _loadPromise = null;

// ------------------------------------------------------------
// 1. CATÁLOGO ESTRUCTURADO (metadata por tag)
//    Cuanto más preciso el metadata, mejor el matcher.
// ------------------------------------------------------------
const TAG_CATALOG = {
  // === ORAL / BOLAS (los más críticos) ===
  chupando_bola_izquierda: {
    accion: ['chupar', 'lamer', 'succionar', 'oral'],
    zona: ['bola', 'bolas', 'testiculo'],
    lado: 'izquierda',
    intensidad: ['suave', 'lento'],
    excluye: ['pene_entero', 'todo', 'deep', 'doggy', 'anal', 'punta', 'mitad'],
    grupo: 'oral_bolas',
    peso: 1.3
  },
  chupando_bola_derecha: {
    accion: ['chupar', 'lamer', 'succionar', 'oral'],
    zona: ['bola', 'bolas', 'testiculo'],
    lado: 'derecha',
    intensidad: ['suave', 'lento'],
    excluye: ['pene_entero', 'todo', 'deep', 'doggy', 'anal', 'punta', 'mitad'],
    grupo: 'oral_bolas',
    peso: 1.3
  },
  chupando_bolas: {
    accion: ['chupar', 'lamer', 'succionar', 'oral'],
    zona: ['bola', 'bolas', 'testiculo'],
    lado: null,
    intensidad: ['normal'],
    excluye: ['pene_entero', 'todo', 'deep', 'punta'],
    grupo: 'oral_bolas',
    peso: 1.1
  },
  chupando_solo_la_punta_del_pene: {
    accion: ['chupar', 'lamer', 'oral'],
    zona: ['punta', 'cabeza', 'glande'],
    lado: null,
    intensidad: ['suave'],
    excluye: ['bola', 'todo', 'deep', 'mitad', 'fondo'],
    grupo: 'oral',
    peso: 1.25
  },
  chupando_solo_la_punta_del_pene2: {
    accion: ['chupar', 'lamer', 'oral'],
    zona: ['punta', 'cabeza', 'glande'],
    lado: null,
    intensidad: ['suave'],
    excluye: ['bola', 'todo', 'deep', 'mitad'],
    grupo: 'oral',
    peso: 1.2
  },
  chupando_solo_la_mitad_del_pene: {
    accion: ['chupar', 'oral'],
    zona: ['mitad', 'pene'],
    lado: null,
    intensidad: ['normal'],
    excluye: ['bola', 'todo', 'deep', 'punta'],
    grupo: 'oral',
    peso: 1.2
  },
  chupando_todo_el_pene: {
    accion: ['chupar', 'oral', 'deepthroat'],
    zona: ['pene', 'verga', 'todo'],
    lado: null,
    intensidad: ['fuerte', 'deep'],
    excluye: ['bola', 'punta', 'mitad'],
    grupo: 'oral',
    peso: 1.15
  },
  chupando_todo_el_pene_mano_en_su_cabeza_empujandola: {
    accion: ['chupar', 'oral', 'deepthroat'],
    zona: ['pene', 'todo'],
    lado: null,
    intensidad: ['fuerte', 'deep'],
    extras: ['mano', 'empujar', 'cabeza'],
    excluye: ['bola'],
    grupo: 'oral',
    peso: 1.1
  },
  lamiendo_pene: {
    accion: ['lamer', 'lamiendo'],
    zona: ['pene', 'verga'],
    lado: null,
    intensidad: ['suave'],
    excluye: ['chupar', 'succionar', 'deep', 'bola'],
    grupo: 'oral',
    peso: 1.15
  },

  // === POSICIONES ===
  doggystyle: {
    accion: ['follar', 'coger', 'penetrar'],
    zona: ['culo', 'concha'],
    pose: 'doggy',
    grupo: 'penetracion',
    peso: 1.2
  },
  misionero: {
    accion: ['follar', 'coger', 'penetrar'],
    pose: 'misionero',
    grupo: 'penetracion',
    peso: 1.15
  },
  cowgirl: {
    accion: ['follar', 'montar', 'cabalgar'],
    pose: 'cowgirl',
    grupo: 'penetracion',
    peso: 1.2
  },
  reverse_cowgirl: {
    accion: ['follar', 'montar'],
    pose: 'reverse_cowgirl',
    grupo: 'penetracion',
    peso: 1.2
  },
  sidefuck: {
    accion: ['follar'],
    pose: 'side',
    grupo: 'penetracion',
    peso: 1.15
  },
  standfuck_follando_de_pie: {
    accion: ['follar'],
    pose: 'de_pie',
    grupo: 'penetracion',
    peso: 1.15
  },
  follando_en_el_aire: {
    accion: ['follar'],
    pose: 'aire',
    grupo: 'penetracion',
    peso: 1.2
  },
  follando_anal: {
    accion: ['follar', 'anal'],
    zona: ['ano', 'culo'],
    grupo: 'anal',
    peso: 1.25
  },
  handjob_paja: {
    accion: ['paja', 'handjob', 'jalar'],
    zona: ['mano'],
    grupo: 'manual',
    peso: 1.2
  },
  usuario_muestra_su_verga: {
    accion: ['mostrar'],
    zona: ['verga'],
    grupo: 'muestra',
    peso: 1.3
  },
  besando: {
    accion: ['besar'],
    grupo: 'beso',
    peso: 1.1
  },
  desnuda: {
    accion: ['desnud'],
    grupo: 'ropa',
    peso: 1.0
  },
  hablando: {
    accion: [],
    grupo: 'neutro',
    peso: 0.5
  }
};

// Sinónimos para extraer intención del usuario
const INTENT_SYNONYMS = {
  accion: {
    chupar: ['chup', 'mam', 'mamad', 'oral', 'blowjob', 'chupame', 'mamame', 'chupamela', 'mamamela'],
    lamer: ['lam', 'lamiendo', 'lamer', 'lame', 'lameme'],
    follar: ['foll', 'cog', 'penetr', 'meto', 'metela', 'sexo', 'follame', 'cogeme'],
    paja: ['paja', 'handjob', 'jalo', 'soba', 'con la mano'],
    besar: ['beso', 'besarte', 'besando', 'besame'],
    mostrar: ['muestro', 'saco', 'mira', 'viendo', 'te muestro'],
    nalguear: ['nalgue', 'cachetad', 'azote'],
    montar: ['monto', 'cabalg', 'encima']
  },
  zona: {
    bola: ['bola', 'bolas', 'testicul', 'testículo', 'testiculo', 'huevo', 'huevos'],
    pene: ['pene', 'verga', 'pija', 'polla', 'poronga', 'pichula', 'pito'],
    punta: ['punta', 'cabeza', 'glande'],
    mitad: ['mitad'],
    todo: ['todo', 'entera', 'fondo', 'deep', 'deepthroat', 'se la traga'],
    culo: ['culo', 'nalga', 'ano'],
    concha: ['concha', 'coño', 'vagina'],
    tetas: ['teta', 'pecho', 'pezon']
  },
  lado: {
    izquierda: ['izquierda', 'izq', 'left'],
    derecha: ['derecha', 'der', 'right']
  },
  pose: {
    doggy: ['doggy', 'perrito', 'a cuatro', 'por detras', 'de espaldas', 'doggystyle'],
    misionero: ['misioner', 'boca arriba'],
    cowgirl: ['cowgirl', 'encima', 'montando'],
    reverse: ['reverse', 'al reves'],
    side: ['costado', 'de lado', 'sidefuck'],
    de_pie: ['de pie', 'stand', 'pared', 'ventana'],
    aire: ['en el aire', 'levantad', 'suspendid']
  }
};

const PATRON_NO_SEX =
  /^(hablando|ropa_|desnuda$|desnuda_en_cama|besando$|mostrando_sujetador|quitandose_la_ropa|selfie_|.*_NOSEX$|moviendo_el_culo$|viendo_verga|usuario_muestra_su_verga)/i;

const PATRON_SEX =
  /chup|oral|pene|verga|pija|doggy|mision|anal|cowgirl|handjob|paja|69|foll|cum|corro|semen|dedo|squirt|lamiendo|nalg|standfuck|sidefuck|mattin|estir|ano|concha|tetas?_de|agarra_el_culo(?!_.*NOSEX)|rozo_mi|post_sexo|usuario_chupa|metiendo_dedos|aire|bola/i;

const SINONIMOS_VERGA = /\b(polla|pija|poronga|pichula|pito|rabo|pinga|pene|verga)\b/gi;

// ------------------------------------------------------------
// 2. EXTRACCIÓN DE INTENCIÓN
// ------------------------------------------------------------
function normalizarTexto(texto) {
  let t = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  t = t.replace(SINONIMOS_VERGA, 'verga');
  return t;
}

/**
 * Extrae intención estructurada del mensaje del usuario.
 * Devuelve: { acciones, zonas, lados, poses, intensidad, raw }
 */
export function extraerIntencion(textoUsuario) {
  const t = normalizarTexto(textoUsuario);
  const intent = {
    acciones: new Set(),
    zonas: new Set(),
    lados: new Set(),
    poses: new Set(),
    intensidad: new Set(),
    raw: t
  };

  for (const [canon, sins] of Object.entries(INTENT_SYNONYMS.accion)) {
    if (sins.some(s => t.includes(s))) intent.acciones.add(canon);
  }
  for (const [canon, sins] of Object.entries(INTENT_SYNONYMS.zona)) {
    if (sins.some(s => t.includes(s))) intent.zonas.add(canon);
  }
  for (const [canon, sins] of Object.entries(INTENT_SYNONYMS.lado)) {
    if (sins.some(s => t.includes(s))) intent.lados.add(canon);
  }
  for (const [canon, sins] of Object.entries(INTENT_SYNONYMS.pose)) {
    if (sins.some(s => t.includes(s))) intent.poses.add(canon);
  }

  // Intensidad / profundidad
  if (/solo la punta|solo punta|solo la cabeza/.test(t)) intent.intensidad.add('punta');
  if (/hasta la mitad|la mitad/.test(t)) intent.intensidad.add('mitad');
  if (/hasta el fondo|toda la|deep|entera|se la traga/.test(t)) intent.intensidad.add('todo');
  if (/suave|lento|despacio/.test(t)) intent.intensidad.add('suave');
  if (/fuerte|rapido|duro|profundo/.test(t)) intent.intensidad.add('fuerte');

  // Caso especial: "bola izquierda/derecha" implica zona=bola + lado
  if (/\bbola(s)?\b/.test(t) || /\btesticul/.test(t)) {
    intent.zonas.add('bola');
    if (!intent.acciones.size) intent.acciones.add('chupar'); // default razonable
  }

  return intent;
}

// ------------------------------------------------------------
// 3. AUTO-METADATA para tags que no están en el catálogo
// ------------------------------------------------------------
function autoMetaFromTagName(tag) {
  const lower = String(tag).toLowerCase();
  const meta = {
    accion: [],
    zona: [],
    lado: null,
    intensidad: [],
    excluye: [],
    grupo: 'auto',
    peso: 1.0
  };

  if (/chup|oral|mam/.test(lower)) meta.accion.push('chupar');
  if (/lam/.test(lower)) meta.accion.push('lamer');
  if (/foll|cog|penetr/.test(lower)) meta.accion.push('follar');
  if (/handjob|paja/.test(lower)) meta.accion.push('paja');
  if (/bes/.test(lower)) meta.accion.push('besar');
  if (/muestra|viendo_verga/.test(lower)) meta.accion.push('mostrar');

  if (/bola/.test(lower)) meta.zona.push('bola');
  if (/pene|verga|pija/.test(lower)) meta.zona.push('pene');
  if (/punta|cabeza/.test(lower)) meta.zona.push('punta');
  if (/mitad/.test(lower)) meta.zona.push('mitad');
  if (/todo|deep|fondo/.test(lower)) meta.zona.push('todo');
  if (/ano|culo|anal/.test(lower)) meta.zona.push('culo');
  if (/teta/.test(lower)) meta.zona.push('tetas');

  if (/izquierda|izq|left/.test(lower)) meta.lado = 'izquierda';
  if (/derecha|der|right/.test(lower)) meta.lado = 'derecha';

  if (/doggy/.test(lower)) meta.pose = 'doggy';
  if (/mision/.test(lower)) meta.pose = 'misionero';
  if (/cowgirl/.test(lower)) meta.pose = 'cowgirl';
  if (/side/.test(lower)) meta.pose = 'side';
  if (/aire/.test(lower)) meta.pose = 'aire';
  if (/stand|de_pie|ventana/.test(lower)) meta.pose = 'de_pie';

  if (/bola/.test(lower)) meta.grupo = 'oral_bolas';
  else if (/chup|oral|lam/.test(lower)) meta.grupo = 'oral';
  else if (/anal/.test(lower)) meta.grupo = 'anal';
  else if (/doggy|mision|cowgirl|side|aire|stand/.test(lower)) meta.grupo = 'penetracion';

  // Pureza: si el tag tiene "todo" y el usuario no lo pidió, se penaliza después
  if (/todo_el_pene|deep/.test(lower)) meta.excluye.push('bola', 'punta');
  if (/solo_la_punta|punta/.test(lower)) meta.excluye.push('bola', 'todo');
  if (/bola/.test(lower)) meta.excluye.push('todo', 'deep', 'punta');

  return meta;
}

function getMeta(tag) {
  return TAG_CATALOG[tag] || autoMetaFromTagName(tag);
}

// ------------------------------------------------------------
// 4. SCORING: COBERTURA + PUREZA
// ------------------------------------------------------------
/**
 * Calcula score de un tag frente a la intención del usuario.
 * Retorna { score, cobertura, pureza, detalles }
 */
function scoreTagContraIntencion(tag, intent, prevTag = null) {
  const meta = getMeta(tag);
  let cobertura = 0;
  let pureza = 1.0;
  const detalles = [];

  // --- Cobertura de acciones ---
  if (intent.acciones.size > 0) {
    let accionHit = 0;
    for (const a of intent.acciones) {
      if (meta.accion && meta.accion.includes(a)) {
        accionHit++;
        cobertura += 3.5;
        detalles.push(`+accion:${a}`);
      }
    }
    if (accionHit === 0 && meta.accion && meta.accion.length) {
      pureza -= 0.35; // el tag tiene acción pero no la pedida
      detalles.push('-accion_mismatch');
    }
  }

  // --- Cobertura de zonas (muy importante) ---
  if (intent.zonas.size > 0) {
    let zonaHit = 0;
    for (const z of intent.zonas) {
      if (meta.zona && meta.zona.includes(z)) {
        zonaHit++;
        cobertura += 4.5;
        detalles.push(`+zona:${z}`);
      }
    }
    if (zonaHit === 0) {
      // Si el usuario pidió "bola" y el tag es de pene entero → pureza baja fuerte
      if (intent.zonas.has('bola') && meta.zona && meta.zona.includes('pene') && !meta.zona.includes('bola')) {
        pureza -= 0.55;
        detalles.push('-zona_bola_vs_pene');
      } else if (meta.zona && meta.zona.length) {
        pureza -= 0.3;
        detalles.push('-zona_mismatch');
      }
    }
  }

  // --- LADO (crítico para izquierda/derecha) ---
  if (intent.lados.size > 0) {
    const ladoPedido = [...intent.lados][0];
    if (meta.lado === ladoPedido) {
      cobertura += 8.0; // peso muy alto
      detalles.push(`+lado:${ladoPedido}`);
    } else if (meta.lado && meta.lado !== ladoPedido) {
      pureza -= 0.7; // lado contrario = casi descalificado
      detalles.push(`-lado_contrario:${meta.lado}`);
    } else if (!meta.lado) {
      // Tag genérico de bolas cuando se pidió lado → pureza media-baja
      pureza -= 0.25;
      detalles.push('-lado_faltante');
    }
  } else if (meta.lado) {
    // Usuario no pidió lado pero el tag tiene lado específico → ligera penalización
    pureza -= 0.1;
  }

  // --- Pose ---
  if (intent.poses.size > 0) {
    for (const p of intent.poses) {
      if (meta.pose === p) {
        cobertura += 5.0;
        detalles.push(`+pose:${p}`);
      }
    }
  }

  // --- Intensidad / profundidad ---
  if (intent.intensidad.size > 0) {
    for (const i of intent.intensidad) {
      if (meta.zona && meta.zona.includes(i)) {
        cobertura += 3.0;
        detalles.push(`+intensidad:${i}`);
      }
      if (meta.intensidad && meta.intensidad.includes(i)) {
        cobertura += 2.0;
      }
    }
    // Si pidió "solo punta" y el tag es "todo el pene"
    if (intent.intensidad.has('punta') && meta.zona && meta.zona.includes('todo')) {
      pureza -= 0.5;
      detalles.push('-intensidad_punta_vs_todo');
    }
    if (intent.intensidad.has('todo') && meta.zona && meta.zona.includes('punta')) {
      pureza -= 0.4;
    }
  }

  // --- Exclusiones del catálogo ---
  if (meta.excluye && meta.excluye.length) {
    for (const ex of meta.excluye) {
      if (intent.zonas.has(ex) || intent.intensidad.has(ex) || intent.acciones.has(ex)) {
        // El tag excluye algo que el usuario SÍ pidió → malo
        pureza -= 0.4;
        detalles.push(`-excluye_pedido:${ex}`);
      }
    }
  }

  // --- Memoria de escena ---
  if (prevTag) {
    const prevMeta = getMeta(prevTag);
    if (prevMeta.grupo && meta.grupo && prevMeta.grupo === meta.grupo) {
      cobertura += 1.8; // bonus por continuidad de grupo
      detalles.push('+memoria_grupo');
    }
    // Si el lado cambió pero el grupo es el mismo (bola izq → bola der)
    if (prevMeta.lado && meta.lado && prevMeta.lado !== meta.lado && prevMeta.grupo === meta.grupo) {
      cobertura += 2.5;
      detalles.push('+memoria_cambio_lado');
    }
  }

  // Peso del tag
  const peso = meta.peso || 1.0;
  cobertura *= peso;

  // Score final = cobertura * pureza (pureza actúa como multiplicador)
  pureza = Math.max(0.05, Math.min(1.0, pureza));
  const score = cobertura * pureza;

  return { score, cobertura, pureza, detalles, grupo: meta.grupo || 'auto' };
}

// ------------------------------------------------------------
// 5. MATCHER PRINCIPAL
// ------------------------------------------------------------
const UMBRAL_CONFIANZA = 4.5; // por debajo → fallback seguro

/**
 * Matcher avanzado.
 * @param {string} chica
 * @param {string} textoUsuario
 * @param {string} [textoBot='']
 * @param {string|null} [prevTag=null] - tag del mensaje anterior (memoria corta)
 * @param {boolean} [soloNoSex=false]
 * @returns {{ tag: string, confianza: number, razon: string, candidatos: Array }}
 */
export function matchTagAvanzado(chica, textoUsuario, textoBot = '', prevTag = null, soloNoSex = false) {
  let tags = listarTags(chica);
  if (soloNoSex) {
    const noSex = listarTagsNoSex(chica);
    if (noSex.length) tags = noSex;
  }
  if (!tags.length) {
    return { tag: 'hablando', confianza: 0, razon: 'sin_tags', candidatos: [] };
  }

  const intent = extraerIntencion(textoUsuario);
  // Si el bot también describe algo útil, lo mezclamos suave
  if (textoBot && textoBot.length > 10) {
    const intentBot = extraerIntencion(textoBot);
    for (const z of intentBot.zonas) intent.zonas.add(z);
    for (const a of intentBot.acciones) if (!intent.acciones.size) intent.acciones.add(a);
  }

  // Caso especial fuerte: solo muestra verga
  const soloMuestra =
    /muestro|te muestro|saco (la )?(pija|verga|polla)|mir[ae] mi (pija|verga)|ve(s)? mi (pija|verga)/.test(intent.raw) &&
    !/chup|mam[ao]|lam[ei]|foll|met[eo]|cog|bola/.test(intent.raw);
  if (soloMuestra) {
    const ver = tags.find(t => /usuario_muestra_su_verga|muestra_su_verga|viendo_verga|ve_mi_verga/i.test(t));
    if (ver) return { tag: ver, confianza: 12, razon: 'solo_muestra', candidatos: [] };
  }

  // Ranking de todos los tags
  const scored = [];
  for (const tag of tags) {
    if (tag === 'hablando') continue;
    const s = scoreTagContraIntencion(tag, intent, prevTag);
    if (s.score > 0.5) {
      scored.push({ tag, ...s });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  if (!scored.length || scored[0].score < UMBRAL_CONFIANZA) {
    // Fallback inteligente por grupo
    const fallback = fallbackPorGrupo(tags, intent, prevTag);
    return {
      tag: fallback,
      confianza: scored[0] ? scored[0].score : 0,
      razon: scored[0] ? 'baja_confianza→fallback' : 'sin_match→fallback',
      candidatos: scored.slice(0, 5)
    };
  }

  const best = scored[0];
  return {
    tag: best.tag,
    confianza: best.score,
    razon: `cobertura=${best.cobertura.toFixed(1)} pureza=${best.pureza.toFixed(2)} [${best.detalles.slice(0, 4).join(',')}]`,
    candidatos: scored.slice(0, 5)
  };
}

function fallbackPorGrupo(tags, intent, prevTag) {
  // Si hay memoria de grupo oral_bolas y el usuario sigue en oral → preferir chupando_bolas
  if (prevTag) {
    const prevMeta = getMeta(prevTag);
    if (prevMeta.grupo === 'oral_bolas' || prevMeta.grupo === 'oral') {
      const bolas = tags.find(t => t === 'chupando_bolas');
      if (bolas && intent.zonas.has('bola')) return bolas;
      const oral = tags.find(t => /chupando_solo_la_punta|lamiendo_pene|chupando_todo/.test(t));
      if (oral) return oral;
    }
  }

  if (intent.zonas.has('bola')) {
    const bolas = tags.find(t => t === 'chupando_bolas' || t.includes('chupando_bola'));
    if (bolas) return bolas;
  }
  if (intent.acciones.has('chupar') || intent.acciones.has('lamer')) {
    const oral = tags.find(t => /chupando_solo_la_punta|lamiendo_pene|chupando_todo_el_pene/.test(t));
    if (oral) return oral;
  }
  if (intent.poses.has('doggy')) {
    const d = tags.find(t => /doggy/.test(t));
    if (d) return d;
  }

  return tags.includes('hablando') ? 'hablando' : tags[0];
}

// ------------------------------------------------------------
// 6. API pública (compatibilidad + nuevas funciones)
// ------------------------------------------------------------
function parseOriginalModule(text) {
  const sandbox = { window: {}, exports: {}, module: { exports: {} } };
  const wrapped =
    text
      .replace(/export\s*\{\s*QuintiImagenesPrueba\s*\}\s*;?/g, '')
      .replace(/export\s+\{\s*QuintiImagenesPrueba\s*\}\s*;?/g, '') +
    '\n; return (typeof QuintiImagenesPrueba !== "undefined" ? QuintiImagenesPrueba : (window && window.QuintiImagenesPrueba));';
  const fn = new Function('window', 'exports', 'module', wrapped);
  const result = fn(sandbox.window, sandbox.exports, sandbox.module);
  const data = result || sandbox.window.QuintiImagenesPrueba;
  if (!data || typeof data !== 'object') throw new Error('No se pudo parsear QuintiImagenesPrueba');
  return data;
}

export async function ensureImagenesLoaded() {
  if (QuintiImagenesPrueba) return QuintiImagenesPrueba;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const res = await fetch(ORIGINAL_URL);
    if (!res.ok) throw new Error('No se pudo descargar imagenes.js original: ' + res.status);
    const text = await res.text();
    QuintiImagenesPrueba = parseOriginalModule(text);
    if (typeof window !== 'undefined') window.QuintiImagenesPrueba = QuintiImagenesPrueba;
    return QuintiImagenesPrueba;
  })();
  return _loadPromise;
}

ensureImagenesLoaded().catch((e) => console.warn('[imagenes]', e.message));

export function getDatosChica(chica) { return QuintiImagenesPrueba?.[chica] || null; }
export function getImagenSelector(chica) {
  const d = QuintiImagenesPrueba?.[chica];
  return d?.imagenSelector || d?.imagenes?.hablando?.url || '';
}
export function getDescripcionChica(chica) { return QuintiImagenesPrueba?.[chica]?.descripcion || ''; }
export function listarTags(chica) {
  const imgs = QuintiImagenesPrueba?.[chica]?.imagenes || {};
  return Object.keys(imgs).filter((k) => {
    const e = imgs[k];
    if (!e) return false;
    if (typeof e === 'string') return !!e;
    return !!(e.url && String(e.url).trim());
  });
}
export function esTagSex(tag) {
  if (!tag) return false;
  const t = String(tag);
  if (/_NOSEX$/i.test(t)) return false;
  if (PATRON_NO_SEX.test(t)) return false;
  if (/viendo_verga|usuario_muestra_su_verga|ve_mi_verga/i.test(t)) return false;
  return PATRON_SEX.test(t);
}
export function listarTagsNoSex(chica) { return listarTags(chica).filter((t) => !esTagSex(t)); }

function buscarTag(tags, claves, preferNoSex = false) {
  if (preferNoSex) {
    for (const clave of claves) {
      const c = clave.toLowerCase();
      const hitNoSex = tags.find((k) => k.toLowerCase().includes(c) && /_NOSEX$/i.test(k));
      if (hitNoSex) return hitNoSex;
    }
  }
  for (const clave of claves) {
    const c = clave.toLowerCase();
    const hit = tags.find((k) => k.toLowerCase().includes(c));
    if (hit) return hit;
  }
  return null;
}

// Mantener scoreTagDinamico por compatibilidad, pero ahora es secundario
export function scoreTagDinamico(chica, texto, soloNoSex = false) {
  const result = matchTagAvanzado(chica, texto, '', null, soloNoSex);
  return result.tag;
}

/**
 * inferirTagFuerte — ahora usa el matcher avanzado como camino principal.
 * Se mantiene la firma antigua para no romper logica.js.
 */
export function inferirTagFuerte(chica, textoBot, textoUsuario = '', soloNoSex = false, prevTag = null) {
  const result = matchTagAvanzado(chica, textoUsuario || textoBot, textoBot, prevTag, soloNoSex);
  return result.tag;
}

export function normalizarTag(chica, tag, soloNoSex = false) {
  let tags = listarTags(chica);
  if (soloNoSex) {
    const noSex = listarTagsNoSex(chica);
    if (noSex.length) tags = noSex;
  }
  if (!tags.length) return 'hablando';
  if (!tag) return tags.includes('hablando') ? 'hablando' : tags[0];
  const t = String(tag).trim();
  if (tags.includes(t)) return t;
  const lower = t.toLowerCase();
  const exact = tags.find((k) => k.toLowerCase() === lower);
  if (exact) return exact;
  const fuzzy = tags.find((k) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase()));
  if (fuzzy) return fuzzy;
  return tags.includes('hablando') ? 'hablando' : tags[0];
}

export function resolverImagen(chica, tag = 'hablando', soloNoSex = false) {
  const d = QuintiImagenesPrueba?.[chica];
  if (!d) return { url: '', audio: '', descripcion: '', tag: 'hablando' };
  let tagPedido = tag || 'hablando';
  if (soloNoSex && esTagSex(tagPedido)) tagPedido = 'hablando';
  const tagOk = normalizarTag(chica, tagPedido, soloNoSex);
  const imgs = d.imagenes || {};
  let entry = imgs[tagOk];
  if (!entry) entry = imgs.hablando || { url: d.imagenSelector || '', audio: '', descripcion: '' };
  if (typeof entry === 'string') return { url: entry, audio: '', descripcion: '', tag: tagOk };
  return { url: entry.url || d.imagenSelector || '', audio: entry.audio || '', descripcion: entry.descripcion || '', tag: tagOk };
}

export function getTagDescripcion(chica, tag) {
  const d = QuintiImagenesPrueba?.[chica];
  if (!d || !tag) return '';
  const entry = d.imagenes?.[tag];
  if (!entry || typeof entry === 'string') return '';
  return String(entry.descripcion || '').trim();
}

export function listarDescripcionesTags(chica, soloNoSex = false) {
  let tags = listarTags(chica);
  if (soloNoSex) {
    const noSex = listarTagsNoSex(chica);
    if (noSex.length) tags = noSex;
  }
  const out = [];
  for (const t of tags) {
    const desc = getTagDescripcion(chica, t);
    if (desc) out.push({ tag: t, descripcion: desc });
  }
  return out;
}

export { QuintiImagenesPrueba, TAG_CATALOG, extraerIntencion as _extraerIntencion };
