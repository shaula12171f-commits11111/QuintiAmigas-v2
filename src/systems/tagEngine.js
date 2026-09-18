// ============================================================
//  tagEngine.js — Sistema de tags estilo Nakardas (port a v2)
//  Prioridad: tags-reales > usuario-keywords > continuidad > bot > modelo
// ============================================================

import {
  listarTags, listarTagsNoSex, normalizarTag, esTagSex
} from './imagenes.js';

const PESOS = {
  VERBO: 10,
  OBJETO: 6,
  POSE: 5,
  CONTEXTO: 4,
  ASTERISCO: 8,
  MODIFICADOR: 3
};

const UMBRAL = 10;

// Tokens genéricos que casi no aportan especificidad (peso bajo)
const TOKENS_GENERICOS = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'en', 'a', 'al', 'un', 'una',
  'su', 'mi', 'tu', 'me', 'te', 'le', 'lo', 'se', 'y', 'o', 'con',
  'todo', 'solo', 'mientras', 'para', 'por', 'que', 'es', 'esta'
]);

// Sinónimos para tokens de tags (mensaje ↔ nombre de tag)
const SINONIMOS_TOKEN = {
  polla: ['polla', 'pija', 'verga', 'pene', 'miembro', 'pito'],
  pija: ['polla', 'pija', 'verga', 'pene', 'miembro', 'pito'],
  verga: ['polla', 'pija', 'verga', 'pene', 'miembro', 'pito'],
  pene: ['polla', 'pija', 'verga', 'pene', 'miembro', 'pito'],
  chupando: ['chupando', 'chupa', 'chupar', 'chupame', 'mamando', 'mama', 'mamad', 'oral'],
  chupa: ['chupando', 'chupa', 'chupar', 'chupame', 'mamando', 'mama'],
  lamiendo: ['lamiendo', 'lame', 'lamer', 'lameme'],
  jalo: ['jalo', 'jalar', 'jalando', 'tiro', 'tirar', 'tirando', 'agarro', 'agarrar'],
  jalar: ['jalo', 'jalar', 'jalando', 'tiro', 'tirar', 'tirando'],
  cabello: ['cabello', 'pelo', 'cabellos', 'pelos', 'coleta', 'coletas', 'trenza'],
  pelo: ['cabello', 'pelo', 'cabellos', 'pelos', 'coleta', 'coletas'],
  coleta: ['cabello', 'pelo', 'coleta', 'coletas', 'trenza'],
  mano: ['mano', 'manos'],
  cabeza: ['cabeza', 'cabezas'],
  empujandola: ['empujando', 'empujar', 'empujo', 'empujandola', 'empujandolo'],
  empujando: ['empujando', 'empujar', 'empujo', 'empujandola'],
  bolas: ['bolas', 'bola', 'testiculos', 'testicul', 'huevos'],
  bola: ['bolas', 'bola', 'testiculos', 'testicul', 'huevos'],
  punta: ['punta', 'cabeza', 'glande'],
  mitad: ['mitad'],
  doggystyle: ['doggy', 'doggystyle', 'perrito', 'cuatro'],
  doggy: ['doggy', 'doggystyle', 'perrito'],
  misionero: ['misionero', 'misioner'],
  cowgirl: ['cowgirl', 'montando', 'cabalgando', 'encima'],
  anal: ['anal', 'ano', 'culo'],
  nalguea: ['nalguea', 'nalgueo', 'nalgue', 'nalga', 'cachetada', 'azote'],
  agarra: ['agarra', 'agarro', 'agarrando', 'aprieta', 'aprieto', 'manoseo'],
  culo: ['culo', 'nalga', 'nalgas', 'trasero'],
  desnuda: ['desnuda', 'desnudate', 'sin ropa'],
  besando: ['besando', 'beso', 'besame', 'besar'],
  handjob: ['handjob', 'paja', 'jalo'],
  paja: ['handjob', 'paja']
};

