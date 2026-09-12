// ============================================================
//  Imágenes v2 — pack completo + clasificación + inferencia estable
//  + scoreTagDinamico (tags 100% desde keys de imagenes)
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

// Sinónimos para scoring dinámico (palabra del tag → palabras del usuario)
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
export function listarTagsNoSex(chica) {
  return listarTags(chica).filter((t) => !esTagSex(t));
}
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

/**
 * Score dinámico: parte el nombre del tag en tokens y busca coincidencias
 * (y sinónimos) en el texto del usuario/bot. Así cualquier tag nuevo
 * que exista en imagenes.js se detecta sin agregar reglas a mano.
 */
export function scoreTagDinamico(chica, texto, soloNoSex = false) {
  let tags = listarTags(chica);
  if (soloNoSex) {
    const noSex = listarTagsNoSex(chica);
    if (noSex.length) tags = noSex;
  }
  if (!tags.length) return 'hablando';

  const t = normalizarSinonimosSexuales(texto);
  if (!t.trim()) return 'hablando';

  let bestTag = null;
  let bestScore = 0;

  for (const tag of tags) {
    if (tag === 'hablando') continue;
    const parts = tag.toLowerCase().replace(/_nosex$/i, '').split(/[_\s]+/).filter((p) => p.length > 1);
    if (!parts.length) continue;

    let score = 0;
    let matched = 0;

    for (const part of parts) {
      // Match directo
      if (t.includes(part)) {
        score += part.length >= 4 ? 3 : 2;
        matched++;
        continue;
      }
      // Match por sinónimos
      const sins = SINONIMOS_TAG[part];
      if (sins) {
        for (const s of sins) {
          if (t.includes(s)) {
            score += 2;
            matched++;
            break;
          }
        }
      }
    }

    // Bonus si casi todos los tokens del tag matchean
    if (matched >= Math.ceil(parts.length * 0.6)) {
      score += 2;
    }
    // Preferir tags más específicos (más tokens)
    score += Math.min(parts.length, 3) * 0.3;

    if (score > bestScore) {
      bestScore = score;
      bestTag = tag;
    }
  }

  // Umbral mínimo para no devolver basura
  if (bestScore < 2.5) return 'hablando';
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
    /muestro|te muestro|le muestro|saco (la )?(pija|verga|polla|pene|poronga|pichula|pinga)|mir[ae] mi (pija|verga|polla|pene|poronga|pichula|pinga)|ve(s|an)? mi (pija|verga|polla|pene|poronga|pichula|pinga)|te dejo ver/.test(user) &&
    !/chup|mam[ao]|lam[ei]|lamiendo|lamer|foll|met[eo]|cog|mamad|deep|boca/.test(user);

  if (soloMuestra) {
    const ver = buscarTag(tags, ['usuario_muestra_su_verga', 'muestra_su_verga', 've_mi_verga', 'viendo_verga', 'Viendo_Verga', 'mirando'], false);
    if (ver) return ver;
    const fuzzy = tags.find((k) => /muestra.*verga|ve_mi_verga|viendo_verga/i.test(k));
    if (fuzzy) return fuzzy;
    if (tags.includes('hablando')) return 'hablando';
  }

  // Primero intentar score dinámico (cubre tags nuevos automáticamente)
  const dyn = scoreTagDinamico(chica, t, soloNoSex);
  if (dyn && dyn !== 'hablando') return dyn;

  const reglas = [
    { rx: /solo la punta|chupa.*(solo )?(la )?punta|lame.*(solo )?(la )?punta|cabeza del pene|cabeza de la pija/, claves: ['chupando_solo_la_punta', 'punta'] },
    { rx: /hasta la mitad|chupa.*(hasta )?la mitad|lame.*(hasta )?la mitad|mitad de (tu|su|la) (polla|pija|verga|pene)|recorre la mitad/, claves: ['chupando_solo_la_mitad', 'mitad'] },
    { rx: /deepthroat|hasta el fondo|se la traga entera|chupando_todo|toda la (pija|verga|polla|pene)|entera en (la|su) boca/, claves: ['chupando_todo_el_pene', 'chupando_todo', 'deep'] },
    { rx: /chupando_bolas|las bolas|testiculos|lamiendo.*bolas/, claves: ['chupando_bolas', 'bolas', 'chupando_bola'] },
    { rx: /\b69\b/, claves: ['69'] },
    { rx: /chup|mam[ao]|oral|blowjob|en (tu|la|mi) boca|lam[ei]|lamiendo|lamer|lamiendo.*(pene|verga|pija|polla)|te la chupo|me la chupa|chupame|mamame|lame(me|la)?/, claves: ['lamiendo_pene', 'chupando_todo_el_pene', 'chupando_solo_la_mitad', 'chupando_solo_la_punta', 'chupando', 'oral', '69'] },
    { rx: /viendo_verga|mira(ndo)? (la )?(pija|verga)|ve(o|s) (tu|su|la) (pija|verga)|muestro.*(pija|verga)|saco (la )?(pija|verga)/, claves: ['usuario_muestra_su_verga', 'muestra_su_verga', 've_mi_verga', 'viendo_verga', 'Viendo_Verga'] },
    { rx: /doggy|a cuatro|por detras|desde atras|de perrito|de espaldas/, claves: ['doggystyle', 'doggy'] },
    { rx: /misioner/, claves: ['misionero', 'mision'] },
    { rx: /reverse.?cowgirl|al reves encima|sentada al reves/, claves: ['reverse_cowgirl', 'reverse'] },
    { rx: /cowgirl|me monto|montandote|encima (tuyo|de ti|de vos)|te cabalgo/, claves: ['cowgirl', 'reverse'] },
    { rx: /sidefuck|de costado|de lado/, claves: ['sidefuck', 'side'] },
    { rx: /standfuck|de pie|contra la pared|en la ventana|ventana/, claves: ['standfuck', 'stand', 'ventana', 'de_pie'] },
    { rx: /en el aire|follando_en_el_aire|sexo en el aire|cog(iendo|er)? en el aire|levanta[rd]?a? en el aire/, claves: ['follando_en_el_aire', 'aire'] },
    { rx: /follando_anal|por el culo|en el ano|sexo anal|anal(?!_)/, claves: ['follando_anal', 'anal'] },
    { rx: /licking_anus|lamiendo.*(ano|culo)|beso negro/, claves: ['licking_anus', 'lamiendo'] },
    { rx: /handjob|paja|con la mano|te la jalo|masturb|me la sobas/, claves: ['handjob_paja', 'handjob', 'paja'] },
    { rx: /metiendo_dedos|dedos?.*(concha|ano|adentro)|finger|me mete los dedos/, claves: ['metiendo_dedos', 'dedo', 'finger'] },
    { rx: /squirt|chorro/, claves: ['squirt', 'squirting'] },
    { rx: /chupando_tetas|chupa.*(teta|pecho|pezon)/, claves: ['chupando_tetas', 'teta'] },
    { rx: /agarrando_tetas|agarra.*(teta|pecho)|tocando_tetas|te toco las tetas/, claves: ['agarrando_tetas', 'tocando_tetas', 'teta'] },
    { rx: /mostrando_tetas|ensena.*(teta|pecho)|saca las tetas/, claves: ['mostrando_tetas', 'teta'] },
    { rx: /sujetador/, claves: ['mostrando_sujetador', 'sujetador'] },
    { rx: /nalguea|cachetada.*(culo|nalga)|azote|te pego en el culo/, claves: ['usuario_nalguea_el_culo', 'nalg', 'usuario_nalguea'] },
    { rx: /agarra.*(culo|nalga)|te agarro el culo|le agarro el culo|agarro el culo/, claves: ['usuario_agarra_el_culo', 'agarra_el_culo', 'culo'] },
    { rx: /ensenando_ano|estira.*(ano|culo)|abriendo.*(ano|culo)|me abre el culo/, claves: ['ano', 'estir', 'ensenando_ano'] },
    { rx: /besando_desnuda|beso.*desnud/, claves: ['besando_desnuda'] },
    { rx: /\bbeso|besarte|te beso|nos besamos|besando|un beso/, claves: ['besando', 'bes'] },
    { rx: /quitandose|se saca la ropa|sin ropa|me desnudo|desnud|ropa al piso/, claves: ['quitandose_la_ropa', 'quitandose', 'desnuda'] },
    { rx: /desnuda_en_cama|en la cama desnuda/, claves: ['desnuda_en_cama', 'desnuda'] },
    { rx: /\bdesnuda\b/, claves: ['desnuda'] },
    { rx: /ropa_idol|\bidol\b/, claves: ['ropa_idol', 'idol'] },
    { rx: /ropa_vestido|\bvestido\b/, claves: ['ropa_vestido', 'vestido'] },
    { rx: /ropa_bikini|\bbikini\b/, claves: ['ropa_bikini', 'bikini'] },
    { rx: /ropa_yukata|\byukata\b/, claves: ['ropa_yukata', 'yukata'] },
    { rx: /ropa_elegante|elegante/, claves: ['ropa_elegante'] },
    { rx: /ropa_sexy|\bsexy\b/, claves: ['ropa_sexy'] },
    { rx: /ropa_modelo|\bmodelo\b/, claves: ['ropa_modelo'] },
    { rx: /ropa_cita|\bcita\b/, claves: ['ropa_cita'] },
    { rx: /lenceria|selfie_lenceria/, claves: ['lenceria', 'selfie'] },
    { rx: /me_corro_en_su_boca|corro.*(boca)|semen.*(boca)|traga.*(leche|semen)/, claves: ['me_corro_en_su_boca', 'corro', 'semen'] },
    { rx: /post_sexo|semen_derram|leche.*(culo|concha|pecho|tetas)/, claves: ['post_sexo', 'semen'] },
    { rx: /me corro|te corres|se corre|cumming|corrida|acabo/, claves: ['corro', 'cum', 'anal_cumming', 'post_sexo'] },
    { rx: /foll|te penetro|te la meto|metela|dentro de (mi|ti)|te cojo|cogiendo/, claves: ['doggystyle', 'misionero', 'cowgirl', 'foll'] }
  ];

  for (const { rx, claves } of reglas) {
    if (!rx.test(t)) continue;
    const hit = buscarTag(tags, claves, soloNoSex);
    if (hit) return hit;
  }

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
  if (soloNoSex) {
    const nosexVariant = tags.find(
      (k) => /_NOSEX$/i.test(k) && (k.toLowerCase().includes(t.toLowerCase().replace(/_nosex$/i, '')) || t.toLowerCase().includes(k.toLowerCase().replace(/_nosex$/i, '')))
    );
    if (nosexVariant) return nosexVariant;
  }
  const lower = t.toLowerCase();
  const exact = tags.find((k) => k.toLowerCase() === lower);
  if (exact) return exact;
  const fuzzy = tags.find((k) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase()));
  if (fuzzy) return fuzzy;
  const fromTag = inferirTagFuerte(chica, t, '', soloNoSex);
  if (fromTag && fromTag !== 'hablando') return fromTag;
  return tags.includes('hablando') ? 'hablando' : tags[0];
}

export function resolverImagen(chica, tag = 'hablando', soloNoSex = false) {
  const d = QuintiImagenesPrueba?.[chica];
  if (!d) return { url: '', audio: '', descripcion: '', tag: 'hablando' };
  let tagPedido = tag || 'hablando';
  if (soloNoSex && esTagSex(tagPedido)) {
    const all = listarTags(chica);
    const nosex = all.find((k) => /_NOSEX$/i.test(k) && k.toLowerCase().includes(String(tagPedido).toLowerCase().replace(/_nosex$/i, '').slice(0, 12)));
    tagPedido = nosex || 'hablando';
  }
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
  if (!entry) return '';
  if (typeof entry === 'string') return '';
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
