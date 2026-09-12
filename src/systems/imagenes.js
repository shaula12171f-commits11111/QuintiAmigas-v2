// ============================================================
//  Imágenes v2 — pack completo + scoreTagDinamico
// ============================================================

const ORIGINAL_URL =
  'https://raw.githubusercontent.com/shaula12171f-commits11111/Nakardasputardas17/main/src/systems/imagenes.js';

let QuintiImagenesPrueba = null;
let _loadPromise = null;

const PATRON_NO_SEX =
  /^(hablando|ropa_|desnuda$|desnuda_en_cama|besando$|mostrando_sujetador|quitandose_la_ropa|selfie_|.*_NOSEX$|moviendo_el_culo$|viendo_verga|usuario_muestra_su_verga)/i;

const PATRON_SEX =
  /chup|oral|pene|verga|pija|doggy|mision|anal|cowgirl|handjob|paja|69|foll|cum|corro|semen|dedo|squirt|lamiendo|nalg|standfuck|sidefuck|mattin|estir|ano|concha|tetas?_de|agarra_el_culo(?!_.*NOSEX)|rozo_mi|post_sexo|usuario_chupa|metiendo_dedos|aire/i;

const SINONIMOS_VERGA = /\b(polla|pija|poronga|pichula|pito|rabo|pinga|pene|verga)\b/gi;

const SINONIMOS_TAG = {
  aire: ['aire', 'levantad', 'elevad', 'suspendid', 'volando'],
  follando: ['foll', 'cog', 'penetr', 'meto', 'metela', 'sexo'],
  doggy: ['doggy', 'perrito', 'cuatro', 'detras', 'espaldas'],
  doggystyle: ['doggy', 'perrito', 'cuatro', 'detras', 'espaldas'],
  misionero: ['misioner', 'boca arriba', 'debajo'],
  cowgirl: ['cowgirl', 'mont', 'encima', 'cabalg'],
  reverse: ['reverse', 'reves', 'al reves'],
  sidefuck: ['costado', 'lado', 'side'],
  side: ['costado', 'lado', 'side'],
  standfuck: ['pie', 'stand', 'pared', 'ventana'],
  stand: ['pie', 'stand', 'pared', 'ventana'],
  anal: ['anal', 'culo', 'ano'],
  chupando: ['chup', 'mam', 'oral', 'blowjob', 'boca'],
  chup: ['chup', 'mam', 'oral', 'blowjob'],
  lamiendo: ['lam', 'lamiendo', 'lamer'],
  punta: ['punta', 'cabeza'],
  mitad: ['mitad'],
  todo: ['fondo', 'toda', 'entera', 'deep'],
  deep: ['fondo', 'toda', 'entera', 'deep'],
  handjob: ['handjob', 'paja', 'mano', 'jalo', 'soba'],
  paja: ['handjob', 'paja', 'mano'],
  '69': ['69'],
  tetas: ['teta', 'pecho', 'pezon'],
  teta: ['teta', 'pecho', 'pezon'],
  culo: ['culo', 'nalga'],
  nalg: ['nalga', 'cachetada', 'azote'],
  desnuda: ['desnud', 'sin ropa'],
  besando: ['beso', 'besarte', 'besando'],
  quitandose: ['quitandose', 'saca la ropa', 'desnud'],
  muestra: ['muestro', 'saco', 'mira', 'viendo'],
  verga: ['verga', 'pija', 'polla', 'pene'],
  semen: ['semen', 'leche', 'corro', 'corrida', 'cum'],
  corro: ['corro', 'corrida', 'cum', 'acabo'],
  dedo: ['dedo', 'finger'],
  squirt: ['squirt', 'chorro']
};

function normalizarSinonimosSexuales(texto) {
  let t = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  t = t.replace(SINONIMOS_VERGA, 'verga');
  t = t.replace(/\bverga\b/g, 'verga pene');
  return t;
}

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