const PATRONES_ASTERISCO = [
  { re: /\*[^*]*(?:bes[aoé]|besando|besar|kiss)[^*]*\*/gi, tag: 'besando', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:chup|mam[ao]|oral|felaci)[^*]*(?:punta|cabeza|glande)[^*]*\*/gi, tag: 'chupando_solo_la_punta_del_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:punta|cabeza)[^*]*(?:chup|mam|lam)[^*]*\*/gi, tag: 'chupando_solo_la_punta_del_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:chup|mam[ao])[^*]*(?:mitad)[^*]*\*/gi, tag: 'chupando_solo_la_mitad_del_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:chup|mam[ao]|oral)[^*]*(?:todo|fondo|entera|deep)[^*]*\*/gi, tag: 'chupando_todo_el_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:chup|mam[ao]|oral|felaci)[^*]*(?:pene|verga|polla|pija|miembro)[^*]*\*/gi, tag: 'chupando_todo_el_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:pene|verga|polla|pija)[^*]*(?:chup|mam|oral)[^*]*\*/gi, tag: 'chupando_todo_el_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:chup|mam|lam)[^*]*(?:bola|bolas|testicul|huevo)[^*]*\*/gi, tag: 'chupando_bolas', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:bola|bolas)[^*]*(?:chup|mam|lam)[^*]*\*/gi, tag: 'chupando_bolas', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:lam(?:e|iendo|er))[^*]*(?:pene|verga|polla)[^*]*\*/gi, tag: 'lamiendo_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:doggy|a cuatro|por detr[aá]s|de espaldas|perrito)[^*]*\*/gi, tag: 'doggystyle', peso: PESOS.POSE },
  { re: /\*[^*]*(?:misioner)[^*]*\*/gi, tag: 'misionero', peso: PESOS.POSE },
  { re: /\*[^*]*(?:reverse\s*cowgirl|al rev[eé]s)[^*]*\*/gi, tag: 'reverse_cowgirl', peso: PESOS.POSE },
  { re: /\*[^*]*(?:cowgirl|montando|cabalg)[^*]*\*/gi, tag: 'cowgirl', peso: PESOS.POSE },
  { re: /\*[^*]*(?:sidefuck|de lado|de costado)[^*]*\*/gi, tag: 'sidefuck', peso: PESOS.POSE },
  { re: /\*[^*]*(?:de pie|standfuck|contra la pared)[^*]*\*/gi, tag: 'standfuck_follando_de_pie', peso: PESOS.POSE },
  { re: /\*[^*]*(?:en el aire|levantad)[^*]*\*/gi, tag: 'follando_en_el_aire', peso: PESOS.POSE },
  { re: /\*[^*]*(?:anal|por el culo|en el ano)[^*]*\*/gi, tag: 'follando_anal', peso: PESOS.POSE },
  { re: /\*[^*]*(?:handjob|paja|con la mano|jal[ao])[^*]*\*/gi, tag: 'handjob_paja', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:me\s*corro|eyacul|corrida|semen|leche|esperma|cum)[^*]*(?:cara|rostro|facial|face)[^*]*\*/gi, tag: 'me_corro_en_su_cara', peso: PESOS.VERBO + 6 },
  { re: /\*[^*]*(?:cara|rostro|facial|face)[^*]*(?:me\s*corro|eyacul|corrida|semen|leche|esperma|cum)[^*]*\*/gi, tag: 'me_corro_en_su_cara', peso: PESOS.VERBO + 6 },
  { re: /\*[^*]*(?:me\s*corro|eyacul|corrida|semen|leche|esperma|cum)[^*]*(?:boca|labios|garganta|trag)[^*]*\*/gi, tag: 'me_corro_en_su_boca', peso: PESOS.VERBO + 4 },
  { re: /\*[^*]*(?:boca|labios|garganta)[^*]*(?:me\s*corro|eyacul|corrida|semen|leche|esperma|cum)[^*]*\*/gi, tag: 'me_corro_en_su_boca', peso: PESOS.VERBO + 4 },
  { re: /\*[^*]*(?:verga|pija|polla|pene)[^*]*(?:en|contra|sobre|choc)[^*]*(?:cara|rostro)[^*]*\*/gi, tag: 'verga_en_su_cara', peso: PESOS.VERBO + 3 },
  { re: /\*[^*]*(?:desnud|sin ropa)[^*]*\*/gi, tag: 'desnuda', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:mostrando|ense[nñ]a)[^*]*(?:culo|nalga|tanga)[^*]*\*/gi, tag: 'mostrando_culo_tanga', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:muestro|muestra)[^*]*(?:verga|pija|polla|pene)[^*]*\*/gi, tag: 'usuario_muestra_su_verga', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:agarr[oóa]|apret[oóa]|manose)[^*]*(?:culo|nalga)[^*]*\*/gi, tag: 'usuario_agarra_el_culo', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:nalgue|nalga|cachetad|azote|pego)[^*]*(?:culo|nalga)[^*]*\*/gi, tag: 'usuario_nalguea_el_culo', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:culo|nalga)[^*]*(?:nalgue|cachetad|azote)[^*]*\*/gi, tag: 'usuario_nalguea_el_culo', peso: PESOS.VERBO }
];

