// ============================================================
//  Motor principal - QuintiAmigas v2
// ============================================================

import { armarSystemPrompt, PROMPTS_REINTENTO } from './systemPrompt.js';
import {
  getPersonalidad,
  getChicasDisponibles,
  existeChica,
  existePersonaje,
  getTodosPersonajes
} from '../characters/personalidades.js';
import {
  resolverImagen,
  getImagenSelector,
  getDescripcionChica,
  listarTags,
  listarTagsNoSex,
  normalizarTag,
  esTagSex,
  ensureImagenesLoaded
} from '../systems/imagenes.js';
import { getHistoria, rellenarNombre } from '../stories/historias.js';
import { getLore } from '../world/lore.js';
import { GROQ_KEYS, MODELO, NOMBRE_USUARIO_DEFAULT } from '../../config.js';

export const FASE = {
  NORMAL: 'normal',
  TRASLADO: 'traslado',
  LLEGADA: 'llegada',
  INTIMO: 'intimo'
};

const TODAS_CHICAS = ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia'];
const TODOS = [...TODAS_CHICAS, 'Aldo'];

let estado = {
  fase: FASE.NORMAL,
  ubicacion: null,
  chica: null, // chica principal del chat
  chicasActivas: [], // pueden hablar en el mismo hilo (incluye Aldo si entra)
  historial: [],
  nombreUsuario: NOMBRE_USUARIO_DEFAULT || 'Fabrizio',
  hechos: [],
  keyIndex: 0,
  modo: 'libre', // libre | historia
  historiaId: null
};

const MAX_HISTORIAL = 20;
const PATRON_LUGAR_PRIVADO = /\b(hotel|motel|habitaci[oó]n|casa|departamento|depto|pieza|cuarto|mi casa|tu casa|a solas|lugar m[aá]s privado)\b/i;
const PATRON_CONFIRMACION = /\b(s[ií]|claro|vamos|dale|quiero|contin[uú]a|continuar|foll|chup|besame|t[oó]came|hazlo|hacelo|por favor|ya)\b/i;
const PATRON_NEGACION = /\b(no|para|espera|despacio|mejor no|ahora no)\b/i;
const PATRON_SEXO = /\b(foll|chup|mamad|pija|verga|pene|coño|concha|culo|anal|corr|semen|tetas?|pez[oó]n|dedo|69|doggy|misioner|cowgirl|handjob|paja|desnud|beso.*sucio|te la meto|métela)\b/i;

export function getEstado() {
  return { ...estado, chicasActivas: [...estado.chicasActivas] };
}

export function setNombreUsuario(nombre) {
  if (nombre && nombre.trim()) estado.nombreUsuario = nombre.trim();
}

export function getNombreUsuario() {
  return estado.nombreUsuario;
}

/** Inicia chat libre con una chica (sin mensaje de bienvenida del bot) */
export function iniciarChatLibre(chica) {
  if (!existeChica(chica)) throw new Error('Chica no existe');
  estado.chica = chica;
  estado.chicasActivas = [chica];
  estado.fase = FASE.NORMAL;
  estado.ubicacion = null;
  estado.historial = [];
  estado.hechos = [];
  estado.modo = 'libre';
  estado.historiaId = null;
}

/** Inicia historia: devuelve el mensaje de bienvenida ya con el nombre */
export function iniciarHistoria(chica, historiaId) {
  if (!existeChica(chica)) throw new Error('Chica no existe');
  const h = getHistoria(chica, historiaId);
  if (!h) throw new Error('Historia no existe');
  estado.chica = chica;
  estado.chicasActivas = [chica];
  estado.fase = FASE.NORMAL;
  estado.ubicacion = null;
  estado.historial = [];
  estado.hechos = [];
  estado.modo = 'historia';
  estado.historiaId = historiaId;

  const texto = rellenarNombre(h.mensajeBienvenida, estado.nombreUsuario);
  estado.historial.push({ role: 'assistant', content: texto, chica });

  // si el mensaje suena íntimo, subir fase
  if (/chup|pija|foll|coño|mamad|sábanas|boxers/i.test(texto)) {
    estado.fase = FASE.INTIMO;
  }

  const soloNoSex = !esEscenaSex();
  const media = resolverImagen(chica, inferirTagDesdeTexto(chica, texto, 'hablando'), soloNoSex);
  return {
    texto,
    chica,
    imagenUrl: media.url,
    audioUrl: media.audio || '',
    descripcionImg: media.descripcion || '',
    imagen_tag: media.tag || 'hablando',
    fase: estado.fase
  };
}

