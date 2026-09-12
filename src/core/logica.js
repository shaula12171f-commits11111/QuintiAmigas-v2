// ============================================================
//  Motor principal - QuintiAmigas v2  (multi-call + tags dinámicos)
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
  if (/chup|pija|foll|coño|mamad|sábanas|boxers/i.test(texto)) estado.fase = FASE.INTIMO;
  const soloNoSex = estado.fase !== FASE.INTIMO && !PATRON_SEXO.test(texto);
  const tagInferido = inferirTagFuerte(chica, texto, '', soloNoSex);
  const media = resolverImagen(chica, tagInferido, soloNoSex);
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
  if (/la mayor|ichi\b/.test(t)) found.add('Ichika');
  if (/tsundere|la de los lazos/.test(t)) found.add('Nino');
  if (/mech[oó]n|la callada/.test(t)) found.add('Miku');
  if (/la del lazo|energ[eé]tica/.test(t)) found.add('Yotsuba');
  if (/la seria|horquillas/.test(t)) found.add('Itsuki');
  if (/semielfa|platead/.test(t)) found.add('Emilia');
  if (/\baldo\b/.test(t)) found.add('Aldo');
  if (/hermanas?|las cinco|todas las|vienen las|están las|las quintillizas/i.test(t)) {
    for (const n of TODAS_CHICAS) found.add(n);
  }
  return [...found].filter((n) => existePersonaje(n));
}
function actualizarFaseSegunUsuario(mensaje) {
  const m = mensaje.toLowerCase();
  if (estado.fase === FASE.NORMAL || estado.fase === FASE.TRASLADO) {
    if (PATRON_LUGAR_PRIVADO.test(m)) {
      estado.fase = FASE.TRASLADO;
      if (/hotel|motel/i.test(m)) estado.ubicacion = 'hotel';
      else if (/casa|departamento|depto/i.test(m)) estado.ubicacion = 'casa';
      else if (/habitaci|pieza|cuarto/i.test(m)) estado.ubicacion = 'habitación';
      else estado.ubicacion = 'lugar privado';
    }
  }
  if (estado.fase === FASE.LLEGADA) {
    if (PATRON_CONFIRMACION.test(m) && !/^no\b/i.test(m.trim())) estado.fase = FASE.INTIMO;
    else if (PATRON_NEGACION.test(m)) estado.fase = FASE.NORMAL;
  }
  if (estado.fase !== FASE.INTIMO && /chup|foll|met[eo]|cog|mam[ao]|mamad|lam[ei]|lamiendo|lamer|chupame|mamame|chupamela|mamamela/i.test(m)) estado.fase = FASE.INTIMO;
}
function construirContexto(mensajeUsuarioActual = '') {
  const lineas = [
    `Fase: ${estado.fase}`,
    'Usuario = HOMBRE (pija). Las chicas = MUJERES. Aldo = HOMBRE (amigo).',
    'Escribí natural y viva, no robótica.',
    `Chica principal del chat: ${estado.chica}`,
    `Personajes presentes en la escena: ${estado.chicasActivas.join(', ')}`
  ];
  if (estado.chicasActivas.length > 1) lineas.push('MULTI: Cada uno habla en bloques [Nombre]: texto. Si el usuario pide poses distintas, cada una describe SOLO la suya.');
  if (estado.ubicacion) lineas.push(`Ubicación: ${estado.ubicacion}`);
  if (estado.fase === FASE.TRASLADO || estado.fase === FASE.LLEGADA) lineas.push('Aún NO sexo explícito.');
  if (estado.fase === FASE.INTIMO) lineas.push('Escena íntima activa.');
  else lineas.push('Escena SIN acto sexual pedido todavía.');
  if (mensajeUsuarioActual && esSoloMuestra(mensajeUsuarioActual) && estado.fase !== FASE.INTIMO) {
    lineas.push('⚠️ Usuario SOLO muestra verga. Reaccioná. PROHIBIDO chupar. tag=usuario_muestra_su_verga.');
  }
  if (estado.hechos.length) lineas.push('Hechos: ' + estado.hechos.slice(-8).join(' | '));
  if (estado.outfitActual && estado.outfitActual.descripcion) {
    lineas.push('OUTFIT ACTUAL (' + (estado.outfitActual.chica || '') + '): ' + estado.outfitActual.descripcion + ' — Respetá esta ropa.');
  }
  return lineas.join('\n');
}
function extraerHechos(mensajeUsuario, respuestaBot) {
  const texto = `${mensajeUsuario} ${respuestaBot}`.toLowerCase();
  if (/novia|novio|pareja/.test(texto)) estado.hechos.push('Relación romántica');
  if (/te amo|te quiero/.test(texto)) estado.hechos.push('Declaración afectiva');
  if (estado.ubicacion) estado.hechos.push(`En ${estado.ubicacion}`);
  if (/\baldo\b/.test(texto) && estado.chicasActivas.includes('Aldo')) estado.hechos.push('Aldo en escena');
  estado.hechos = [...new Set(estado.hechos)].slice(-12);
}
async function llamarGroq(messages) {
  if (!GROQ_KEYS || !GROQ_KEYS.length) throw new Error('Configura tus API keys en config.js');
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
  if (estado.fase === FASE.TRASLADO) {
    if (/ya estamos|llegamos|habitaci[oó]n|cierro la puerta|a solas/i.test(respuestaTexto)) estado.fase = FASE.LLEGADA;
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
  if (indices[0].index > 0) {
    const pre = texto.slice(0, indices[0].index).trim();
    if (pre) bloques.push({ chica: chicaDefault, texto: pre });
  }
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].index + indices[i].len;
    const end = i + 1 < indices.length ? indices[i + 1].index : texto.length;
    const body = texto.slice(start, end).trim();
    if (body) bloques.push({ chica: indices[i].nombre, texto: body });
  }
  return bloques.length ? bloques : [{ chica: chicaDefault, texto: texto.trim() }];
}

