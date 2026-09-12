// ============================================================
//  Motor principal - QuintiAmigas v2
//  Tags: resolucion por especificidad (usuario > reglas > dinamico)
//  + tagEngine estilo Nakardas (prioridad usuario > continuidad > bot)
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
import { resolverTagEscena, detectarAccionEnTexto } from '../systems/tagEngine.js';
import { getHistoria, rellenarNombre } from '../stories/historias.js';
import { getLore } from '../world/lore.js';
import { GROQ_KEYS, MODELO, NOMBRE_USUARIO_DEFAULT } from '../../config.js';

export const FASE = { NORMAL: 'normal', TRASLADO: 'traslado', LLEGADA: 'llegada', INTIMO: 'intimo' };
const TODAS_CHICAS = ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia'];
const TODOS = [...TODAS_CHICAS, 'Aldo'];

let estado = {
  fase: FASE.NORMAL, ubicacion: null, chica: null, chicasActivas: [], historial: [],
  nombreUsuario: NOMBRE_USUARIO_DEFAULT || 'Fabrizio', hechos: [], keyIndex: 0,
  modo: 'libre', historiaId: null, outfitActual: null, accionActual: null
};

const MAX_HISTORIAL = 20;
const PATRON_LUGAR_PRIVADO = /\b(hotel|motel|habitaci[oó]n|casa|departamento|depto|pieza|cuarto|mi casa|tu casa|a solas|lugar m[aá]s privado)\b/i;
const PATRON_CONFIRMACION = /\b(s[ií]|claro|vamos|dale|quiero|contin[uú]a|continuar|foll|chup|besame|t[oó]came|hazlo|hacelo|por favor|ya)\b/i;
const PATRON_NEGACION = /\b(no|para|espera|despacio|mejor no|ahora no)\b/i;
const PATRON_SEXO = /\b(foll|chup|mamad|mam[ao]|lam[ei]|lamiendo|lamer|deepthroat|te la meto|métela|cog[eé]|por el culo|en el culo|follando|penetra|en (tu|la) boca|hasta el fondo|toda la (pija|verga|polla)|handjob|paja|corr[ei]|semen|69|doggy|misioner|cowgirl|chupame|mamame|chupamela|mamamela|lame(me|la)?|bola|bolas|testicul)\b/i;
const PATRON_ORAL = /\b(chup|mam[ao]|mamad|lam[ei]|lamiendo|lamer|chupame|mamame|chupamela|mamamela|lame(me|la)?|en (tu|la|mi) boca|deepthroat|oral|blowjob|bola|bolas|testicul)\b/i;
const SINONIMOS_VERGA = /\b(polla|pija|poronga|pichula|pito|rabo|pinga|pene|verga)\b/gi;

function normalizarSinonimosSexuales(texto) {
  let t = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  t = t.replace(SINONIMOS_VERGA, 'verga');
  t = t.replace(/\bverga\b/g, 'verga pene');
  return t;
}