export function setChica(nombre) {
  iniciarChatLibre(nombre);
}

function esEscenaSex() {
  if (estado.fase === FASE.INTIMO) return true;
  // mirar últimos mensajes
  const ultimos = estado.historial.slice(-4).map((h) => h.content || '').join(' ');
  return PATRON_SEXO.test(ultimos);
}

/**
 * Detecta quién debería poder hablar:
 * - Mención explícita
 * - Contexto de escena (hermanas, casa, grupo, fútbol, juegos, etc.)
 * - Ya estaban activos
 */
function detectarPersonajesEnContexto(textoUsuario) {
  const t = (textoUsuario || '').toLowerCase();
  const found = new Set(estado.chicasActivas);

  // Menciones directas
  for (const n of TODOS) {
    if (t.includes(n.toLowerCase())) found.add(n);
  }
  // Apodos / referencias
  if (/la mayor|ichi\b/.test(t)) found.add('Ichika');
  if (/tsundere|la de los lazos/.test(t)) found.add('Nino');
  if (/mech[oó]n|la callada/.test(t)) found.add('Miku');
  if (/la del lazo|energ[eé]tica/.test(t)) found.add('Yotsuba');
  if (/la seria|horquillas/.test(t)) found.add('Itsuki');
  if (/semielfa|platead/.test(t)) found.add('Emilia');
  if (/\baldo\b|mi amigo|el pibe|el de f[uú]tbol|mejor amigo/.test(t)) found.add('Aldo');

  // Contexto de escena grupal → hermanas pueden sumarse
  const contextoHermanas =
    /hermanas?|las cinco|todas|en casa|en el living|en la cocina|en el depto|fiesta en casa|nos juntamos|vienen las|están las/i.test(
      t
    );
  if (contextoHermanas) {
    for (const n of TODAS_CHICAS) found.add(n);
  }

  // Contexto Aldo (fútbol / juegos / quedar)
  const contextoAldo =
    /f[uú]tbol|partido|jugar|ranked|consola|play|xbox|steam|fifa|amigo|salimos|quedamos|birra|asado/i.test(t);
  if (contextoAldo) found.add('Aldo');

  // Si ya había varias activas, mantenerlas (no sacar a nadie salvo reset)
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
}

function construirContexto() {
  const lineas = [
    `Fase: ${estado.fase}`,
    'Usuario = HOMBRE (pija). Las chicas = MUJERES. Aldo = HOMBRE (amigo).',
    'Escribí natural y viva, no robótica.',
    `Chica principal del chat: ${estado.chica}`,
    `Personajes presentes en la escena: ${estado.chicasActivas.join(', ')}`
  ];
  if (estado.chicasActivas.length > 1) {
    lineas.push(
      'MULTI: Hay varios personajes. Cada uno puede hablar en bloques [Nombre]: texto. Deben reaccionar entre ellos y a lo último que se dijo. No ignoren lo que dijo el otro. Insertá a alguien SOLO si está en contexto o ya presente; no fuerces apariciones.'
    );
  }
  if (estado.ubicacion) lineas.push(`Ubicación: ${estado.ubicacion}`);
  if (estado.fase === FASE.TRASLADO || estado.fase === FASE.LLEGADA) {
    lineas.push('Aún NO sexo explícito: llegada + pedir confirmación.');
  }
  if (estado.fase === FASE.INTIMO) {
    lineas.push('Escena íntima activa: sé explícita, sucia y en el momento.');
  } else {
    lineas.push('Escena SIN sexo explícito ahora: usá imagen_tag no-sex (hablando, ropa_*, etc.).');
  }
  if (estado.hechos.length) lineas.push('Hechos: ' + estado.hechos.slice(-8).join(' | '));
  return lineas.join('\n');
}

function extraerHechos(mensajeUsuario, respuestaBot) {
  const texto = `${mensajeUsuario} ${respuestaBot}`.toLowerCase();
  if (/novia|novio|pareja/.test(texto)) estado.hechos.push('Relación romántica');
  if (/te amo|te quiero/.test(texto)) estado.hechos.push('Declaración afectiva');
  if (estado.ubicacion) estado.hechos.push(`En ${estado.ubicacion}`);
  if (/aldo/.test(texto)) estado.hechos.push('Aldo en escena');
  estado.hechos = [...new Set(estado.hechos)].slice(-12);
}