const PALABRAS_CLAVE = [
  { palabras: ['besame', 'besarme', 'besarte', 'besando', 'beso', 'besa', 'besar'], tag: 'besando', peso: PESOS.VERBO },
  { palabras: ['chupame', 'mamame', 'chupamela', 'mamamela', 'chupa', 'chupando', 'mama', 'mamando', 'oral', 'blowjob', 'deepthroat'], tag: 'chupando_todo_el_pene', peso: PESOS.VERBO },
  { palabras: ['pene', 'verga', 'polla', 'pija', 'miembro'], tag: 'chupando_todo_el_pene', peso: PESOS.OBJETO },
  { palabras: ['solo la punta', 'la punta', 'solo punta', 'cabeza del'], tag: 'chupando_solo_la_punta_del_pene', peso: PESOS.OBJETO },
  { palabras: ['hasta la mitad', 'la mitad', 'mitad del'], tag: 'chupando_solo_la_mitad_del_pene', peso: PESOS.OBJETO },
  { palabras: ['hasta el fondo', 'toda la', 'entera', 'deepthroat', 'se la traga'], tag: 'chupando_todo_el_pene', peso: PESOS.MODIFICADOR },
  { palabras: ['bolas', 'bola', 'testicul', 'huevos'], tag: 'chupando_bolas', peso: PESOS.OBJETO },
  { palabras: ['lame', 'lamiendo', 'lamer', 'lameme'], tag: 'lamiendo_pene', peso: PESOS.VERBO },
  { palabras: ['doggy', 'doggystyle', 'a cuatro', 'por detras', 'por detrás', 'de espaldas', 'perrito'], tag: 'doggystyle', peso: PESOS.POSE },
  { palabras: ['misionero', 'misioner', 'boca arriba'], tag: 'misionero', peso: PESOS.POSE },
  { palabras: ['cowgirl', 'me monto', 'cabalg'], tag: 'cowgirl', peso: PESOS.POSE },
  { palabras: ['reverse cowgirl', 'al reves encima', 'al revés'], tag: 'reverse_cowgirl', peso: PESOS.POSE },
  { palabras: ['de lado', 'de costado', 'sidefuck'], tag: 'sidefuck', peso: PESOS.POSE },
  { palabras: ['de pie', 'standfuck', 'contra la pared'], tag: 'standfuck_follando_de_pie', peso: PESOS.POSE },
  { palabras: ['en el aire', 'levantada', 'suspendida'], tag: 'follando_en_el_aire', peso: PESOS.POSE },
  { palabras: ['anal', 'por el culo', 'en el ano'], tag: 'follando_anal', peso: PESOS.POSE },
  { palabras: ['handjob', 'paja', 'con la mano', 'te la jalo', 'jalame'], tag: 'handjob_paja', peso: PESOS.VERBO },
  { palabras: ['desnudate', 'desnúdate', 'desnuda', 'sin ropa', 'quitate la ropa'], tag: 'desnuda', peso: PESOS.VERBO },
  { palabras: ['muestra el culo', 'mostrame el culo', 'enseña el culo', 'da la vuelta'], tag: 'mostrando_culo_tanga', peso: PESOS.VERBO },
  { palabras: ['te muestro', 'muestro mi', 'saco la pija', 'saco la verga', 'mira mi verga', 'mira mi pija'], tag: 'usuario_muestra_su_verga', peso: PESOS.VERBO },
  { palabras: ['agarra el culo', 'agarrame el culo', 'aprieta el culo', 'le agarro el culo', 'le agarra el culo', 'agarro el culo', 'agarrando el culo', 'le aprieto el culo', 'manoseo el culo', 'le manoseo'], tag: 'usuario_agarra_el_culo', peso: PESOS.VERBO },
  { palabras: ['agarro', 'agarrando', 'aprieto', 'manoseo'], tag: 'usuario_agarra_el_culo', peso: PESOS.VERBO },
  { palabras: [
    'nalguea', 'nalgueame', 'nalgueo', 'nalgue', 'nalga', 'nalgas',
    'azote en el culo', 'cachetada en el culo', 'cachetada', 'azote',
    'pego en el culo', 'le doy una nalgada', 'nalgada', 'nalgueándole',
    'le nalgueo', 'te nalgueo', 'la nalgueo', 'lo nalgueo'
  ], tag: 'usuario_nalguea_el_culo', peso: PESOS.VERBO },
  { palabras: ['me corro en su cara', 'corro en su cara', 'me corro en la cara', 'corrida en la cara', 'corrida en su cara', 'semen en su cara', 'semen en la cara', 'leche en su cara', 'leche en la cara', 'facial', 'cum en su cara', 'cum en la cara', 'acabo en su cara', 'acabo en la cara'], tag: 'me_corro_en_su_cara', peso: PESOS.VERBO + 8 },
  { palabras: ['me corro en su boca', 'corro en su boca', 'me corro en la boca', 'corrida en la boca', 'corrida en su boca', 'semen en su boca', 'semen en la boca', 'leche en su boca', 'leche en la boca', 'cum en su boca', 'acabo en su boca', 'acabo en la boca', 'traga el semen', 'traga la leche'], tag: 'me_corro_en_su_boca', peso: PESOS.VERBO + 6 },
  { palabras: ['verga en su cara', 'pija en su cara', 'polla en su cara', 'pene en su cara', 'choco mi verga en su cara'], tag: 'verga_en_su_cara', peso: PESOS.VERBO + 4 }
];