/** Extrae la acción pedida para UNA chica de forma más robusta. */
function extractAccionParaChica(mensaje, chica) {
  const raw = String(mensaje || '');
  const t = raw.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const nombre = String(chica || '').toLowerCase();
  if (!nombre) return '';
  const aliases = {
    ichika: ['ichika', 'ichi'], nino: ['nino'], miku: ['miku'],
    yotsuba: ['yotsuba', 'yots'], itsuki: ['itsuki'], emilia: ['emilia']
  };
  const keys = aliases[nombre] || [nombre];
  const named = keys.some((k) => t.includes(k));
  const grupal = /las\s*2|ambas|las dos|a las dos|a las 2|todas|a las 5|las cinco/.test(t);

  const posePatterns = [
    { re: /en el aire|follando.?en.?el.?aire|sexo en el aire|levantad[oa] en el aire/, accion: 'follando en el aire' },
    { re: /doggy|a cuatro|perrito|por detras|de espaldas/, accion: 'doggystyle' },
    { re: /de costado|de lado|sidefuck/, accion: 'sidefuck' },
    { re: /misioner/, accion: 'misionero' },
    { re: /cowgirl|me monto|encima|cabalg/, accion: 'cowgirl' },
    { re: /reverse.?cowgirl|al reves encima/, accion: 'reverse cowgirl' },
    { re: /anal|por el culo|en el ano/, accion: 'follando anal' },
    { re: /chup|mam[ao]|lam[ei]|oral|blowjob/, accion: 'chupando' },
    { re: /de pie|standfuck|contra la pared|ventana/, accion: 'de pie' },
    { re: /handjob|paja|con la mano/, accion: 'handjob' }
  ];

  for (const k of keys) {
    for (const { re, accion } of posePatterns) {
      const cerca = new RegExp(
        `(?:${re.source}).{0,40}\\b${k}\\b|\\b${k}\\b.{0,40}(?:${re.source})|` +
        `(?:follo|follando|cogiendo|chupa|mama).{0,25}\\b${k}\\b.{0,25}(?:${re.source})`,
        'i'
      );
      if (cerca.test(raw) || (named && re.test(t))) {
        return accion;
      }
    }
  }

  if ((named || grupal)) {
    for (const { re, accion } of posePatterns) {
      if (re.test(t)) return accion;
    }
  }
  return '';
}

