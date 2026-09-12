// ============================================================
//  Motor principal - QuintiAmigas v2 (fix tags + confesión hablando)
// ============================================================

import { armarSystemPrompt, PROMPTS_REINTENTO } from './systemPrompt.js';
import {
  getPersonalidad, getChicasDisponibles, existeChica, existePersonaje
} from '../characters/personalidades.js';
import {
  resolverImagen, getImagenSelector, getDescripcionChica, listarTags,
  listarTagsNoSex, normalizarTag, esTagSex, inferirTagFuerte, ensureImagenesLoaded,
  listarDescripcionesTags, getTagDescripcion, scoreTagDinamico
} from '../systems/imagenes.js';
import { getHistoria, rellenarNombre } from '../stories/historias.js';
import { getLore } from '../world/lore.js';
import { GROQ_KEYS, MODELO, NOMBRE_USUARIO_DEFAULT } from '../../config.js';

export const FASE = { NORMAL: 'normal', TRASLADO: 'traslado', LLEGADA: 'llegada', INTIMO: 'intimo' };
const TODAS_CHICAS = ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia'];
const TODOS = [...TODAS_CHICAS, 'Aldo'];

let estado = {
  fase: FASE.NORMAL, ubicacion: null, chica: null, chicasActivas: [], historial: [],
  nombreUsuario: NOMBRE_USUARIO_DEFAULT || 'Fabrizio', hechos: [], keyIndex: 0,
  modo: 'libre', historiaId: null, outfitActual: null
};

const MAX_HISTORIAL = 20;
const PATRON_LUGAR_PRIVADO = /\b(hotel|motel|habitaci[oó]n|casa|departamento|depto|pieza|cuarto|mi casa|tu casa|a solas|lugar m[aá]s privado)\b/i;
const PATRON_CONFIRMACION = /\b(s[ií]|claro|vamos|dale|quiero|contin[uú]a|continuar|foll|chup|besame|t[oó]came|hazlo|hacelo|por favor|ya)\b/i;
const PATRON_NEGACION = /\b(no|para|espera|despacio|mejor no|ahora no)\b/i;
const PATRON_SEXO = /\b(foll|chup|mamad|mam[ao]|lam[ei]|lamiendo|lamer|deepthroat|te la meto|métela|cog[eé]|por el culo|en el culo|follando|penetra|en (tu|la) boca|hasta el fondo|toda la (pija|verga|polla)|handjob|paja|corr[ei]|semen|69|doggy|misioner|cowgirl|chupame|mamame|chupamela|mamamela|lame(me|la)?)\b/i;
const PATRON_ACCION = /chup|mam[ao]|lam[ei]|lamiendo|lamer|foll|cog|beso|besarte|desnud|teta|pecho|dedo|paja|handjob|nalg|doggy|mision|cowgirl|anal|69|corr|semen|agarra|mont[aá]|de pie|ventana|sujetador|lencer|pene|verga|pija|polla|concha|culo|ano|met[eo]|penetr|aire/i;
const PATRON_ORAL = /\b(chup|mam[ao]|mamad|lam[ei]|lamiendo|lamer|chupame|mamame|chupamela|mamamela|lame(me|la)?|en (tu|la|mi) boca|deepthroat|oral|blowjob)\b/i;
const SINONIMOS_VERGA = /\b(polla|pija|poronga|pichula|pito|rabo|pinga|pene|verga)\b/gi;

function normalizarSinonimosSexuales(texto) {
  let t = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  t = t.replace(SINONIMOS_VERGA, 'verga');
  t = t.replace(/\bverga\b/g, 'verga pene');
  return t;
}
function esSoloMuestra(mensaje) {
  const m = normalizarSinonimosSexuales(mensaje);
  const muestra = /\b(le |te |me )?muestro (mi )?(pija|verga|polla|pene|poronga|pichula|pinga)|saco (la )?(pija|verga|polla|pene|poronga|pichula|pinga)|mir[aeá] (mi )?(pija|verga|polla|pene|poronga|pichula|pinga)|ve(s|an)? (mi )?(pija|verga|polla|pene|poronga|pichula|pinga)|te dejo ver|para que (la )?veas|mirá (esto|mi)\b/i.test(m);
  const pideActo = /\b(chup|mam[ao]|mamad|lam[ei]|lamiendo|lamer|chupame|mamame|chupamela|mamamela|lame(me|la)?|en (tu|la) boca|deep|foll|met[eo]|cog|paja|handjob|te la meto|métela)\b/i.test(m);
  return muestra && !pideActo;
}
function log(...args) { console.log('%c[Quinti]', 'color:#a78bfa;font-weight:bold', ...args); }
function logGroup(title, obj) {
  console.groupCollapsed('%c[Quinti] ' + title, 'color:#a78bfa;font-weight:bold');
  if (obj && typeof obj === 'object') { for (const [k, v] of Object.entries(obj)) console.log(k + ':', v); }
  else console.log(obj);
  console.groupEnd();
}

