// ============================================================
//  Imágenes v2 — pack completo de la repo original
//  + clasificación sex / no-sex + inferencia fuerte
// ============================================================

const ORIGINAL_URL =
  'https://raw.githubusercontent.com/shaula12171f-commits11111/Nakardasputardas17/main/src/systems/imagenes.js';

let QuintiImagenesPrueba = null;
let _loadPromise = null;

// Tags que NO son de sexo explícito (ropa, hablando, poses suaves, NOSEX)
const PATRON_NO_SEX =
  /^(hablando|ropa_|desnuda$|desnuda_en_cama|besando$|mostrando_sujetador|quitandose_la_ropa|selfie_|.*_NOSEX$|moviendo_el_culo$)/i;

// Cualquier tag que implique acto sexual o genitales en acción
const PATRON_SEX =
  /chup|oral|pene|verga|pija|doggy|mision|anal|cowgirl|handjob|paja|69|foll|cum|corro|semen|dedo|squirt|lamiendo|nalg|standfuck|sidefuck|mattin|estir|ano|concha|tetas?_de|agarra_el_culo(?!_.*NOSEX)|rozo_mi|post_sexo|usuario_chupa|metiendo_dedos/i;

function parseOriginalModule(text) {
  const sandbox = { window: {}, exports: {}, module: { exports: {} } };
  const wrapped =
    text
      .replace(/export\s*\{\s*QuintiImagenesPrueba\s*\}\s*;?/g, '')
      .replace(/export\s+\{\s*QuintiImagenesPrueba\s*\}\s*;?/g, '') +
    '\n; return (typeof QuintiImagenesPrueba !== "undefined" ? QuintiImagenesPrueba : (window && window.QuintiImagenesPrueba));';
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'exports', 'module', wrapped);
  const result = fn(sandbox.window, sandbox.exports, sandbox.module);
  const data = result || sandbox.window.QuintiImagenesPrueba;
  if (!data || typeof data !== 'object') {
    throw new Error('No se pudo parsear QuintiImagenesPrueba del archivo original');
  }
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

export function getDatosChica(chica) {
  return QuintiImagenesPrueba?.[chica] || null;
}

export function getImagenSelector(chica) {
  const d = QuintiImagenesPrueba?.[chica];
  return d?.imagenSelector || d?.imagenes?.hablando?.url || '';
}

export function getDescripcionChica(chica) {
  return QuintiImagenesPrueba?.[chica]?.descripcion || '';
}

/** Lista solo los tags que ESA chica tiene con URL real */
export function listarTags(chica) {
  const imgs = QuintiImagenesPrueba?.[chica]?.imagenes || {};
  return Object.keys(imgs).filter((k) => {
    const e = imgs[k];
    if (!e) return false;
    if (typeof e === 'string') return !!e;
    return !!(e.url && String(e.url).trim());
  });
}

/** True si el tag es claramente de sexo explícito */
export function esTagSex(tag) {
  if (!tag) return false;
  const t = String(tag);
  if (/_NOSEX$/i.test(t)) return false;
  if (PATRON_NO_SEX.test(t)) return false;
  return PATRON_SEX.test(t);
}

/** Tags no-sex de una chica (para escenas sin sexo) */
export function listarTagsNoSex(chica) {
  return listarTags(chica).filter((t) => !esTagSex(t));
}

/**
 * Inferencia fuerte de tag a partir del texto de la respuesta + mensaje del usuario.
 * Prioriza acciones concretas sobre "hablando".
 */