function esSoloMuestra(mensaje) {
  let m = String(mensaje || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  m = m.replace(/\b(miverga|mipija|mipolla|mipene)\b/g, 'mi verga');
  m = m.replace(/\bmi\s*(verga|pija|polla|pene|poronga|pichula|pinga)\b/g, 'mi verga');
  m = m.replace(/\b(muestromiverga|muestromipija|sacolapija|sacolaverga)\b/g, 'muestro mi verga');
  m = normalizarSinonimosSexuales(m);
  const muestra = /\b(le |te |me )?muestro (mi )?(pija|verga|polla|pene)|saco (la )?(pija|verga|polla|pene)|mir[aeá] (mi )?(pija|verga|polla|pene)|ve(s|an)? (mi )?(pija|verga|polla|pene)|te dejo ver|para que (la )?veas|\bmi verga\b|\bmuestro\b.*\b(verga|pija|pene)\b|\b(saco|saca)\b.*\b(verga|pija|pene)\b/i.test(m);
  const pideActo = /\b(chup|mam[ao]|mamad|lam[ei]|lamiendo|lamer|chupame|mamame|foll|met[eo]|cog|paja|handjob|te la meto|métela|bola)\b/i.test(m);
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
  estado.modo = 'libre'; estado.historiaId = null; estado.outfitActual = null; estado.accionActual = null;
  log('Chat libre iniciado', { chica, usuario: estado.nombreUsuario });
}
export function iniciarHistoria(chica, historiaId) {
  if (!existeChica(chica)) throw new Error('Chica no existe');
  const h = getHistoria(chica, historiaId);
  if (!h) throw new Error('Historia no existe');
  estado.chica = chica; estado.chicasActivas = [chica]; estado.fase = FASE.NORMAL;
  estado.ubicacion = null; estado.historial = []; estado.hechos = [];
  estado.modo = 'historia'; estado.historiaId = historiaId; estado.outfitActual = null; estado.accionActual = null;
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
  if (media.tag && media.tag !== 'hablando') estado.accionActual = media.tag;
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
  if (estado.fase !== FASE.INTIMO && /chup|foll|met[eo]|cog|mam[ao]|mamad|lam[ei]|lamiendo|lamer|chupame|mamame|doggy|misioner|bola/i.test(m)) estado.fase = FASE.INTIMO;
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
  if (mensajeUsuarioActual && esSoloMuestra(mensajeUsuarioActual)) {
    lineas.push('⚠️ Usuario SOLO muestra la verga. Reaccioná. PROHIBIDO chupar. tag=usuario_muestra_su_verga.');
  }
  if (estado.hechos.length) lineas.push('Hechos: ' + estado.hechos.slice(-8).join(' | '));
  if (estado.outfitActual?.descripcion) lineas.push('OUTFIT: ' + estado.outfitActual.descripcion);
  if (estado.accionActual) lineas.push('Accion en curso: ' + estado.accionActual);
  return lineas.join('\n');
}
function extraerHechos() {
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

function normUser(msg) {
  let t = String(msg || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  t = t.replace(/\b(miverga|mipija)\b/g, 'mi verga');
  t = t.replace(SINONIMOS_VERGA, 'verga');
  return t;
}

function resolverIntencionUsuario(mensaje) {
  const t = normUser(mensaje);
  if (!t.trim()) return null;
  if (esSoloMuestra(mensaje)) {
    return { tagHint: ['usuario_muestra_su_verga', 'muestra_su_verga', 'viendo_verga', 've_mi_verga'], label: 'muestra' };
  }
  if (/\b(bola|bolas|testicul|testículo|testiculo)s?\b/.test(t)) {
    return { tagHint: ['chupando_bolas', 'chupando_bola', 'bolas', 'lamiendo_bolas'], label: 'oral_bolas' };
  }
  if (/solo la punta|chupa.*(solo )?(la )?punta|lame.*(solo )?(la )?punta|cabeza del|solo la cabeza/.test(t)) {
    return { tagHint: ['chupando_solo_la_punta', 'punta'], label: 'oral_punta' };
  }
  if (/hasta la mitad|la mitad|mitad de/.test(t)) {
    return { tagHint: ['chupando_solo_la_mitad', 'mitad'], label: 'oral_mitad' };
  }
  if (/hasta el fondo|toda la (pija|verga|polla|pene)|deepthroat|se la traga|entera/.test(t)) {
    return { tagHint: ['chupando_todo_el_pene', 'chupando_todo', 'deep'], label: 'oral_todo' };
  }
  if (/\blam(e|er|iendo|eme|ela)\b/.test(t) && !/chup|mam/.test(t)) {
    return { tagHint: ['lamiendo_pene', 'lamiendo', 'chupando_solo_la_punta'], label: 'oral_lamer' };
  }
  if (PATRON_ORAL.test(t) || /\b(chup|mam[ao]|mamad|oral|blowjob)\b/.test(t)) {
    return { tagHint: ['lamiendo_pene', 'chupando_solo_la_mitad', 'chupando_solo_la_punta', 'chupando', 'oral'], label: 'oral_gen' };
  }
  if (/en el aire|follando.?en.?el.?aire/.test(t)) return { tagHint: ['follando_en_el_aire', 'aire'], label: 'aire' };
  if (/doggystyle|doggy|a cuatro|perrito|por detras|de espaldas|por detrás/.test(t)) return { tagHint: ['doggystyle', 'doggy'], label: 'doggy' };
  if (/misioner/.test(t)) return { tagHint: ['misionero', 'mision'], label: 'misionero' };
  if (/reverse.?cowgirl|al reves encima/.test(t)) return { tagHint: ['reverse_cowgirl', 'reverse'], label: 'reverse_cowgirl' };
  if (/cowgirl|me monto|cabalg/.test(t)) return { tagHint: ['cowgirl'], label: 'cowgirl' };
  if (/de costado|de lado|sidefuck/.test(t)) return { tagHint: ['sidefuck', 'side'], label: 'sidefuck' };
  if (/\banal\b|por el culo|en el ano/.test(t)) return { tagHint: ['follando_anal', 'anal'], label: 'anal' };
  if (/standfuck|de pie|contra la pared/.test(t)) return { tagHint: ['standfuck', 'stand', 'de_pie', 'ventana'], label: 'de_pie' };
  if (/nalgue|nalga|cachetad|azote|pego en el culo/.test(t)) return { tagHint: ['usuario_nalguea_el_culo', 'nalg', 'usuario_nalguea'], label: 'nalguear' };
  if (/handjob|paja|con la mano|te la jalo/.test(t)) return { tagHint: ['handjob', 'paja'], label: 'handjob' };
  if (/\bbeso|besarte|besando|te beso/.test(t)) return { tagHint: ['besando', 'bes'], label: 'beso' };
  if (/desnuda|desnud|sin ropa/.test(t)) return { tagHint: ['desnuda', 'quitandose'], label: 'desnuda' };
  if (/agarr[oa].*culo|culo.*agarr|tomo.*culo|manose.*culo/.test(t)) return { tagHint: ['usuario_agarra_el_culo', 'agarra_el_culo', 'agarrando_culo'], label: 'agarrar_culo' };
  return null;
}

function buscarTagEnPack(chica, claves, soloNoSex) {
  const tags = soloNoSex ? listarTagsNoSex(chica) : listarTags(chica);
  for (const c of claves) {
    const hit = tags.find((k) => k.toLowerCase().includes(String(c).toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

/** Elegir tag con motor Nakardas: usuario > continuidad > bot > modelo > hablando */
function elegirTag(chica, tagModelo, textoBloque, textoUsuario, soloNoSex) {
  const resultado = resolverTagEscena({
    chica,
    mensajeUsuario: textoUsuario || '',
    textoBot: textoBloque || '',
    tagModelo: tagModelo || '',
    soloNoSex: !!soloNoSex,
    accionAnterior: estado.accionActual
  });
  let elegido = normalizarTag(chica, resultado.tag || 'hablando', soloNoSex);
  let razon = resultado.razon || 'sin';

  if (soloNoSex) {
    const esMuestraTag = /usuario_muestra_su_verga|viendo_verga|ve_mi_verga|muestra_su_verga/i.test(String(elegido || ''));
    if (!esMuestraTag && (esTagSex(elegido) || /chup|foll|doggy|anal|cowgirl|mision|handjob|paja|oral|bola/i.test(String(elegido || '')))) {
      elegido = 'hablando';
      razon += '+forzado_nosex';
    }
  }
  return { elegido, razon, fuente: resultado.fuente || '', puntuacion: resultado.puntuacion || 0 };
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

  const intencion = resolverIntencionUsuario(mensajeUsuario);
  if (soloMuestraUsuario) {
    system += '\n\n⚠️ Usuario SOLO mostró la pija. Reaccioná. PROHIBIDO chupar. imagen_tag = usuario_muestra_su_verga.';
  } else if (intencion) {
    system += `\n\n⚠️ El usuario pidió específicamente: ${intencion.label}. Describí ESA acción (no inventes otra pose).`;
  }

  logGroup('Request', {
    chica: estado.chica, fase: estado.fase, escenaSex, soloNoSex,
    soloMuestra: soloMuestraUsuario, mensajeUsuario,
    intencion: intencion ? intencion.label : '(ninguna)',
    accionActual: estado.accionActual
  });

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
  extraerHechos();

  const bloques = partirBloquesMulti(parsed.respuesta, estado.chica);
  const ahoraSoloNoSex = soloMuestraUsuario ? false : !escenaSex && !(PATRON_SEXO.test(mensajeUsuario) || PATRON_ORAL.test(mensajeUsuario));

  const partes = bloques.map((b) => {
    if (b.chica === 'Aldo') return { chica: 'Aldo', texto: b.texto, imagenUrl: '', audioUrl: '', descripcionImg: '', imagen_tag: '' };
    const { elegido, razon, fuente } = elegirTag(b.chica, parsed.imagen_tag || '', b.texto, mensajeUsuario, ahoraSoloNoSex);
    const media = resolverImagen(b.chica, elegido, soloMuestraUsuario ? false : ahoraSoloNoSex);
    logGroup(`Tag → ${b.chica}`, {
      intencion: intencion ? intencion.label : '(ninguna)',
      razon, fuente,
      tagElegido: elegido, tagFinal: media.tag,
      accionAnterior: estado.accionActual
    });
    return { chica: b.chica, texto: b.texto, imagenUrl: media.url, audioUrl: media.audio || '', descripcionImg: media.descripcion || '', imagen_tag: media.tag || elegido };
  });

  const parteConDesc = partes.find((p) => p.descripcionImg?.trim());
  if (parteConDesc) estado.outfitActual = { chica: parteConDesc.chica, tag: parteConDesc.imagen_tag, descripcion: parteConDesc.descripcionImg.trim() };

  const tagPrincipal = partes.find((p) => p.chica !== 'Aldo' && p.imagen_tag)?.imagen_tag;
  if (tagPrincipal && tagPrincipal !== 'hablando') {
    estado.accionActual = tagPrincipal;
  } else if (!escenaSex) {
    const userAct = detectarAccionEnTexto(mensajeUsuario);
    if (!userAct.tag) estado.accionActual = null;
  }

  estado.historial.push({ role: 'user', content: mensajeUsuario });
  estado.historial.push({ role: 'assistant', content: parsed.respuesta });
  if (estado.historial.length > MAX_HISTORIAL * 2) estado.historial = estado.historial.slice(-MAX_HISTORIAL * 2);

  logGroup('Respuesta final', {
    fase: estado.fase,
    accionActual: estado.accionActual,
    partes: partes.map((p) => `${p.chica}: tag=${p.imagen_tag}`).join(' | ')
  });
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
  estado.chicasActivas = estado.chica ? [estado.chica] : []; estado.modo = 'libre'; estado.historiaId = null; estado.outfitActual = null; estado.accionActual = null;
}
export function volverAlSelector() {
  estado.chica = null; estado.chicasActivas = []; estado.historial = []; estado.fase = FASE.NORMAL;
  estado.ubicacion = null; estado.hechos = []; estado.modo = 'libre'; estado.historiaId = null; estado.outfitActual = null; estado.accionActual = null;
}
export { getChicasDisponibles, getImagenSelector, getDescripcionChica, listarTags };
