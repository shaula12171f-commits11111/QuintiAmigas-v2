// ============================================================
//  Imágenes v2 — pack completo de la repo original
// ============================================================

const ORIGINAL_URL =
  'https://raw.githubusercontent.com/shaula12171f-commits11111/Nakardasputardas17/main/src/systems/imagenes.js';

let QuintiImagenesPrueba = null;
let _loadPromise = null;

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

/**
 * Normaliza el tag que mandó el modelo a uno válido de esa chica.
 * Si no hay match → hablando (o primer tag disponible).
 */
export function normalizarTag(chica, tag) {
  const tags = listarTags(chica);
  if (!tags.length) return 'hablando';
  if (!tag) return tags.includes('hablando') ? 'hablando' : tags[0];

  const t = String(tag).trim();
  if (tags.includes(t)) return t;

  const lower = t.toLowerCase();
  const exact = tags.find((k) => k.toLowerCase() === lower);
  if (exact) return exact;

  // fuzzy: el tag pedido contenido en la key o al revés
  const fuzzy = tags.find(
    (k) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())
  );
  if (fuzzy) return fuzzy;

  // heurística por palabras clave del texto del tag
  const reglas = [
    [/chup|oral|blow|punta|mitad|pene|verga|pija|deep/, /chup|oral|lamiendo_pene|69/],
    [/doggy|cuatro|atr[aá]s/, /doggy/],
    [/mision/, /mision/],
    [/anal|ano|culo.*foll/, /anal/],
    [/cowgirl|monta|encima/, /cowgirl|reverse/],
    [/beso|besando/, /bes/],
    [/desnud/, /desnud/],
    [/teta|pecho|sujetador/, /teta|sujetador|pecho/],
    [/dedo|finger|concha|squirt/, /dedo|concha|squirt|finger/],
    [/paja|handjob|mano/, /handjob|paja/],
    [/nalg|cachet/, /nalg/],
    [/stand|de_pie|ventana/, /stand|ventana|de_pie/],
    [/side/, /side/],
    [/69/, /69/],
    [/cum|corr|semen|boca/, /corro|cum|semen|post_sexo/]
  ];
  for (const [hay, busca] of reglas) {
    if (hay.test(lower)) {
      const hit = tags.find((k) => busca.test(k.toLowerCase()));
      if (hit) return hit;
    }
  }

  return tags.includes('hablando') ? 'hablando' : tags[0];
}

export function resolverImagen(chica, tag = 'hablando') {
  const d = QuintiImagenesPrueba?.[chica];
  if (!d) return { url: '', audio: '', descripcion: '', tag: 'hablando' };

  const tagOk = normalizarTag(chica, tag);
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