export function inferirTagFuerte(chica, textoBot, textoUsuario = '', soloNoSex = false) {
  let tags = listarTags(chica);
  if (soloNoSex) {
    const noSex = listarTagsNoSex(chica);
    if (noSex.length) tags = noSex;
  }
  if (!tags.length) return 'hablando';

  const t = `${textoBot || ''} ${textoUsuario || ''}`.toLowerCase();

  // Orden: más específico / acción primero. Cada entrada: [regex, claves que buscan en tags]
  const reglas = [
    // Oral / chupadas
    [/deepthroat|garganta|hasta el fondo|chupando_todo|toda la pija|toda la verga/, ['chupando_todo', 'chupando_todo_el_pene', 'deep']],
    [/chupa.*(punta|cabeza)|solo la punta|la cabeza del/, ['chupando_solo_la_punta', 'punta']],
    [/chupa.*(mitad)|hasta la mitad/, ['chupando_solo_la_mitad', 'mitad']],
    [/chup|mam[ao]|oral|blow|en (tu|la|mi) boca|lamiendo.*(pene|verga|pija)/, ['chup', 'oral', 'lamiendo_pene', '69']],
    [/chupando_bolas|bolas|testículos/, ['bolas', 'chupando_bola']],
    // Posiciones
    [/doggy|a cuatro|por detr[aá]s|desde atr[aá]s|de perrito/, ['doggy']],
    [/misioner/, ['mision']],
    [/reverse.?cowgirl|al revés encima/, ['reverse']],
    [/cowgirl|me monto|mont[aá]ndote|encima (tuyo|de ti|de vos)/, ['cowgirl', 'reverse']],
    [/sidefuck|de costado|de lado/, ['side']],
    [/standfuck|de pie|contra la pared|ventana/, ['stand', 'ventana', 'de_pie']],
    [/69/, ['69']],
    // Anal
    [/follando_anal|por el culo|en el ano|anal(?!_)/, ['anal', 'follando_anal']],
    [/licking_anus|lamiendo.*(ano|culo)/, ['licking_anus', 'lamiendo']],
    // Manos / dedos
    [/handjob|paja|con la mano|te la jalo|masturb/, ['handjob', 'paja']],
    [/metiendo_dedos|dedo.*(concha|ano)|finger/, ['dedo', 'finger', 'metiendo_dedos']],
    [/squirt/, ['squirt']],
    // Tetas / cuerpo
    [/chupando_tetas|chupa.*(teta|pecho|pez[oó]n)/, ['chupando_tetas', 'teta']],
    [/agarrando_tetas|agarra.*(teta|pecho)|tocando_tetas/, ['agarrando_tetas', 'tocando_tetas', 'teta']],
    [/mostrando_tetas|enseña.*(teta|pecho)/, ['mostrando_tetas', 'teta']],
    [/mostrando_sujetador|sujetador/, ['sujetador']],
    // Nalgas / culo
    [/nalguea|cachetada.*(culo|nalga)|azota/, ['nalg']],
    [/agarra.*(culo|nalga)|usuario_agarra_el_culo/, ['agarra_el_culo', 'culo']],
    [/enseñando_ano|estira.*(ano|culo)|abriendo.*(ano|culo)/, ['ano', 'estir']],
    // Besos / desnudez / ropa
    [/besando_desnuda|beso.*desnud/, ['besando_desnuda']],
    [/beso|besarte|te beso|nos besamos|besando/, ['besando', 'bes']],
    [/quit[aá]ndose|se saca la ropa|sin ropa|me desnudo|desnud/, ['quitandose', 'desnuda']],
    [/desnuda_en_cama|en la cama desnuda/, ['desnuda_en_cama', 'desnuda']],
    [/ropa_idol|idol/, ['ropa_idol', 'idol']],
    [/ropa_vestido|vestido/, ['ropa_vestido', 'vestido']],
    [/ropa_bikini|bikini/, ['ropa_bikini', 'bikini']],
    [/ropa_yukata|yukata/, ['ropa_yukata', 'yukata']],
    [/ropa_elegante|elegante/, ['ropa_elegante']],
    [/ropa_sexy|sexy/, ['ropa_sexy']],
    [/ropa_modelo|modelo/, ['ropa_modelo']],
    [/ropa_cita|cita/, ['ropa_cita']],
    [/lencer[ií]a|selfie_lenceria/, ['lenceria', 'selfie']],
    // Cum
    [/me_corro_en_su_boca|corro.*(boca)|semen.*(boca)|traga/, ['me_corro_en_su_boca', 'corro', 'semen']],
    [/post_sexo|semen_derram|leche.*(culo|concha|pecho)/, ['post_sexo', 'semen']],
    [/me corro|te corres|se corre|cumming|corrida/, ['corro', 'cum', 'anal_cumming']],
    // Genéricos de follar
    [/foll|te penetro|te la meto|m[eé]tela|dentro de (mi|ti)/, ['foll', 'mision', 'doggy', 'cowgirl']]
  ];

  for (const [rx, claves] of reglas) {
    if (!rx.test(t)) continue;
    for (const clave of claves) {
      const hit = tags.find((k) => k.toLowerCase().includes(clave.toLowerCase()));
      if (hit) {
        return hit;
      }
    }
    // fallback: cualquier tag que matchee alguna palabra de la clave
    const hit2 = tags.find((k) => claves.some((c) => new RegExp(c, 'i').test(k)));
    if (hit2) return hit2;
  }

  return tags.includes('hablando') ? 'hablando' : tags[0];
}

/**
 * Normaliza el tag que mandó el modelo a uno válido de esa chica.
 * Si soloNoSex = true, solo permite tags no-sex (hablando, ropa_*, etc.).
 */
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

  const fuzzy = tags.find(
    (k) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())
  );
  if (fuzzy) return fuzzy;

  // Reutilizar inferencia fuerte con el propio tag como texto
  const fromTag = inferirTagFuerte(chica, t, '', soloNoSex);
  if (fromTag && fromTag !== 'hablando') return fromTag;

  return tags.includes('hablando') ? 'hablando' : tags[0];
}

/**
 * Resuelve imagen. Si soloNoSex=true (escena sin sexo), fuerza tags no-sex.
 */
export function resolverImagen(chica, tag = 'hablando', soloNoSex = false) {
  const d = QuintiImagenesPrueba?.[chica];
  if (!d) return { url: '', audio: '', descripcion: '', tag: 'hablando' };

  let tagPedido = tag;
  if (soloNoSex && esTagSex(tagPedido)) {
    tagPedido = 'hablando';
  }

  const tagOk = normalizarTag(chica, tagPedido, soloNoSex);
  const imgs = d.imagenes || {};
  let entry = imgs[tagOk];

  if (!entry) {
    entry = imgs.hablando || {
      url: d.imagenSelector || '',
      audio: '',
      descripcion: ''
    };
  }
  if (typeof entry === 'string') {
    return { url: entry, audio: '', descripcion: '', tag: tagOk };
  }
  return {
    url: entry.url || d.imagenSelector || '',
    audio: entry.audio || '',
    descripcion: entry.descripcion || '',
    tag: tagOk
  };
}

export { QuintiImagenesPrueba };