function usuarioSeDirigeA(mensaje, chica) {
  const t = String(mensaje || '').toLowerCase();
  const nombre = String(chica || '').toLowerCase();
  if (!nombre) return false;
  if (t.includes(nombre)) return true;
  if (nombre === 'ichika' && /\bichi\b/.test(t)) return true;
  if (/las\s*2|ambas|las dos|a las dos|a las 2|todas|las cinco|hermanas/i.test(t)) return true;
  return false;
}

function elegirTag(chica, tagModelo, textoBloque, textoUsuario, soloNoSex) {
  const userRaw = String(textoUsuario || '');
  const user = normalizarSinonimosSexuales(userRaw);
  const combinado = `${textoBloque || ''} ${user}`;
  const hayAccion = PATRON_ACCION.test(combinado);
  const tagDinamico = scoreTagDinamico(chica, combinado, soloNoSex);
  const tagInferidoLibre = inferirTagFuerte(chica, textoBloque, textoUsuario, false);
  const tagInferido = inferirTagFuerte(chica, textoBloque, textoUsuario, soloNoSex);
  const tagModeloNorm = normalizarTag(chica, tagModelo || 'hablando', soloNoSex);
  let elegido, razon = '';
  const pidePunta = /solo la punta|chupa.*(punta|cabeza)|lame.*(punta|cabeza)|cabeza del/i.test(user);
  const pideMitad = /hasta la mitad|la mitad|mitad de/i.test(user);
  const pideTodo = /hasta el fondo|toda la (pija|verga|polla)|deepthroat|entera/i.test(user);
  const pideOral = PATRON_ORAL.test(user);
  const soloMuestra = esSoloMuestra(userRaw);
  if (soloMuestra) {
    if (tagDinamico && !/chup|mamad|oral|lam/i.test(tagDinamico)) elegido = tagDinamico;
    else if (tagInferido && !/chup|mamad|oral|lam/i.test(tagInferido)) elegido = tagInferido;
    else if (tagModeloNorm && !/chup|mamad|oral|lam/i.test(tagModeloNorm)) elegido = tagModeloNorm;
    else elegido = 'usuario_muestra_su_verga';
    razon = 'muestra';
  } else if (pideOral) {
    if (pidePunta) elegido = normalizarTag(chica, tagDinamico || tagInferidoLibre || 'chupando_solo_la_punta_del_pene', false);
    else if (pideMitad) elegido = normalizarTag(chica, tagDinamico || tagInferidoLibre || 'chupando_solo_la_mitad_del_pene', false);
    else if (pideTodo) elegido = normalizarTag(chica, tagDinamico || tagInferidoLibre || 'chupando_todo_el_pene', false);
    else {
      const candidatos = [tagDinamico, tagInferidoLibre, tagModeloNorm, 'lamiendo_pene', 'chupando_todo_el_pene', 'chupando_solo_la_punta_del_pene', 'chupando'];
      elegido = 'hablando';
      for (const c of candidatos) {
        const n = normalizarTag(chica, c, false);
        if (n && n !== 'hablando' && /chup|lam|oral|pene|verga/i.test(n)) { elegido = n; break; }
      }
    }
    razon = 'oral';
  } else {
    if (tagDinamico && tagDinamico !== 'hablando') { elegido = tagDinamico; razon = 'dinamico'; }
    else if (tagModeloNorm && tagModeloNorm !== 'hablando') { elegido = tagModeloNorm; razon = 'modelo'; }
    else { elegido = tagInferido || 'hablando'; razon = hayAccion ? 'accion' : 'sin'; }
  }
  elegido = normalizarTag(chica, elegido, pideOral ? false : soloNoSex);
  if (soloMuestra && (/chup|mamad|oral|lam/i.test(elegido) || elegido === 'hablando')) {
    const forzado = normalizarTag(chica, 'usuario_muestra_su_verga', false);
    if (forzado && forzado !== 'hablando') elegido = forzado;
  }
  if (pideOral && !/chup|lam|oral|pene|verga|mam/i.test(elegido)) {
    const forzadoOral = normalizarTag(chica, 'lamiendo_pene', false) || normalizarTag(chica, 'chupando_solo_la_punta_del_pene', false) || normalizarTag(chica, 'chupando_todo_el_pene', false);
    if (forzadoOral && forzadoOral !== 'hablando') elegido = forzadoOral;
  }
  return { elegido, tagModeloNorm, tagInferido, hayAccion, razon, tagDinamico };
}

