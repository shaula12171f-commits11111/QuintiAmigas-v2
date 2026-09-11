// ============================================================
//  Motor principal - QuintiAmigas v2
// ============================================================

import { armarSystemPrompt, PROMPTS_REINTENTO } from './systemPrompt.js';
import { getPersonalidad, getChicasDisponibles, existeChica } from '../characters/personalidades.js';
import {
  resolverImagen,
  getImagenSelector,
  getDescripcionChica,
  listarTags,
  normalizarTag,
  ensureImagenesLoaded
} from '../systems/imagenes.js';
import { GROQ_KEYS, MODELO, NOMBRE_USUARIO_DEFAULT } from '../../config.js';

export const FASE = {
  NORMAL: 'normal',
  TRASLADO: 'traslado',
  LLEGADA: 'llegada',
  INTIMO: 'intimo'
};

let estado = {
  fase: FASE.NORMAL,
  ubicacion: null,
  chica: null,
  historial: [],
  nombreUsuario: NOMBRE_USUARIO_DEFAULT || 'Fabrizio',
  hechos: [],
  keyIndex: 0
};

const MAX_HISTORIAL = 18;
const PATRON_LUGAR_PRIVADO = /\b(hotel|motel|habitaci[oó]n|casa|departamento|depto|pieza|cuarto|mi casa|tu casa|a solas|lugar m[aá]s privado)\b/i;
const PATRON_CONFIRMACION = /\b(s[ií]|claro|vamos|dale|quiero|contin[uú]a|continuar|foll|chup|besame|t[oó]came|hazlo|hacelo|por favor|ya)\b/i;
const PATRON_NEGACION = /\b(no|para|espera|despacio|mejor no|ahora no)\b/i;

export function getEstado() {
  return { ...estado };
}

export function setChica(nombre) {
  if (!existeChica(nombre)) throw new Error('Chica no existe');
  estado.chica = nombre;
  estado.fase = FASE.NORMAL;
  estado.ubicacion = null;
  estado.historial = [];
  estado.hechos = [];
}

export function setNombreUsuario(nombre) {
  if (nombre && nombre.trim()) estado.nombreUsuario = nombre.trim();
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
    'Usuario = HOMBRE (pija). Tú = MUJER.',
    'Escribí natural y viva, no robótica.'
  ];
  if (estado.ubicacion) lineas.push(`Ubicación: ${estado.ubicacion}`);
  if (estado.fase === FASE.TRASLADO || estado.fase === FASE.LLEGADA) {
    lineas.push('Aún NO sexo explícito: llegada + pedir confirmación.');
  }
  if (estado.fase === FASE.INTIMO) {
    lineas.push('Escena íntima activa: sé explícita, sucia y en el momento.');
  }
  if (estado.hechos.length) lineas.push('Hechos: ' + estado.hechos.slice(-8).join(' | '));
  return lineas.join('\n');
}

function extraerHechos(mensajeUsuario, respuestaBot) {
  const texto = `${mensajeUsuario} ${respuestaBot}`.toLowerCase();
  if (/novia|novio|pareja/.test(texto)) estado.hechos.push('Relación romántica');
  if (/te amo|te quiero/.test(texto)) estado.hechos.push('Declaración afectiva');
  if (estado.ubicacion) estado.hechos.push(`En ${estado.ubicacion}`);
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
          max_tokens: 1400
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

/** Si el tag sigue siendo genérico, intenta deducirlo del texto de la respuesta */
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
    [/me corro|te corres|semen|leche/, 'corro']
  ];
  for (const [rx, clave] of candidatos) {
    if (rx.test(t)) {
      const hit = tags.find((k) => k.toLowerCase().includes(clave) || new RegExp(clave, 'i').test(k));
      if (hit) return hit;
    }
  }
  return normalizarTag(chica, tagActual || 'hablando');
}

export async function enviarMensaje(mensajeUsuario) {
  if (!estado.chica) throw new Error('Selecciona una chica primero');

  try {
    await ensureImagenesLoaded();
  } catch (_) {
    /* sigue con lo que haya */
  }

  actualizarFaseSegunUsuario(mensajeUsuario);

  const tags = listarTags(estado.chica);
  const personalidad = getPersonalidad(estado.chica);
  const system = armarSystemPrompt(
    personalidad,
    estado.nombreUsuario,
    construirContexto(),
    tags
  );

  const messages = [
    { role: 'system', content: system },
    ...estado.historial.slice(-MAX_HISTORIAL),
    { role: 'user', content: mensajeUsuario }
  ];

  let raw = await llamarGroq(messages);
  let parsed = parseJsonRespuesta(raw);

  if (!parsed) {
    for (const extra of PROMPTS_REINTENTO) {
      raw = await llamarGroq([
        { role: 'system', content: system + '\n\n' + extra },
        ...estado.historial.slice(-8),
        { role: 'user', content: mensajeUsuario },
        { role: 'assistant', content: raw || '' },
        {
          role: 'user',
          content:
            'Corrige y responde SOLO el JSON. Usuario=HOMBRE. imagen_tag de la lista de tags válidos. Hablá natural.'
        }
      ]);
      parsed = parseJsonRespuesta(raw);
      if (parsed) break;
    }
  }

  if (!parsed) {
    parsed = {
      respuesta: `*te miro y suelto una risita* Ay ${estado.nombreUsuario}... se me fue. Decime de nuevo, que quiero contestarte bien.`,
      imagen_tag: 'hablando'
    };
  }

  postProcesarFase(parsed.respuesta);
  extraerHechos(mensajeUsuario, parsed.respuesta);

  let tag = normalizarTag(estado.chica, parsed.imagen_tag || 'hablando');
  // si el modelo se quedó en hablando pero el texto describe acción, inferir
  if (tag === 'hablando' || !parsed.imagen_tag) {
    tag = inferirTagDesdeTexto(estado.chica, parsed.respuesta + ' ' + mensajeUsuario, tag);
  }

  estado.historial.push({ role: 'user', content: mensajeUsuario });
  estado.historial.push({ role: 'assistant', content: parsed.respuesta });
  if (estado.historial.length > MAX_HISTORIAL * 2) {
    estado.historial = estado.historial.slice(-MAX_HISTORIAL * 2);
  }

  const media = resolverImagen(estado.chica, tag);

  return {
    texto: parsed.respuesta,
    imagen_tag: media.tag || tag,
    imagenUrl: media.url,
    audioUrl: media.audio || '',
    descripcionImg: media.descripcion || '',
    fase: estado.fase,
    chica: estado.chica,
    tagsDisponibles: tags.length
  };
}

export function resetChat() {
  estado.historial = [];
  estado.fase = FASE.NORMAL;
  estado.ubicacion = null;
  estado.hechos = [];
}

export { getChicasDisponibles, getImagenSelector, getDescripcionChica, listarTags };