export function scoreTagDinamico(chica, texto, soloNoSex = false) {
  let tags = listarTags(chica);
  if (soloNoSex) {
    const noSex = listarTagsNoSex(chica);
    if (noSex.length) tags = noSex;
  }
  if (!tags.length) return 'hablando';
  const t = normalizarSinonimosSexuales(texto);
  if (!t.trim()) return 'hablando';

  const poseBoost = [
    { re: /doggy|perrito|a cuatro|doggystyle/, keys: ['doggy'] },
    { re: /misioner/, keys: ['mision'] },
    { re: /cowgirl|cabalg|me monto/, keys: ['cowgirl'] },
    { re: /en el aire|follando_en_el_aire/, keys: ['aire'] },
    { re: /nalgue|nalga|cachetad|azote/, keys: ['nalg'] },
    { re: /sidefuck|de costado|de lado/, keys: ['side'] },
    { re: /anal|por el culo/, keys: ['anal'] },
    { re: /standfuck|de pie|contra la pared/, keys: ['stand', 'ventana', 'de_pie'] }
  ];

  let bestTag = null;
  let bestScore = 0;
  for (const tag of tags) {
    if (tag === 'hablando') continue;
    const lower = tag.toLowerCase().replace(/_nosex$/i, '');
    const parts = lower.split(/[_\s]+/).filter((p) => p.length > 1);
    if (!parts.length) continue;
    let score = 0;
    let matched = 0;
    for (const part of parts) {
      if (t.includes(part)) { score += part.length >= 5 ? 4 : (part.length >= 4 ? 3 : 1.5); matched++; continue; }
      const sins = SINONIMOS_TAG[part];
      if (sins) {
        for (const s of sins) {
          if (t.includes(s)) { score += 2.5; matched++; break; }
        }
      }
    }
    for (const { re, keys } of poseBoost) {
      if (re.test(t) && keys.some((k) => lower.includes(k))) { score += 8; matched += 2; }
    }
    if (parts.length >= 5 && t.split(/\s+/).length <= 6) score -= 3;
    if (matched >= Math.ceil(parts.length * 0.5)) score += 2;
    if (score > bestScore) { bestScore = score; bestTag = tag; }
  }
  if (bestScore < 4) return 'hablando';
  return bestTag || 'hablando';
}

export function inferirTagFuerte(chica, textoBot, textoUsuario = '', soloNoSex = false) {
  let tags = listarTags(chica);
  if (soloNoSex) {
    const noSex = listarTagsNoSex(chica);
    if (noSex.length) tags = noSex;
  }
  if (!tags.length) return 'hablando';
  const user = normalizarSinonimosSexuales(textoUsuario);
  const bot = normalizarSinonimosSexuales(textoBot);
  const t = `${bot} ${user}`;

  const soloMuestra =
    /muestro|te muestro|le muestro|saco (la )?(pija|verga|polla|pene)|mir[ae] mi (pija|verga)|ve(s|an)? mi (pija|verga)|te dejo ver/.test(user) &&
    !/chup|mam[ao]|lam[ei]|foll|met[eo]|cog|mamad|deep|boca/.test(user);
  if (soloMuestra) {
    const ver = buscarTag(tags, ['usuario_muestra_su_verga', 'muestra_su_verga', 've_mi_verga', 'viendo_verga'], false);
    if (ver) return ver;
    if (tags.includes('hablando')) return 'hablando';
  }

  const reglas = [
    { rx: /doggy|a cuatro|por detras|de perrito|de espaldas/, claves: ['doggystyle', 'doggy'] },
    { rx: /misioner/, claves: ['misionero', 'mision'] },
    { rx: /cowgirl|me monto|cabalg/, claves: ['cowgirl'] },
    { rx: /sidefuck|de costado|de lado/, claves: ['sidefuck', 'side'] },
    { rx: /standfuck|de pie|contra la pared|ventana/, claves: ['standfuck', 'stand', 'ventana', 'de_pie'] },
    { rx: /en el aire|follando_en_el_aire/, claves: ['follando_en_el_aire', 'aire'] },
    { rx: /anal|por el culo|en el ano/, claves: ['follando_anal', 'anal'] },
    { rx: /nalguea|cachetada|azote|pego en el culo/, claves: ['usuario_nalguea_el_culo', 'nalg', 'usuario_nalguea'] },
    { rx: /solo la punta|chupa.*(punta|cabeza)/, claves: ['chupando_solo_la_punta', 'punta'] },
    { rx: /hasta la mitad/, claves: ['chupando_solo_la_mitad', 'mitad'] },
    { rx: /deepthroat|hasta el fondo|toda la (pija|verga)/, claves: ['chupando_todo_el_pene', 'chupando_todo', 'deep'] },
    { rx: /chup|mam[ao]|oral|lam[ei]|lamiendo|lamer|chupame|mamame/, claves: ['lamiendo_pene', 'chupando_todo_el_pene', 'chupando', 'oral'] },
    { rx: /handjob|paja|con la mano/, claves: ['handjob_paja', 'handjob', 'paja'] },
    { rx: /\bbeso|besarte|besando/, claves: ['besando', 'bes'] },
    { rx: /desnuda/, claves: ['desnuda'] },
    { rx: /foll|te penetro|te la meto|cogiendo/, claves: ['doggystyle', 'misionero', 'cowgirl', 'foll'] }
  ];

  for (const { rx, claves } of reglas) {
    if (!rx.test(t)) continue;
    const hit = buscarTag(tags, claves, soloNoSex);
    if (hit) return hit;
  }
  const dyn = scoreTagDinamico(chica, t, soloNoSex);
  if (dyn && dyn !== 'hablando') return dyn;
  return tags.includes('hablando') ? 'hablando' : tags[0];
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

export { QuintiImagenesPrueba };
