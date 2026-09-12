// ============================================================
//  Imágenes v2 — pack completo + clasificación + inferencia estable
// ============================================================

const ORIGINAL_URL =
  'https://raw.githubusercontent.com/shaula12171f-commits11111/Nakardasputardas17/main/src/systems/imagenes.js';

let QuintiImagenesPrueba = null;
let _loadPromise = null;

const PATRON_NO_SEX =
  /^(hablando|ropa_|desnuda$|desnuda_en_cama|besando$|mostrando_sujetador|quitandose_la_ropa|selfie_|.*_NOSEX$|moviendo_el_culo$|viendo_verga|usuario_muestra_su_verga)/i;

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
  // mirar / mostrar verga ≠ acto oral
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
      const hitNoSex = tags.find(
        (k) => k.toLowerCase().includes(c) && /_NOSEX$/i.test(k)
      );
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
 * Inferencia de tag.
 * Prioridad: intención del USUARIO cuando solo muestra / mira (no oral).
 */
export function inferirTagFuerte(chica, textoBot, textoUsuario = '', soloNoSex = false) {
  let tags = listarTags(chica);
  if (soloNoSex) {
    const noSex = listarTagsNoSex(chica);
    if (noSex.length) tags = noSex;
  }
  if (!tags.length) return 'hablando';

  const user = String(textoUsuario || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  const bot = String(textoBot || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  const t = `${bot} ${user}`;

  // Si el usuario SOLO muestra / hace mirar la pija (sin pedir chupar)
  const soloMuestra =
    /muestro|te muestro|le muestro|saco (la )?(pija|verga|polla)|mir[ae] mi (pija|verga|polla)|ve(s|an)? mi (pija|verga|polla)|te dejo ver/.test(
      user
    ) &&
    !/chup|mam[ao]|foll|met[eo]|cog|mamad|deep|boca/.test(user);

  if (soloMuestra) {
    // Tags reales del pack: usuario_muestra_su_verga / usuario_muestra_su_verga_a_nino / ve_mi_verga
    const ver = buscarTag(
      tags,
      [
        'usuario_muestra_su_verga',
        'muestra_su_verga',
        've_mi_verga',
        'viendo_verga',
        'Viendo_Verga',
        'mirando'
      ],
      false // no forzar soloNoSex aquí: el tag de mostrar es válido aunque tenga "verga"
    );
    if (ver) return ver;
    // último recurso: cualquier tag que contenga "muestra" + "verga"
    const fuzzy = tags.find((k) => /muestra.*verga|ve_mi_verga|viendo_verga/i.test(k));
    if (fuzzy) return fuzzy;
    if (tags.includes('hablando')) return 'hablando';
  }

  const reglas = [
    // Oral específico — frases fuertes (no "la punta" suelta en narración)
    {
      rx: /solo la punta|chupa.*(solo )?(la )?punta|cabeza del pene|cabeza de la pija/,
      claves: ['chupando_solo_la_punta', 'punta']
    },
    {
      rx: /hasta la mitad|chupa.*(hasta )?la mitad|mitad de (tu|su|la) (polla|pija|verga|pene)|recorre la mitad/,
      claves: ['chupando_solo_la_mitad', 'mitad']
    },
    {
      rx: /deepthroat|hasta el fondo|se la traga entera|chupando_todo|toda la (pija|verga|polla|pene)|entera en (la|su) boca/,
      claves: ['chupando_todo_el_pene', 'chupando_todo', 'deep']
    },
    {
      rx: /chupando_bolas|las bolas|testiculos|lamiendo.*bolas/,
      claves: ['chupando_bolas', 'bolas', 'chupando_bola']
    },
    { rx: /\b69\b/, claves: ['69'] },
    {
      rx: /chup|mam[ao]|oral|blowjob|en (tu|la|mi) boca|lamiendo.*(pene|verga|pija|polla)|te la chupo|me la chupa/,
      claves: ['chupando_todo_el_pene', 'chupando_solo_la_mitad', 'chupando', 'lamiendo_pene', 'oral', '69']
    },

    // Ver / mostrar verga (también si aparece en bot)
    {
      rx: /viendo_verga|mira(ndo)? (la )?(pija|verga)|ve(o|s) (tu|su|la) (pija|verga)|muestro.*(pija|verga)|saco (la )?(pija|verga)/,
      claves: ['usuario_muestra_su_verga', 'muestra_su_verga', 've_mi_verga', 'viendo_verga', 'Viendo_Verga']
    },

    { rx: /doggy|a cuatro|por detras|desde atras|de perrito|de espaldas/, claves: ['doggystyle', 'doggy'] },
    { rx: /misioner/, claves: ['misionero', 'mision'] },
    { rx: /reverse.?cowgirl|al reves encima|sentada al reves/, claves: ['reverse_cowgirl', 'reverse'] },
    { rx: /cowgirl|me monto|montandote|encima (tuyo|de ti|de vos)|te cabalgo/, claves: ['cowgirl', 'reverse'] },
    { rx: /sidefuck|de costado|de lado/, claves: ['sidefuck', 'side'] },
    { rx: /standfuck|de pie|contra la pared|en la ventana|ventana/, claves: ['standfuck', 'stand', 'ventana', 'de_pie'] },

    { rx: /follando_anal|por el culo|en el ano|sexo anal|anal(?!_)/, claves: ['follando_anal', 'anal'] },
    { rx: /licking_anus|lamiendo.*(ano|culo)|beso negro/, claves: ['licking_anus', 'lamiendo'] },

    { rx: /handjob|paja|con la mano|te la jalo|masturb|me la sobas/, claves: ['handjob_paja', 'handjob', 'paja'] },
    { rx: /metiendo_dedos|dedos?.*(concha|ano|adentro)|finger|me mete los dedos/, claves: ['metiendo_dedos', 'dedo', 'finger'] },
    { rx: /squirt|chorro/, claves: ['squirt', 'squirting'] },

    { rx: /chupando_tetas|chupa.*(teta|pecho|pezon)/, claves: ['chupando_tetas', 'teta'] },
    { rx: /agarrando_tetas|agarra.*(teta|pecho)|tocando_tetas|te toco las tetas/, claves: ['agarrando_tetas', 'tocando_tetas', 'teta'] },
    { rx: /mostrando_tetas|ensena.*(teta|pecho)|saca las tetas/, claves: ['mostrando_tetas', 'teta'] },
    { rx: /sujetador/, claves: ['mostrando_sujetador', 'sujetador'] },

    {
      rx: /nalguea|cachetada.*(culo|nalga)|azote|te pego en el culo/,
      claves: ['usuario_nalguea_el_culo', 'nalg', 'usuario_nalguea']
    },
    {
      rx: /agarra.*(culo|nalga)|te agarro el culo|le agarro el culo|agarro el culo/,
      claves: ['usuario_agarra_el_culo', 'agarra_el_culo', 'culo']
    },
    {
      rx: /ensenando_ano|estira.*(ano|culo)|abriendo.*(ano|culo)|me abre el culo/,
      claves: ['ano', 'estir', 'ensenando_ano']
    },

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
      (k) =>
        /_NOSEX$/i.test(k) &&
        (k.toLowerCase().includes(t.toLowerCase().replace(/_nosex$/i, '')) ||
          t.toLowerCase().includes(k.toLowerCase().replace(/_nosex$/i, '')))
    );
    if (nosexVariant) return nosexVariant;
  }

  const lower = t.toLowerCase();
  const exact = tags.find((k) => k.toLowerCase() === lower);
  if (exact) return exact;

  const fuzzy = tags.find(
    (k) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())
  );
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
    const nosex = all.find(
      (k) =>
        /_NOSEX$/i.test(k) &&
        k.toLowerCase().includes(String(tagPedido).toLowerCase().replace(/_nosex$/i, '').slice(0, 12))
    );
    tagPedido = nosex || 'hablando';
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