async function llamarGroq(messages) {
  if (!GROQ_KEYS || !GROQ_KEYS.length) {
    throw new Error('Configura tus API keys en config.js');
  }
  let ultimoError = null;
  for (let i = 0; i < GROQ_KEYS.length; i++) {
    const key = GROQ_KEYS[(estado.keyIndex + i) % GROQ_KEYS.length];
    if (!key || key.includes('TU_KEY')) continue;
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model: MODELO || 'llama-3.3-70b-versatile',
          messages,
          temperature: 1.05,
          top_p: 0.95,
          max_tokens: 1600
        })
      });
      if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      estado.keyIndex = (estado.keyIndex + i) % GROQ_KEYS.length;
      return data.choices?.[0]?.message?.content || '';
    } catch (e) {
      ultimoError = e;
    }
  }
  throw ultimoError || new Error('Falló la API / sin keys válidas');
}

function parseJsonRespuesta(raw) {
  if (!raw) return null;
  let t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(t.slice(start, end + 1));
    if (obj && typeof obj.respuesta === 'string') return obj;
  } catch (_) {}
  return null;
}

function postProcesarFase(respuestaTexto) {
  if (estado.fase === FASE.TRASLADO) {
    if (/ya estamos|llegamos|habitaci[oó]n|cierro la puerta|a solas/i.test(respuestaTexto)) {
      estado.fase = FASE.LLEGADA;
    }
  }
}

function inferirTagDesdeTexto(chica, texto, tagActual) {
  const tags = listarTags(chica);
  if (!tags.length) return tagActual || 'hablando';
  const t = (texto || '').toLowerCase();
  const candidatos = [
    [/chup|mam[ao]|en (tu|la) boca|deepthroat|garganta/, 'chupando'],
    [/doggy|a cuatro|por detr[aá]s|desde atr[aá]s/, 'doggystyle'],
    [/misioner/, 'misionero'],
    [/anal|por el culo|en el ano/, 'anal'],
    [/cowgirl|me monto|encima (tuyo|de ti)/, 'cowgirl'],
    [/beso|besarte|te beso/, 'besando'],
    [/desnud|sin ropa|me saco/, 'desnuda'],
    [/teta|pecho|pez[oó]n/, 'teta'],
    [/dedo|me toco|dentro de mi concha/, 'dedo'],
    [/paja|con la mano|te la jalo/, 'handjob'],
    [/nalg|cachetada en el culo/, 'nalg'],
    [/de pie|contra la pared|ventana/, 'stand'],
    [/69/, '69'],
    [/me corro|te corres|semen|leche/, 'corro'],
    [/ropa|vestido|idol|bikini/, 'ropa']
  ];
  for (const [rx, clave] of candidatos) {
    if (rx.test(t)) {
      const hit = tags.find((k) => k.toLowerCase().includes(clave) || new RegExp(clave, 'i').test(k));
      if (hit) return hit;
    }
  }
  return normalizarTag(chica, tagActual || 'hablando');
}