export function getEstado() { return { ...estado, chicasActivas: [...estado.chicasActivas] }; }
export function setNombreUsuario(nombre) { if (nombre && nombre.trim()) estado.nombreUsuario = nombre.trim(); }
export function getNombreUsuario() { return estado.nombreUsuario; }
export function iniciarChatLibre(chica) {
  if (!existeChica(chica)) throw new Error('Chica no existe');
  estado.chica = chica; estado.chicasActivas = [chica]; estado.fase = FASE.NORMAL;
  estado.ubicacion = null; estado.historial = []; estado.hechos = [];
  estado.modo = 'libre'; estado.historiaId = null; estado.outfitActual = null;
  log('Chat libre iniciado', { chica, usuario: estado.nombreUsuario });
}
export function iniciarHistoria(chica, historiaId) {
  if (!existeChica(chica)) throw new Error('Chica no existe');
  const h = getHistoria(chica, historiaId);
  if (!h) throw new Error('Historia no existe');
  estado.chica = chica; estado.chicasActivas = [chica]; estado.fase = FASE.NORMAL;
  estado.ubicacion = null; estado.historial = []; estado.hechos = [];
  estado.modo = 'historia'; estado.historiaId = historiaId; estado.outfitActual = null;
  const texto = rellenarNombre(h.mensajeBienvenida, estado.nombreUsuario);
  estado.historial.push({ role: 'assistant', content: texto, chica });
  const welcomeSexual = /chup|mamad|pija|verga|foll|coño|boxers|te saca la|en la boca/i.test(texto);
  if (welcomeSexual) estado.fase = FASE.INTIMO;
  let tagInferido = 'hablando';
  if (String(historiaId || '').includes('confesion')) tagInferido = 'hablando';
  else if (welcomeSexual) tagInferido = inferirTagFuerte(chica, texto, '', false) || 'hablando';
  else if (/beso|besarte|besando/i.test(texto)) tagInferido = normalizarTag(chica, 'besando', true) || 'hablando';
  const media = resolverImagen(chica, tagInferido, !welcomeSexual);
  if (media.descripcion) estado.outfitActual = { chica, tag: media.tag, descripcion: media.descripcion };
  return { texto, chica, imagenUrl: media.url, audioUrl: media.audio || '', descripcionImg: media.descripcion || '', imagen_tag: media.tag || 'hablando', fase: estado.fase };
}
export function setChica(nombre) { iniciarChatLibre(nombre); }