const PATRONES_CONTINUAR = [
  /\bsigue así\b/i, /\bcontinu[aá]\b/i, /\bsegu[ií]\b/i, /\bno pares\b/i,
  /\botra vez\b/i, /\bm[aá]s\b/i, /\bdale\b/i, /\bvamos\b/i,
  /\bas[ií] me gusta\b/i, /\bquiero m[aá]s\b/i, /\bno cambies\b/i,
  /\bigual\b/i, /\bmismo\b/i, /\bmanten[eé]\b/i, /\bas[ií]\b/i
];

const PATRONES_CAMBIAR = [
  /\bahora\b/i, /\bcambi[aá]\b/i, /\bpar[aá]\b/i, /\bbasta\b/i,
  /\bsuficiente\b/i, /\bprobemos\b/i, /\bhagamos\b/i, /\bquiero que\b/i,
  /\botra cosa\b/i, /\bdistinto\b/i, /\bpasemos a\b/i, /\bdej[aá] eso\b/i,
  /\bcambiemos\b/i
];

const PALABRAS_ACCION_CLARA = /\b(nalgue|nalga|cachetad|azote|pego|agarr|apriet|manose|chup|mam[ao]|lam[ei]|foll|cog|met[eo]|bes[ao]|desnud|muestro|saco|paja|handjob|doggy|mision|cowgirl|anal|corro|semen|cum)\b/i;


