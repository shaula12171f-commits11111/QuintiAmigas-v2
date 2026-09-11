// ============================================================
//  Motor principal - QuintiAmigas v2
// ============================================================

import { armarSystemPrompt, PROMPTS_REINTENTO } from './systemPrompt.js';
import { getPersonalidad, getChicasDisponibles, existeChica } from '../characters/personalidades.js';
import { resolverImagen, getImagenSelector, getDescripcionChica } from '../systems/imagenes.js';
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

const MAX_HISTORIAL = 16;
const PATRON_LUGAR_PRIVADO = /\b(hotel|motel|habitaci[oó]n|casa|departamento|depto|pieza|cuarto|mi casa|tu casa|a solas|lugar m[aá]s privado)\b/i;
const PATRON_CONFIRMACION = /\b(s[ií]|claro|vamos|dale|quiero|contin[uú]a|continuar|foll|chup|besame|t[oó]came|hazlo|hacelo|por favor|ya)\b/i;
const PATRON_NEGACION = /\b(no|para|espera|despacio|mejor no|ahora no)\b/i;

export function getEstado() { return { ...estado }; }

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
  const lineas = [`Fase de escena: ${estado.fase}`, 'RECUERDA: el usuario es HOMBRE (tiene pija, NO coño).'];
  if (estado.ubicacion) lineas.push(`Ubicación: ${estado.ubicacion}`);
  if (estado.fase === FASE.TRASLADO || estado.fase === FASE.LLEGADA) {
    lineas.push('INSTRUCCIÓN: Aún NO sexo explícito. Llegada + pedir confirmación.');
  }
  if (estado.fase === FASE.INTIMO) lineas.push('INSTRUCCIÓN: Escena íntima activa. Sé explícita y sucia.');
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: MODELO || 'llama-3.3-70b-versatile',
          messages,
          temperature: 0.9,
          max_tokens: 1200
        })
      });
      if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      estado.keyIndex = (estado.keyIndex + i) % GROQ_KEYS.length;
      return data.choices?.[0]?.message?.content || '';
    } catch (e) { ultimoError = e; }
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

export async function enviarMensaje(mensajeUsuario) {
  if (!estado.chica) throw new Error('Selecciona una chica primero');
  actualizarFaseSegunUsuario(mensajeUsuario);

  const personalidad = getPersonalidad(estado.chica);
  const system = armarSystemPrompt(personalidad, estado.nombreUsuario, construirContexto());
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
        { role: 'user', content: 'Corrige y responde SOLO con el JSON pedido. Usuario = HOMBRE.' }
      ]);
      parsed = parseJsonRespuesta(raw);
      if (parsed) break;
    }
  }

  if (!parsed) {
    parsed = {
      respuesta: `*te miro y sonrío de lado* Oye ${estado.nombreUsuario}... se me trabó un segundo. Repíteme eso.`,
      imagen_tag: 'hablando'
    };
  }

  postProcesarFase(parsed.respuesta);
  extraerHechos(mensajeUsuario, parsed.respuesta);

  estado.historial.push({ role: 'user', content: mensajeUsuario });
  estado.historial.push({ role: 'assistant', content: parsed.respuesta });
  if (estado.historial.length > MAX_HISTORIAL * 2) {
    estado.historial = estado.historial.slice(-MAX_HISTORIAL * 2);
  }

  const media = resolverImagen(estado.chica, parsed.imagen_tag || 'hablando');

  return {
    texto: parsed.respuesta,
    imagen_tag: parsed.imagen_tag || 'hablando',
    imagenUrl: media.url,
    audioUrl: media.audio || '',
    descripcionImg: media.descripcion || '',
    fase: estado.fase,
    chica: estado.chica
  };
}

export function resetChat() {
  estado.historial = [];
  estado.fase = FASE.NORMAL;
  estado.ubicacion = null;
  estado.hechos = [];
}

export { getChicasDisponibles, getImagenSelector, getDescripcionChica };