function armarBriefEscena(mensajeUsuario, dirigidas) {
  const acciones = dirigidas.map((c) => {
    const acc = extractAccionParaChica(mensajeUsuario, c);
    return acc ? `${c}: ${acc}` : `${c}: presente`;
  });
  return [
    `ESCENA COMPARTIDA (todas las chicas deben respetar esto):`,
    `Usuario (${estado.nombreUsuario}) pidió: "${mensajeUsuario}"`,
    `Participantes y acciones pedidas: ${acciones.join(' | ')}`,
    `Fase: ${estado.fase}${estado.ubicacion ? ' · Ubicación: ' + estado.ubicacion : ''}`,
    `Regla: cada chica describe SOLO su propia parte. No inventes que otra chica hace lo mismo. No contradigas la acción de las demás.`
  ].join('\n');
}

async function generarRespuestaChica(chica, mensajeUsuario, briefEscena, soloNoSex, escenaSex) {
  const tags = soloNoSex ? listarTagsNoSex(chica) : listarTags(chica);
  const descripcionesVisuales = listarDescripcionesTags(chica, soloNoSex);
  const personalidad = getPersonalidad(chica, estado.nombreUsuario);
  const accionSu = extractAccionParaChica(mensajeUsuario, chica);
  let system = armarSystemPrompt(
    personalidad, estado.nombreUsuario,
    construirContexto(mensajeUsuario) + '\n\n' + briefEscena,
    tags, getLore(estado.nombreUsuario), descripcionesVisuales
  );
  system += `\n\n⚠️ SOS ${chica}. Respondé SOLO como ${chica}.`;
  system += `\nFormato: {"respuesta":"[${chica}]: *acciones* diálogo...","imagen_tag":"tag_exacto"}`;
  if (accionSu) system += `\nAcción que el usuario te pidió específicamente a vos: ${accionSu}. Describí ESA pose/acción.`;
  system += `\nNo hables por otras chicas. No inventes sus acciones.`;
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
        { role: 'user', content: 'Corrige SOLO JSON válido con respuesta e imagen_tag.' }
      ]);
      parsed = parseJsonRespuesta(raw);
      if (parsed) break;
    }
  }
  if (!parsed) parsed = { respuesta: `*[${chica}]: *te mira* Ay ${estado.nombreUsuario}...*`, imagen_tag: 'hablando' };
  let texto = parsed.respuesta || '';
  if (!new RegExp(`\\[\\s*${chica}\\s*\\]\\s*:`, 'i').test(texto)) texto = `[${chica}]: ${texto}`;
  return { chica, texto, imagen_tag: parsed.imagen_tag || 'hablando', raw };
}