function esEscenaSex() {
  if (estado.fase === FASE.INTIMO) return true;
  const ultimos = estado.historial.slice(-6).map((h) => h.content || '').join(' ');
  return PATRON_SEXO.test(ultimos);
}
function detectarPersonajesEnContexto(textoUsuario) {
  const t = (textoUsuario || '').toLowerCase();
  const found = new Set(estado.chicasActivas);
  for (const n of TODOS) { if (t.includes(n.toLowerCase())) found.add(n); }
  if (/hermanas?|las cinco|todas las|las quintillizas/i.test(t)) {
    for (const n of TODAS_CHICAS) found.add(n);
  }
  return [...found].filter((n) => existePersonaje(n));
}
function actualizarFaseSegunUsuario(mensaje) {
  const m = mensaje.toLowerCase();
  if ((estado.fase === FASE.NORMAL || estado.fase === FASE.TRASLADO) && PATRON_LUGAR_PRIVADO.test(m)) {
    estado.fase = FASE.TRASLADO;
    if (/hotel|motel/i.test(m)) estado.ubicacion = 'hotel';
    else if (/casa|departamento|depto/i.test(m)) estado.ubicacion = 'casa';
    else estado.ubicacion = 'lugar privado';
  }
  if (estado.fase === FASE.LLEGADA) {
    if (PATRON_CONFIRMACION.test(m) && !/^no\b/i.test(m.trim())) estado.fase = FASE.INTIMO;
    else if (PATRON_NEGACION.test(m)) estado.fase = FASE.NORMAL;
  }
  if (estado.fase !== FASE.INTIMO && /chup|foll|met[eo]|cog|mam[ao]|mamad|lam[ei]|lamiendo|lamer|chupame|mamame|doggy|misioner/i.test(m)) estado.fase = FASE.INTIMO;
}
function construirContexto(mensajeUsuarioActual = '') {
  const lineas = [
    `Fase: ${estado.fase}`,
    'Usuario = HOMBRE (pija). Las chicas = MUJERES.',
    `Chica principal: ${estado.chica}`,
    `Presentes: ${estado.chicasActivas.join(', ')}`
  ];
  if (estado.ubicacion) lineas.push(`Ubicación: ${estado.ubicacion}`);
  if (estado.fase === FASE.INTIMO) lineas.push('Escena íntima activa.');
  if (estado.hechos.length) lineas.push('Hechos: ' + estado.hechos.slice(-8).join(' | '));
  if (estado.outfitActual?.descripcion) lineas.push('OUTFIT: ' + estado.outfitActual.descripcion);
  return lineas.join('\n');
}
function extraerHechos(mensajeUsuario, respuestaBot) {
  const texto = `${mensajeUsuario} ${respuestaBot}`.toLowerCase();
  if (estado.ubicacion) estado.hechos.push(`En ${estado.ubicacion}`);
  estado.hechos = [...new Set(estado.hechos)].slice(-12);
}
async function llamarGroq(messages) {
  if (!GROQ_KEYS?.length) throw new Error('Configura tus API keys en config.js');
  let ultimoError = null;
  for (let i = 0; i < GROQ_KEYS.length; i++) {
    const key = GROQ_KEYS[(estado.keyIndex + i) % GROQ_KEYS.length];
    if (!key || key.includes('TU_KEY')) continue;
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: MODELO || 'llama-3.3-70b-versatile', messages, temperature: 1.05, top_p: 0.95, max_tokens: 1600 })
      });
      if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      estado.keyIndex = (estado.keyIndex + i) % GROQ_KEYS.length;
      return data.choices?.[0]?.message?.content || '';
    } catch (e) { ultimoError = e; }
  }
  throw ultimoError || new Error('Falló la API');
}
function parseJsonRespuesta(raw) {
  if (!raw) return null;
  let t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = t.indexOf('{'); const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(t.slice(start, end + 1));
    if (obj && typeof obj.respuesta === 'string') return obj;
  } catch (_) {}
  return null;
}
function postProcesarFase(respuestaTexto) {
  if (estado.fase === FASE.TRASLADO && /ya estamos|llegamos|habitaci[oó]n|cierro la puerta|a solas/i.test(respuestaTexto)) {
    estado.fase = FASE.LLEGADA;
  }
}
function partirBloquesMulti(texto, chicaDefault) {
  const re = /\[\s*(Ichika|Nino|Miku|Yotsuba|Itsuki|Emilia|Aldo)\s*\]\s*:/gi;
  const indices = []; let m;
  while ((m = re.exec(texto)) !== null) {
    const fixed = TODOS.find((x) => x.toLowerCase() === m[1].toLowerCase()) || m[1];
    indices.push({ nombre: fixed, index: m.index, len: m[0].length });
  }
  if (!indices.length) return [{ chica: chicaDefault, texto: texto.trim() }];
  const bloques = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].index + indices[i].len;
    const end = i + 1 < indices.length ? indices[i + 1].index : texto.length;
    const body = texto.slice(start, end).trim();
    if (body) bloques.push({ chica: indices[i].nombre, texto: body });
  }
  return bloques.length ? bloques : [{ chica: chicaDefault, texto: texto.trim() }];
}