/** True si el texto es pregunta/sugerencia y no una orden de acto sexual. */
export function esTextoSugerencia(texto) {
  const m = String(texto || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!m) return false;
  if (/\b(follame|cogeme|chupame|mamame|hacelo|hazlo|metela|me corro|eyacul|assjob|titjob|paizuri)\b/.test(m)) return false;
  const esPregunta = /\?|¿/.test(texto) || /^(que|qué|como|cómo|cual|cuál)\b/.test(m);
  const esPref = /\b(quer[eé]s|prefer[ií]s|te gustar[ií]a|en que posici[oó]n|qu[eé] posici[oó]n|te prender[ií]a)\b/.test(m);
  return esPregunta || esPref;
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function tokenizaTag(tag) {
  return norm(tag).replace(/_/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !TOKENS_GENERICOS.has(t));
}

function tokenApareceEnMensaje(token, msgNorm) {
  if (msgNorm.includes(token)) return true;
  const sins = SINONIMOS_TOKEN[token];
  if (sins) {
    for (const s of sins) {
      if (msgNorm.includes(s)) return true;
    }
  }
  // match parcial suave (token de 4+ chars)
  if (token.length >= 4) {
    const re = new RegExp('\\b' + token.slice(0, Math.max(4, token.length - 1)));
    if (re.test(msgNorm)) return true;
  }
  return false;
}

/**
 * Match inteligente: compara el mensaje del usuario contra los tags REALES
 * disponibles de la chica. Premia especificidad (más tokens distintivos).
 *
 * Casos que resuelve:
 *  - "chupando_polla_le_jalo_el_cabello"  → match exacto
 *  - "nino me chupa la polla y yo le jalo el cabello" → match por tokens
 *  - "mientras chupa mi polla le jalo el cabello" → idem
 */
export function matchContraTagsReales(mensaje, tagsDisponibles) {
  if (!mensaje || !tagsDisponibles?.length) {
    return { tag: null, puntuacion: 0, detalle: null };
  }
  if (esTextoSugerencia(mensaje)) {
    return { tag: null, puntuacion: 0, detalle: 'sugerencia' };
  }

  const msgNorm = norm(mensaje).replace(/_/g, ' ');
  const msgCompact = msgNorm.replace(/\s+/g, '');

  let best = null;
  let bestScore = 0;
  const candidatos = [];

  for (const tag of tagsDisponibles) {
    if (tag === 'hablando') continue;

    const tagNorm = norm(tag);
    const tagSpaces = tagNorm.replace(/_/g, ' ');
    const tagCompact = tagNorm.replace(/_/g, '');

    // 1) Match exacto del nombre del tag (con o sin guiones bajos)
    if (msgNorm === tagSpaces || msgCompact === tagCompact || msgNorm.includes(tagSpaces) || msgCompact.includes(tagCompact)) {
      const score = 100 + tagSpaces.length; // exacto gana siempre
      candidatos.push({ tag, score, tipo: 'exacto' });
      if (score > bestScore) {
        bestScore = score;
        best = { tag, puntuacion: score, detalle: 'exacto' };
      }
      continue;
    }

    // 2) Scoring por tokens del nombre del tag
    const tokens = tokenizaTag(tag);
    if (!tokens.length) continue;

    let hits = 0;
    let pesoHits = 0;
    const matched = [];

    for (const tok of tokens) {
      if (tokenApareceEnMensaje(tok, msgNorm)) {
        hits++;
        // Tokens distintivos (largos / no genéricos de acción básica) valen más
        const esDistintivo = tok.length >= 5 || ['cabello', 'pelo', 'coleta', 'jalo', 'jalar', 'empujando', 'empujandola', 'nalguea', 'agarra'].includes(tok);
        const w = esDistintivo ? 12 : 5;
        pesoHits += w;
        matched.push(tok);
      }
    }

    if (hits === 0) continue;

    // Cobertura: % de tokens del tag que aparecen en el mensaje
    const cobertura = hits / tokens.length;

    // Penalizar tags genéricos cortos cuando el mensaje tiene modificadores extra
    // (ej. mensaje tiene "cabello" pero el tag genérico no lo tiene)
    let bonusEspecificidad = 0;
    if (tokens.length >= 3 && cobertura >= 0.6) {
      bonusEspecificidad = tokens.length * 4; // premia tags largos/específicos
    }

    // Score final
    let score = pesoHits * cobertura * 2 + bonusEspecificidad;

    // Si casi todos los tokens matchean y el tag es específico → boost fuerte
    if (cobertura >= 0.75 && tokens.length >= 3) {
      score += 25;
    }
    if (cobertura >= 0.9 && tokens.length >= 4) {
      score += 20;
    }

    candidatos.push({ tag, score, tipo: 'tokens', hits, cobertura: cobertura.toFixed(2), matched });

    if (score > bestScore) {
      bestScore = score;
      best = {
        tag,
        puntuacion: score,
        detalle: `tokens:${matched.join('+')} cov=${cobertura.toFixed(2)}`
      };
    }
  }

  // Umbral mínimo para aceptar match por tokens (exacto siempre pasa)
  const UMBRAL_TOKENS = 18;
  if (!best || (best.detalle !== 'exacto' && best.puntuacion < UMBRAL_TOKENS)) {
    return { tag: null, puntuacion: best?.puntuacion || 0, detalle: null, candidatos: candidatos.sort((a, b) => b.score - a.score).slice(0, 5) };
  }

  return {
    tag: best.tag,
    puntuacion: best.puntuacion,
    detalle: best.detalle,
    candidatos: candidatos.sort((a, b) => b.score - a.score).slice(0, 5)
  };
}

export function detectarAccionEnTexto(texto, { umbral = UMBRAL } = {}) {
  if (!texto || !String(texto).trim()) {
    return { tag: null, puntuacion: 0, coincidencias: [] };
  }
  if (esTextoSugerencia(texto)) {
    return { tag: null, puntuacion: 0, coincidencias: [], razon: 'sugerencia_sin_acto' };
  }
  const raw = String(texto);
  const lower = norm(raw);
  const scores = Object.create(null);
  const coincidencias = [];

  for (const { re, tag, peso } of PATRONES_ASTERISCO) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const pts = peso + PESOS.ASTERISCO;
      scores[tag] = (scores[tag] || 0) + pts;
      coincidencias.push({ tipo: 'asterisco', tag, texto: m[0].slice(0, 60), peso: pts });
    }
  }

  for (const { palabras, tag, peso } of PALABRAS_CLAVE) {
    for (const p of palabras) {
      if (lower.includes(norm(p))) {
        scores[tag] = (scores[tag] || 0) + peso;
        coincidencias.push({ tipo: 'palabra', tag, texto: p, peso });
      }
    }
  }

  const tieneOral = /chup|mam[ao]|oral|felaci|blowjob/.test(lower);
  const tienePene = /pene|verga|polla|pija|miembro/.test(lower);
  const tienePunta = /punta|cabeza|glande/.test(lower);
  const tieneMitad = /mitad/.test(lower);
  const tieneBolas = /bola|testicul|huevo/.test(lower);
  if (tieneOral && tienePunta) {
    scores['chupando_solo_la_punta_del_pene'] = (scores['chupando_solo_la_punta_del_pene'] || 0) + 8;
  } else if (tieneOral && tieneMitad) {
    scores['chupando_solo_la_mitad_del_pene'] = (scores['chupando_solo_la_mitad_del_pene'] || 0) + 8;
  } else if (tieneOral && tieneBolas) {
    scores['chupando_bolas'] = (scores['chupando_bolas'] || 0) + 8;
  } else if (tieneOral && tienePene) {
    scores['chupando_todo_el_pene'] = (scores['chupando_todo_el_pene'] || 0) + 5;
  }

  const tieneCum = /me\s*corro|eyacul|corrida|semen|leche|esperma|\bcum\b|acabo|termin[oa]/.test(lower);
  const tieneCara = /\bcara\b|rostro|facial|face/.test(lower);
  const tieneBocaCum = /\bboca\b|labios|garganta|trag/.test(lower);
  if (tieneCum && tieneCara) {
    scores['me_corro_en_su_cara'] = (scores['me_corro_en_su_cara'] || 0) + 20;
    if (scores['me_corro_en_su_boca']) scores['me_corro_en_su_boca'] = Math.max(0, scores['me_corro_en_su_boca'] - 15);
  } else if (tieneCum && tieneBocaCum) {
    scores['me_corro_en_su_boca'] = (scores['me_corro_en_su_boca'] || 0) + 16;
  } else if (tieneCum && !tieneCara) {
    scores['me_corro_en_su_boca'] = (scores['me_corro_en_su_boca'] || 0) + 8;
  }
  if (/verga|pija|polla|pene/.test(lower) && tieneCara && /(en|contra|sobre|choc)/.test(lower) && !tieneCum) {
    scores['verga_en_su_cara'] = (scores['verga_en_su_cara'] || 0) + 12;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] < umbral) {
    return { tag: null, puntuacion: ranked[0]?.[1] || 0, coincidencias };
  }
  return { tag: ranked[0][0], puntuacion: ranked[0][1], coincidencias, candidatos: ranked.slice(0, 5) };
}