async function reescribirParaCoherencia(principal, secundarias, mensajeUsuario, briefEscena) {
  if (!secundarias.length) return secundarias;
  const listaSec = secundarias.map((s) => `${s.chica}:\n${s.texto}`).join('\n\n---\n\n');
  const system = `Sos un editor de roleplay erótico multi-personaje.
Tu trabajo: reescribir las respuestas de las chicas SECUNDARIAS para que sean coherentes con la respuesta PRINCIPAL y con la escena.

REGLAS:
- No cambies la personalidad de cada chica.
- Cada una debe describir SOLO su propia acción/pose.
- No inventes contradicciones (ej. las dos no pueden estar "solas encima" al mismo tiempo).
- Mantené el tono sexual y natural.
- Devolvé SOLO JSON: {"respuestas":[{"chica":"Nombre","respuesta":"[Nombre]: texto reescrito","imagen_tag":"tag"}]}

${briefEscena}

RESPUESTA PRINCIPAL (${principal.chica}):
${principal.texto}
`;
  const userMsg = `Reescribí estas respuestas secundarias para que encajen con la principal y la escena:\n\n${listaSec}`;
  try {
    const raw = await llamarGroq([{ role: 'system', content: system }, { role: 'user', content: userMsg }]);
    const parsed = parseJsonRespuesta(raw);
    if (parsed && Array.isArray(parsed.respuestas)) {
      return secundarias.map((s) => {
        const found = parsed.respuestas.find((r) => String(r.chica || '').toLowerCase() === s.chica.toLowerCase());
        if (found && found.respuesta) {
          let texto = found.respuesta;
          if (!new RegExp(`\\[\\s*${s.chica}\\s*\\]\\s*:`, 'i').test(texto)) texto = `[${s.chica}]: ${texto}`;
          return { ...s, texto, imagen_tag: found.imagen_tag || s.imagen_tag };
        }
        return s;
      });
    }
  } catch (e) { log('Rewrite falló, se usan originales', e.message); }
  return secundarias;
}

async function enviarMensajeSingle(mensajeUsuario, soloNoSex, escenaSex, dirigidas) {
  const tags = soloNoSex ? listarTagsNoSex(estado.chica) : listarTags(estado.chica);
  const descripcionesVisuales = listarDescripcionesTags(estado.chica, soloNoSex);
  const personalidad = getPersonalidad(estado.chica, estado.nombreUsuario);
  let system = armarSystemPrompt(personalidad, estado.nombreUsuario, construirContexto(mensajeUsuario), tags, getLore(estado.nombreUsuario), descripcionesVisuales);
  if (estado.chicasActivas.length > 1) {
    const extras = estado.chicasActivas.filter((c) => c !== estado.chica).map((c) => `### ${c}\n${getPersonalidad(c, estado.nombreUsuario)}`).join('\n\n');
    system += `\n\nOTROS PERSONAJES PRESENTES:\n${extras}`;
  }
  if (esSoloMuestra(mensajeUsuario)) system += '\n\n⚠️ Usuario SOLO mostró la pija. Reaccioná. PROHIBIDO chupar. imagen_tag = usuario_muestra_su_verga.';
  if (dirigidas.length === 1 && dirigidas[0] !== estado.chica) {
    system += `\n\n⚠️ El usuario se dirige a ${dirigidas[0]}. Debe responder principalmente [${dirigidas[0]}]: ... ${estado.chica} NO se apropia del turno.`;
  } else if (dirigidas.length > 1 || estado.chicasActivas.length > 1) {
    system += '\n\n⚠️ MULTI: Si pide cosas DISTINTAS a cada chica, cada bloque [Nombre]: describe SOLO su acción/pose.';
  }
  logGroup('Request (single)', { chica: estado.chica, fase: estado.fase, escenaSex, soloNoSex, mensajeUsuario, dirigidas });
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
  if (!parsed) parsed = { respuesta: `*te miro* Ay ${estado.nombreUsuario}... se me fue. Decime de nuevo.`, imagen_tag: 'hablando' };
  return parsed;
}