/** Detecta pose explícita del usuario (prioridad máxima). */
function extractAccionParaChica(mensaje) {
  const t = String(mensaje || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (/en el aire|follando.?en.?el.?aire/.test(t)) return 'follando en el aire';
  if (/doggystyle|doggy|a cuatro|perrito|por detras|de espaldas|por detrás/.test(t)) return 'doggystyle';
  if (/misioner/.test(t)) return 'misionero';
  if (/reverse.?cowgirl|al reves encima/.test(t)) return 'reverse cowgirl';
  if (/cowgirl|me monto|cabalg/.test(t)) return 'cowgirl';
  if (/de costado|de lado|sidefuck/.test(t)) return 'sidefuck';
  if (/anal|por el culo|en el ano/.test(t)) return 'follando anal';
  if (/standfuck|de pie|contra la pared/.test(t)) return 'de pie';
  if (/nalgue|nalga|cachetad|azote|pego en el culo/.test(t)) return 'nalgueando';
  if (/chup|mam[ao]|lam[ei]|oral|blowjob/.test(t)) return 'chupando';
  if (/handjob|paja|con la mano/.test(t)) return 'handjob';
  return '';
}

function resolverTagPorAccion(chica, accion, soloNoSex) {
  const tags = soloNoSex ? listarTagsNoSex(chica) : listarTags(chica);
  const mapa = {
    'doggystyle': ['doggystyle', 'doggy'],
    'misionero': ['misionero', 'mision'],
    'cowgirl': ['cowgirl'],
    'reverse cowgirl': ['reverse_cowgirl', 'reverse'],
    'sidefuck': ['sidefuck', 'side'],
    'follando en el aire': ['follando_en_el_aire', 'aire'],
    'follando anal': ['follando_anal', 'anal'],
    'de pie': ['standfuck', 'stand', 'de_pie'],
    'nalgueando': ['usuario_nalguea_el_culo', 'nalg', 'usuario_nalguea'],
    'chupando': ['chupando_todo', 'lamiendo_pene', 'chupando', 'oral'],
    'handjob': ['handjob', 'paja']
  };
  const claves = mapa[accion] || [accion];
  for (const c of claves) {
    const hit = tags.find((k) => k.toLowerCase().includes(c.toLowerCase()));
    if (hit) return hit;
  }
  const inf = inferirTagFuerte(chica, '', accion, soloNoSex);
  if (inf && inf !== 'hablando') return inf;
  return null;
}

function elegirTag(chica, tagModelo, textoBloque, textoUsuario, soloNoSex) {
  const userRaw = String(textoUsuario || '');
  const user = normalizarSinonimosSexuales(userRaw);

  // PRIORIDAD 1: pose explícita del usuario
  const accion = extractAccionParaChica(userRaw);
  if (accion) {
    const tag = resolverTagPorAccion(chica, accion, soloNoSex);
    if (tag) {
      return { elegido: normalizarTag(chica, tag, soloNoSex), razon: 'accion_explicita:' + accion };
    }
  }

  const soloMuestra = esSoloMuestra(userRaw);
  const pideOral = PATRON_ORAL.test(user);
  let elegido = 'hablando';
  let razon = 'sin';

  if (soloMuestra) {
    elegido = normalizarTag(chica, 'usuario_muestra_su_verga', false) || 'usuario_muestra_su_verga';
    razon = 'muestra';
  } else if (pideOral) {
    elegido = inferirTagFuerte(chica, textoBloque, textoUsuario, false) || 'chupando';
    razon = 'oral';
  } else {
    const inf = inferirTagFuerte(chica, textoBloque, textoUsuario, soloNoSex);
    const dyn = scoreTagDinamico(chica, `${textoBloque || ''} ${user}`, soloNoSex);
    if (inf && inf !== 'hablando') { elegido = inf; razon = 'inferido'; }
    else if (dyn && dyn !== 'hablando') { elegido = dyn; razon = 'dinamico'; }
    else if (tagModelo && tagModelo !== 'hablando') { elegido = tagModelo; razon = 'modelo'; }
  }
  elegido = normalizarTag(chica, elegido, pideOral ? false : soloNoSex);

  if (soloNoSex && (esTagSex(elegido) || /muestra|verga|chup|foll|doggy|anal/i.test(String(elegido)))) {
    elegido = 'hablando';
    razon += '+forzado_nosex';
  }
  return { elegido, razon };
}

export async function enviarMensaje(mensajeUsuario) {
  if (!estado.chica) throw new Error('Selecciona una chica primero');
  try { await ensureImagenesLoaded(); } catch (_) {}

  const enContexto = detectarPersonajesEnContexto(mensajeUsuario);
  for (const n of enContexto) {
    if (!estado.chicasActivas.includes(n)) estado.chicasActivas.push(n);
  }
  actualizarFaseSegunUsuario(mensajeUsuario);

  const soloMuestraUsuario = esSoloMuestra(mensajeUsuario);
  const escenaSex = !soloMuestraUsuario && (esEscenaSex() || PATRON_SEXO.test(mensajeUsuario));
  const soloNoSex = !escenaSex;

  const tags = soloNoSex ? listarTagsNoSex(estado.chica) : listarTags(estado.chica);
  const descripcionesVisuales = listarDescripcionesTags(estado.chica, soloNoSex);
  const personalidad = getPersonalidad(estado.chica, estado.nombreUsuario);
  let system = armarSystemPrompt(personalidad, estado.nombreUsuario, construirContexto(mensajeUsuario), tags, getLore(estado.nombreUsuario), descripcionesVisuales);
  if (estado.chicasActivas.length > 1) {
    const extras = estado.chicasActivas.filter((c) => c !== estado.chica).map((c) => `### ${c}\n${getPersonalidad(c, estado.nombreUsuario)}`).join('\n\n');
    system += `\n\nOTROS PERSONAJES:\n${extras}`;
  }
  if (soloMuestraUsuario) system += '\n\n⚠️ Usuario SOLO mostró la pija. NO chupar. imagen_tag = usuario_muestra_su_verga.';

  const accion = extractAccionParaChica(mensajeUsuario);
  if (accion) system += `\n\n⚠️ El usuario pidió explícitamente: ${accion}. Describí ESA pose.`;

  logGroup('Request', { chica: estado.chica, fase: estado.fase, escenaSex, soloNoSex, mensajeUsuario, accion: accion || '(ninguna)' });

  const messages = [
    { role: 'system', content: system },
    ...estado.historial.slice(-MAX_HISTORIAL).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: mensajeUsuario }
  ];
  let raw = await llamarGroq(messages);
  let parsed = parseJsonRespuesta(raw);
  if (!parsed) {
    for (const extra of PROMPTS_REINTENTO) {
      raw = await llamarGroq([
        { role: 'system', content: system + '\n\n' + extra },
        ...estado.historial.slice(-8).map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: mensajeUsuario },
        { role: 'assistant', content: raw || '' },
        { role: 'user', content: 'Corrige SOLO JSON.' }
      ]);
      parsed = parseJsonRespuesta(raw);
      if (parsed) break;
    }
  }
  if (!parsed) parsed = { respuesta: `*te miro* Ay ${estado.nombreUsuario}... decime de nuevo.`, imagen_tag: 'hablando' };

  postProcesarFase(parsed.respuesta);
  extraerHechos(mensajeUsuario, parsed.respuesta);
  if (estado.fase !== FASE.INTIMO && !soloMuestraUsuario && PATRON_SEXO.test(mensajeUsuario)) estado.fase = FASE.INTIMO;

  const bloques = partirBloquesMulti(parsed.respuesta, estado.chica);
  const ahoraSoloNoSex = !(!soloMuestraUsuario && (esEscenaSex() || PATRON_SEXO.test(mensajeUsuario) || PATRON_ORAL.test(mensajeUsuario)));

  const partes = bloques.map((b) => {
    if (b.chica === 'Aldo') return { chica: 'Aldo', texto: b.texto, imagenUrl: '', audioUrl: '', descripcionImg: '', imagen_tag: '' };
    const { elegido, razon } = elegirTag(b.chica, parsed.imagen_tag || '', b.texto, mensajeUsuario, ahoraSoloNoSex);
    const media = resolverImagen(b.chica, elegido, ahoraSoloNoSex);
    logGroup(`Tag → ${b.chica}`, { accion: accion || '(ninguna)', razon, tagElegido: elegido, tagFinal: media.tag });
    return { chica: b.chica, texto: b.texto, imagenUrl: media.url, audioUrl: media.audio || '', descripcionImg: media.descripcion || '', imagen_tag: media.tag || elegido };
  });

  const parteConDesc = partes.find((p) => p.descripcionImg?.trim());
  if (parteConDesc) estado.outfitActual = { chica: parteConDesc.chica, tag: parteConDesc.imagen_tag, descripcion: parteConDesc.descripcionImg.trim() };

  estado.historial.push({ role: 'user', content: mensajeUsuario });
  estado.historial.push({ role: 'assistant', content: parsed.respuesta });
  if (estado.historial.length > MAX_HISTORIAL * 2) estado.historial = estado.historial.slice(-MAX_HISTORIAL * 2);

  logGroup('Respuesta final', { fase: estado.fase, partes: partes.map((p) => `${p.chica}: tag=${p.imagen_tag}`).join(' | ') });
  return {
    partes,
    texto: parsed.respuesta,
    imagen_tag: partes[0]?.imagen_tag || 'hablando',
    imagenUrl: partes[0]?.imagenUrl || '',
    audioUrl: partes[0]?.audioUrl || '',
    descripcionImg: partes[0]?.descripcionImg || '',
    fase: estado.fase,
    chica: estado.chica,
    chicasActivas: [...estado.chicasActivas]
  };
}

export function resetChat() {
  estado.historial = []; estado.fase = FASE.NORMAL; estado.ubicacion = null; estado.hechos = [];
  estado.chicasActivas = estado.chica ? [estado.chica] : []; estado.modo = 'libre'; estado.historiaId = null; estado.outfitActual = null;
}
export function volverAlSelector() {
  estado.chica = null; estado.chicasActivas = []; estado.historial = []; estado.fase = FASE.NORMAL;
  estado.ubicacion = null; estado.hechos = []; estado.modo = 'libre'; estado.historiaId = null; estado.outfitActual = null;
}
export { getChicasDisponibles, getImagenSelector, getDescripcionChica, listarTags };