export function detectarIntencionContinuidad(mensaje, accionEnCurso = null) {
  if (!mensaje || !String(mensaje).trim()) {
    return { intencion: 'neutral', confianza: 0 };
  }
  const msg = String(mensaje).trim();
  let cont = 0, camb = 0;
  for (const p of PATRONES_CONTINUAR) if (p.test(msg)) cont++;
  for (const p of PATRONES_CAMBIAR) if (p.test(msg)) camb++;

  if (msg.length < 18 && PALABRAS_ACCION_CLARA.test(msg)) {
    return { intencion: 'cambiar', confianza: 0.7 };
  }

  if (cont === 0 && camb === 0) {
    if (accionEnCurso && msg.length < 12 && !PALABRAS_ACCION_CLARA.test(msg)) {
      return { intencion: 'continuar', confianza: 0.35 };
    }
    return { intencion: 'neutral', confianza: 0.2 };
  }
  if (cont > camb) return { intencion: 'continuar', confianza: Math.min(cont / 2, 1) };
  if (camb > cont) return { intencion: 'cambiar', confianza: Math.min(camb / 2, 1) };
  return { intencion: 'neutral', confianza: 0.3 };
}

export function encontrarTagMasPertinente(tagSolicitado, tagsDisponibles) {
  if (!tagSolicitado || !tagsDisponibles?.length) return null;
  if (tagsDisponibles.includes(tagSolicitado)) return tagSolicitado;

  const base = tagSolicitado.replace(/_\d+$/, '').replace(/\d+$/, '');
  const variantes = tagsDisponibles.filter((t) => {
    const tb = t.replace(/_\d+$/, '').replace(/\d+$/, '');
    return tb === base;
  });
  if (variantes.length) return variantes[Math.floor(Math.random() * variantes.length)];

  const sol = tagSolicitado.toLowerCase().replace(/_/g, ' ');
  for (const t of tagsDisponibles) {
    const tn = t.toLowerCase().replace(/_/g, ' ');
    if (tn === sol) return t;
  }
  for (const t of tagsDisponibles) {
    const tn = t.toLowerCase().replace(/_/g, ' ');
    if (tn.includes(sol) || sol.includes(tn)) return t;
  }

  const tokensSol = sol.split(/\s+/).filter((x) => x.length > 2);
  let best = null, bestScore = 0;
  for (const t of tagsDisponibles) {
    const tokens = t.toLowerCase().replace(/_/g, ' ').split(/\s+/);
    const hit = tokensSol.filter((x) => tokens.some((y) => y.includes(x) || x.includes(y))).length;
    if (hit > bestScore) { bestScore = hit; best = t; }
  }
  if (bestScore >= 2) return best;
  return null;
}

function tagsDe(chica, soloNoSex) {
  const tags = soloNoSex ? listarTagsNoSex(chica) : listarTags(chica);
  return tags?.length ? tags : ['hablando'];
}


/**
 * Filtra tags según estado de ropa actual.
 * Si está desnuda → elimina / penaliza fuerte tags con tanga, ropa, bikini, etc.
 */