export async function enviarMensaje(mensajeUsuario) {
  if (!estado.chica) throw new Error('Selecciona una chica primero');
  try { await ensureImagenesLoaded(); } catch (_) {}
  const enContexto = detectarPersonajesEnContexto(mensajeUsuario);
  for (const n of enContexto) { if (!estado.chicasActivas.includes(n)) estado.chicasActivas.push(n); }
  actualizarFaseSegunUsuario(mensajeUsuario);
  const soloMuestraUsuario = esSoloMuestra(mensajeUsuario);
  const escenaSex = !soloMuestraUsuario && (esEscenaSex() || PATRON_SEXO.test(mensajeUsuario));
  const soloNoSex = !escenaSex;
  const dirigidas = estado.chicasActivas.filter((c) => c !== 'Aldo' && usuarioSeDirigeA(mensajeUsuario, c));
  const targets = dirigidas.length >= 1 ? dirigidas : [estado.chica];
  const usarMultiCall = targets.length >= 2;
  logGroup('Decision', { targets, usarMultiCall, fase: estado.fase, escenaSex, soloNoSex, mensajeUsuario });
  let bloques = [];
  let textoCompleto = '';
  if (usarMultiCall) {
    const brief = armarBriefEscena(mensajeUsuario, targets);
    log('Multi-call →', targets.join(', '));
    const promesas = targets.map((c) =>
      generarRespuestaChica(c, mensajeUsuario, brief, soloNoSex, escenaSex)
        .catch((err) => {
          log('Error en call de', c, err.message);
          return { chica: c, texto: `[${c}]: *te mira* ...`, imagen_tag: 'hablando', raw: '' };
        })
    );
    const resultados = await Promise.all(promesas);
    const idxPrincipal = Math.max(0, targets.indexOf(estado.chica));
    const principal = resultados[idxPrincipal] || resultados[0];
    const secundarias = resultados.filter((_, i) => i !== idxPrincipal);
    log('Rewrite de coherencia...');
    const secundariasOk = await reescribirParaCoherencia(principal, secundarias, mensajeUsuario, brief);
    const ordenados = [principal, ...secundariasOk];
    bloques = ordenados.map((r) => ({ chica: r.chica, texto: r.texto, imagen_tag_modelo: r.imagen_tag }));
    textoCompleto = ordenados.map((r) => r.texto).join('\n\n');
  } else {
    const parsed = await enviarMensajeSingle(mensajeUsuario, soloNoSex, escenaSex, dirigidas);
    postProcesarFase(parsed.respuesta);
    textoCompleto = parsed.respuesta;
    bloques = partirBloquesMulti(parsed.respuesta, estado.chica).map((b) => ({
      ...b, imagen_tag_modelo: parsed.imagen_tag || ''
    }));
  }
  postProcesarFase(textoCompleto);
  extraerHechos(mensajeUsuario, textoCompleto);
  if (estado.fase !== FASE.INTIMO && !soloMuestraUsuario && /chup|foll|met[eo]|cog|mam[ao]|lam[ei]|lamiendo|lamer|chupame|mamame/i.test(mensajeUsuario)) {
    estado.fase = FASE.INTIMO;
  }
  for (const b of bloques) {
    if (!b.chica || estado.chicasActivas.includes(b.chica) || !existePersonaje(b.chica)) continue;
    if (enContexto.includes(b.chica) || b.chica === estado.chica) estado.chicasActivas.push(b.chica);
  }
  for (const b of bloques) {
    if (b.chica && !estado.chicasActivas.includes(b.chica)) b.chica = estado.chica;
  }
  const ahoraEscenaSex = !soloMuestraUsuario && (esEscenaSex() || PATRON_SEXO.test(mensajeUsuario) || PATRON_ORAL.test(mensajeUsuario));
  const ahoraSoloNoSex = !ahoraEscenaSex;
  const esMulti = bloques.filter((b) => b.chica && b.chica !== 'Aldo').length > 1;
  const partes = bloques.map((b) => {
    if (b.chica === 'Aldo') return { chica: 'Aldo', texto: b.texto, imagenUrl: '', audioUrl: '', descripcionImg: '', imagen_tag: '' };
    const accionSu = extractAccionParaChica(mensajeUsuario, b.chica);
    const mensajeParaTag = accionSu || (esMulti ? `${b.texto} ${mensajeUsuario}` : mensajeUsuario);
    const tagModeloParaElla = b.imagen_tag_modelo || '';
    const { elegido, razon, tagDinamico } = elegirTag(b.chica, tagModeloParaElla, b.texto, mensajeParaTag, ahoraSoloNoSex);
    let tagFinalElegido = elegido;
    if (accionSu) {
      const tagAccion = inferirTagFuerte(b.chica, b.texto, accionSu, ahoraSoloNoSex);
      const tagDyn = scoreTagDinamico(b.chica, accionSu + ' ' + b.texto, ahoraSoloNoSex);
      if (tagDyn && tagDyn !== 'hablando') tagFinalElegido = normalizarTag(b.chica, tagDyn, ahoraSoloNoSex);
      else if (tagAccion && tagAccion !== 'hablando') tagFinalElegido = normalizarTag(b.chica, tagAccion, ahoraSoloNoSex);
    } else if (esMulti) {
      const tagBloque = inferirTagFuerte(b.chica, b.texto, mensajeUsuario, ahoraSoloNoSex);
      const tagDyn = scoreTagDinamico(b.chica, b.texto + ' ' + mensajeUsuario, ahoraSoloNoSex);
      if (tagDyn && tagDyn !== 'hablando') tagFinalElegido = normalizarTag(b.chica, tagDyn, ahoraSoloNoSex);
      else if (tagBloque && tagBloque !== 'hablando') tagFinalElegido = normalizarTag(b.chica, tagBloque, ahoraSoloNoSex);
    }
    const media = resolverImagen(b.chica, tagFinalElegido, ahoraSoloNoSex);
    logGroup(`Tag → ${b.chica}`, { esMulti, accionSu: accionSu || '(ninguna)', razon, tagDinamico: tagDinamico || '-', tagElegido: tagFinalElegido, tagFinal: media.tag });
    return { chica: b.chica, texto: b.texto, imagenUrl: media.url, audioUrl: media.audio || '', descripcionImg: media.descripcion || '', imagen_tag: media.tag || tagFinalElegido };
  });
  const parteConDesc = partes.find((p) => p.descripcionImg && p.descripcionImg.trim());
  if (parteConDesc) estado.outfitActual = { chica: parteConDesc.chica, tag: parteConDesc.imagen_tag, descripcion: parteConDesc.descripcionImg.trim() };
  estado.historial.push({ role: 'user', content: mensajeUsuario });
  estado.historial.push({ role: 'assistant', content: textoCompleto });
  if (estado.historial.length > MAX_HISTORIAL * 2) estado.historial = estado.historial.slice(-MAX_HISTORIAL * 2);
  logGroup('Respuesta final', { modo: usarMultiCall ? 'MULTI-CALL + rewrite' : 'single', fase: estado.fase, partes: partes.map((p) => `${p.chica}: tag=${p.imagen_tag}`).join(' | ') });
  return { partes, texto: textoCompleto, imagen_tag: partes[0]?.imagen_tag || 'hablando', imagenUrl: partes[0]?.imagenUrl || '', audioUrl: partes[0]?.audioUrl || '', descripcionImg: partes[0]?.descripcionImg || '', fase: estado.fase, chica: estado.chica, chicasActivas: [...estado.chicasActivas] };
}

export function resetChat() {
  estado.historial = []; estado.fase = FASE.NORMAL; estado.ubicacion = null; estado.hechos = [];
  estado.chicasActivas = estado.chica ? [estado.chica] : []; estado.modo = 'libre'; estado.historiaId = null; estado.outfitActual = null;
  log('Chat reseteado');
}
export function volverAlSelector() {
  estado.chica = null; estado.chicasActivas = []; estado.historial = []; estado.fase = FASE.NORMAL;
  estado.ubicacion = null; estado.hechos = []; estado.modo = 'libre'; estado.historiaId = null; estado.outfitActual = null;
  log('Volvió al selector');
}
export { getChicasDisponibles, getImagenSelector, getDescripcionChica, listarTags };