/** Parte respuestas multi [Nombre]: ... (incluye Aldo) */
function partirBloquesMulti(texto, chicaDefault) {
  const re = /\[\s*(Ichika|Nino|Miku|Yotsuba|Itsuki|Emilia|Aldo)\s*\]\s*:/gi;
  const indices = [];
  let m;
  while ((m = re.exec(texto)) !== null) {
    const rawName = m[1];
    const fixed = TODOS.find((x) => x.toLowerCase() === rawName.toLowerCase()) || rawName;
    indices.push({ nombre: fixed, index: m.index, len: m[0].length });
  }

  if (!indices.length) {
    return [{ chica: chicaDefault, texto: texto.trim() }];
  }

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

export async function enviarMensaje(mensajeUsuario) {
  if (!estado.chica) throw new Error('Selecciona una chica primero');

  try {
    await ensureImagenesLoaded();
  } catch (_) {}

  // Actualizar quién puede hablar según contexto (no solo mención)
  const enContexto = detectarPersonajesEnContexto(mensajeUsuario);
  for (const n of enContexto) {
    if (!estado.chicasActivas.includes(n)) estado.chicasActivas.push(n);
  }

  actualizarFaseSegunUsuario(mensajeUsuario);

  const soloNoSex = !esEscenaSex();
  const tags = soloNoSex ? listarTagsNoSex(estado.chica) : listarTags(estado.chica);
  const personalidad = getPersonalidad(estado.chica, estado.nombreUsuario);
  let system = armarSystemPrompt(
    personalidad,
    estado.nombreUsuario,
    construirContexto(),
    tags,
    getLore(estado.nombreUsuario)
  );

  if (estado.chicasActivas.length > 1) {
    const extras = estado.chicasActivas
      .filter((c) => c !== estado.chica)
      .map((c) => `### ${c}\n${getPersonalidad(c, estado.nombreUsuario)}`)
      .join('\n\n');
    system += `\n\nOTROS PERSONAJES PRESENTES (pueden hablar en bloques [Nombre]: ):\n${extras}\n\nSi hablan varios, usá el formato:\n[Ichika]: ...\n[Nino]: ...\n[Aldo]: ...\nCada uno reacciona al otro y al usuario. imagen_tag es de la chica PRINCIPAL (${estado.chica}); las otras pueden describir acciones. Aldo solo habla si está en contexto.`;
  }

  const messages = [
    { role: 'system', content: system },
    ...estado.historial.slice(-MAX_HISTORIAL).map((h) => ({
      role: h.role,
      content: h.content
    })),
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
        {
          role: 'user',
          content:
            'Corrige y responde SOLO el JSON. Usuario=HOMBRE. imagen_tag de la lista. Hablá natural.'
        }
      ]);
      parsed = parseJsonRespuesta(raw);
      if (parsed) break;
    }
  }

  if (!parsed) {
    parsed = {
      respuesta: `*te miro y suelto una risita* Ay ${estado.nombreUsuario}... se me fue. Decime de nuevo.`,
      imagen_tag: 'hablando'
    };
  }

  postProcesarFase(parsed.respuesta);
  extraerHechos(mensajeUsuario, parsed.respuesta);

  // Actualizar fase si la respuesta metió sexo
  if (estado.fase !== FASE.INTIMO && PATRON_SEXO.test(parsed.respuesta)) {
    // no forzar INTIMO solo por palabras; solo si ya estábamos cerca
    if (estado.fase === FASE.LLEGADA) estado.fase = FASE.INTIMO;
  }

  const bloques = partirBloquesMulti(parsed.respuesta, estado.chica);

  // Añadir a activas a cualquiera que habló en la respuesta
  for (const b of bloques) {
    if (b.chica && !estado.chicasActivas.includes(b.chica) && existePersonaje(b.chica)) {
      estado.chicasActivas.push(b.chica);
    }
  }

  const ahoraSoloNoSex = !esEscenaSex();

  // enriquecer cada bloque con media (Aldo no tiene pack de imágenes → sin imagen o fallback)
  const partes = bloques.map((b) => {
    if (b.chica === 'Aldo') {
      return {
        chica: 'Aldo',
        texto: b.texto,
        imagenUrl: '',
        audioUrl: '',
        descripcionImg: '',
        imagen_tag: ''
      };
    }
    let tag = normalizarTag(b.chica, parsed.imagen_tag || 'hablando', ahoraSoloNoSex);
    if (b.chica !== estado.chica || tag === 'hablando') {
      tag = inferirTagDesdeTexto(b.chica, b.texto + ' ' + mensajeUsuario, tag);
      tag = normalizarTag(b.chica, tag, ahoraSoloNoSex);
    }
    const media = resolverImagen(b.chica, tag, ahoraSoloNoSex);
    return {
      chica: b.chica,
      texto: b.texto,
      imagenUrl: media.url,
      audioUrl: media.audio || '',
      descripcionImg: media.descripcion || '',
      imagen_tag: media.tag || tag
    };
  });

  estado.historial.push({ role: 'user', content: mensajeUsuario });
  estado.historial.push({ role: 'assistant', content: parsed.respuesta });
  if (estado.historial.length > MAX_HISTORIAL * 2) {
    estado.historial = estado.historial.slice(-MAX_HISTORIAL * 2);
  }

  return {
    partes,
    // compat
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
  estado.historial = [];
  estado.fase = FASE.NORMAL;
  estado.ubicacion = null;
  estado.hechos = [];
  estado.chicasActivas = estado.chica ? [estado.chica] : [];
  estado.modo = 'libre';
  estado.historiaId = null;
}

export function volverAlSelector() {
  estado.chica = null;
  estado.chicasActivas = [];
  estado.historial = [];
  estado.fase = FASE.NORMAL;
  estado.ubicacion = null;
  estado.hechos = [];
  estado.modo = 'libre';
  estado.historiaId = null;
}

export { getChicasDisponibles, getImagenSelector, getDescripcionChica, listarTags };