function filtrarTagsPorRopa(tags, ropaActual) {
  if (!ropaActual || ropaActual === 'desconocida') return tags;
  const r = String(ropaActual).toLowerCase();

  return tags.filter(tag => {
    const t = String(tag).toLowerCase();
    if (r === 'desnuda') {
      // Prohibir tags que claramente implican ropa
      if (/tanga|bikini|ropa_|vestido|yukata|sujetador|lenceria|cosplay|idol|quitandose/.test(t) && !/desnuda|sin_ropa|sinropa/.test(t)) {
        return false;
      }
    }
    if (r === 'tanga') {
      if (/bikini_playa|ropa_idol|ropa_vestido|yukata/.test(t)) return false;
    }
    if (r === 'bikini') {
      if (/ropa_idol|ropa_vestido|yukata/.test(t)) return false;
    }
    return true;
  });
}

/**
 * Señales semánticas del texto (usuario + bot)
 */
function extraerSenales(texto) {
  const t = norm(texto);
  return {
    quiereCulo: /culo|nalga|trasero|ass|mostr.*culo|ense[nñ].*culo|da la vuelta|gira|arquea/.test(t),
    quiereDesnuda: /desnud|sin ropa|sin nada|ya no lleva|no lleva nada|completamente desnud|totalmente desnud|sin ropa interior|sin pant/.test(t),
    quiereTanga: /tanga|microtanga|hilo dental/.test(t),
    quiereTetas: /teta|pecho|seno|mostrar.*teta/.test(t),
    quiereOral: /chup|mam[ao]|oral|lam[ei]|blowjob|deepthroat/.test(t),
    quierePenetracion: /foll|cog|penetr|meto|metela|doggy|mision|cowgirl|anal/.test(t),
    quiereAssjob: /assjob|entre (las )?nalgas|frot.*culo|pija.*culo|verga.*culo/.test(t),
    mencionaRopa: /tanga|bikini|ropa|vestid|pantal|falda|sujetador|lencer/.test(t)
  };
}

/**
 * Score dinámico de un tag contra las señales + tokens del texto
 */
function scoreTagDinamicoContraTexto(tag, senales, textoNorm, accionAnterior) {
  const t = norm(tag).replace(/_/g, ' ');
  const tokens = t.split(/\s+/).filter(x => x.length > 2);
  let score = 0;
  const detalles = [];

  // 1. Match de tokens del nombre del tag en el texto
  let hits = 0;
  for (const tok of tokens) {
    if (textoNorm.includes(tok) || tokenApareceEnMensaje(tok, textoNorm)) {
      hits++;
      score += tok.length >= 5 ? 8 : 4;
    }
  }
  if (hits > 0) detalles.push(`tok:${hits}/${tokens.length}`);

  // 2. Señales semánticas fuertes
  if (senales.quiereCulo) {
    if (/culo|nalga|ass|mostrando_culo|moviendo_el_culo/.test(t)) {
      score += 18;
      detalles.push('+culo');
    }
  }
  if (senales.quiereDesnuda) {
    if (/desnuda|sin_ropa|sinropa|sin_ropa/.test(t)) {
      score += 22;
      detalles.push('+desnuda');
    }
    // Penalizar fuerte tags con tanga/ropa si el texto dice desnuda
    if (/tanga|bikini|ropa_|vestido|lenceria/.test(t) && !/desnuda|sin_ropa/.test(t)) {
      score -= 25;
      detalles.push('-tanga_vs_desnuda');
    }
  }
  if (senales.quiereTanga) {
    if (/tanga/.test(t)) {
      score += 16;
      detalles.push('+tanga');
    }
  }
  if (senales.quiereOral && /chup|oral|mam|lam|blow/.test(t)) {
    score += 14;
    detalles.push('+oral');
  }
  if (senales.quierePenetracion && /doggy|mision|cowgirl|foll|anal|penetr|side|stand|aire/.test(t)) {
    score += 14;
    detalles.push('+penetracion');
  }
  if (senales.quiereAssjob && /assjob|culo.*job|entre.*nalga|frot.*culo/.test(t)) {
    score += 20;
    detalles.push('+assjob');
  }

  // 3. Continuidad
  if (accionAnterior && norm(accionAnterior) === norm(tag)) {
    score += 12;
    detalles.push('+continuidad');
  } else if (accionAnterior) {
    const prev = norm(accionAnterior);
    // mismo grupo
    if ((/culo|nalga/.test(prev) && /culo|nalga/.test(t)) ||
        (/chup|oral/.test(prev) && /chup|oral/.test(t)) ||
        (/doggy|mision|cowgirl|foll/.test(prev) && /doggy|mision|cowgirl|foll/.test(t))) {
      score += 6;
      detalles.push('+grupo');
    }
  }

  // 4. Penalizar "hablando" si hay señales de acción
  if (tag === 'hablando' && (senales.quiereCulo || senales.quiereOral || senales.quierePenetracion || senales.quiereDesnuda)) {
    score -= 10;
  }

  return { score, detalles };
}

/**
 * Motor dinámico principal: elige el mejor tag disponible
 * según tags reales de imagenes.js + estado de ropa + texto.
 */
function elegirTagDinamico({
  chica,
  mensajeUsuario = '',
  textoBot = '',
  soloNoSex = false,
  accionAnterior = null,
  ropaActual = null,
  tagModelo = ''
}) {
  let tags = tagsDe(chica, soloNoSex);
  if (!tags.length) return { tag: 'hablando', razon: 'sin_tags', puntuacion: 0, fuente: 'dinamico' };

  // 1. Filtro fuerte por ropa
  const tagsAntes = tags.length;
  tags = filtrarTagsPorRopa(tags, ropaActual);
  const filtradosPorRopa = tagsAntes - tags.length;

  // 2. Señales del texto combinado (usuario + bot)
  const textoCombo = (mensajeUsuario || '') + ' ' + (textoBot || '');
  const senales = extraerSenales(textoCombo);
  const textoNorm = norm(textoCombo);

  // 3. Score cada tag
  const scored = [];
  for (const tag of tags) {
    if (tag === 'hablando' && tags.length > 3) continue; // solo al final
    const { score, detalles } = scoreTagDinamicoContraTexto(tag, senales, textoNorm, accionAnterior);
    if (score > 0) {
      scored.push({ tag, score, detalles });
    }
  }

  // También dar un poco de peso al tag que propuso el modelo si está disponible
  if (tagModelo) {
    const tagNorm = normalizarTag(chica, tagModelo, soloNoSex);
    const exists = scored.find(s => s.tag === tagNorm);
    if (exists) {
      exists.score += 8;
      exists.detalles.push('+modelo');
    } else if (tags.includes(tagNorm)) {
      scored.push({ tag: tagNorm, score: 8, detalles: ['+modelo_solo'] });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  if (!scored.length || scored[0].score < 6) {
    // Fallback: si hay señal de culo + desnuda y existe un tag de culo sin tanga
    if (senales.quiereCulo && senales.quiereDesnuda) {
      const culoDesnudo = tags.find(t => /mostrando_culo(?!.*tanga)|culo.*sin_ropa|culo.*desnuda|desnuda/.test(t) && !/tanga/.test(t));
      if (culoDesnudo) {
        return {
          tag: culoDesnudo,
          razon: `dinamico:fallback_culo_desnudo(ropa=${ropaActual})`,
          puntuacion: 15,
          fuente: 'dinamico',
          candidatos: scored.slice(0, 5)
        };
      }
    }
    return {
      tag: tags.includes('hablando') ? 'hablando' : tags[0],
      razon: `dinamico:fallback(score_bajo)`,
      puntuacion: 0,
      fuente: 'dinamico',
      candidatos: scored.slice(0, 5)
    };
  }

  const best = scored[0];
  return {
    tag: best.tag,
    razon: `dinamico:${best.detalles.join('+')}(score=${best.score.toFixed(1)}${filtradosPorRopa ? `,ropa_filtro=-${filtradosPorRopa}` : ''})`,
    puntuacion: best.score,
    fuente: 'dinamico',
    candidatos: scored.slice(0, 5)
  };
}

export function resolverTagEscena({
  chica,
  mensajeUsuario = '',
  textoBot = '',
  tagModelo = '',
  soloNoSex = true,
  accionAnterior = null,
  intencionUsuario = null,
  ropaActual = null   // NUEVO: estado de ropa
}) {
  // ─── MOTOR DINÁMICO (prioridad máxima) ───
  // Se basa en los tags REALES de imagenes.js + estado de ropa + señales del texto
  const dinamico = elegirTagDinamico({
    chica,
    mensajeUsuario,
    textoBot,
    soloNoSex,
    accionAnterior,
    ropaActual,
    tagModelo
  });

  // Si el dinámico tiene buena confianza, lo usamos
  if (dinamico.puntuacion >= 10 || dinamico.fuente === 'dinamico') {
    return dinamico;
  }

  // ─── Fallback: match exacto contra tags reales (legacy) ───
  const tags = tagsDe(chica, soloNoSex);
  const realMatch = matchContraTagsReales(mensajeUsuario + ' ' + textoBot, tags);
  if (realMatch.tag && realMatch.tag !== 'hablando' && realMatch.puntuacion >= 18) {
    return {
      tag: realMatch.tag,
      razon: `tags-reales:${realMatch.detalle}(${Math.round(realMatch.puntuacion)})`,
      puntuacion: realMatch.puntuacion,
      fuente: 'tags-reales'
    };
  }

  // ─── Último fallback ───
  return {
    tag: dinamico.tag || 'hablando',
    razon: dinamico.razon || 'fallback_final',
    puntuacion: dinamico.puntuacion || 0,
    fuente: dinamico.fuente || 'fallback'
  };
}
