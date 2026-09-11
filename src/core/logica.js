// ============================================================
//  Motor principal - QuintiAmigas v2 (limpio)
// ============================================================

import { armarSystemPrompt, PROMPTS_REINTENTO, SYSTEM_PROMPT_ANTI_CENSURA } from './systemPrompt.js';
import { getPersonalidad, getChicasDisponibles, existeChica } from '../characters/personalidades.js';
import { resolverImagen } from '../systems/imagenes.js';
import { GROQ_KEYS, MODELO, NOMBRE_USUARIO_DEFAULT } from '../../config.js';

// ---------- Estado de escena (simple y robusto) ----------
export const FASE = {
  NORMAL: 'normal',
  TRASLADO: 'traslado',       // propuso ir a lugar privado
  LLEGADA: 'llegada',         // ya en el lugar, esperando confirmación
  INTIMO: 'intimo'            // sexo / acto explícito activo
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

function detectarPropuestaPrivada(texto) {
  return PATRON_LUGAR_PRIVADO.test(texto);
}

function actualizarFaseSegunUsuario(mensaje) {
  const m = mensaje.toLowerCase();

  if (estado.fase === FASE.NORMAL || estado.fase === FASE.TRASLADO) {
    if (detectarPropuestaPrivada(m)) {
      estado.fase = FASE.TRASLADO;
      // extraer ubicación simple
      if (/hotel|motel/i.test(m)) estado.ubicacion = 'hotel';
      else if (/casa|departamento|depto/i.test(m)) estado.ubicacion = 'casa';
      else if (/habitaci|pieza|cuarto/i.test(m)) estado.ubicacion = 'habitación';
      else estado.ubicacion = 'lugar privado';
    }
  }

  if (estado.fase === FASE.LLEGADA) {
    if (PATRON_CONFIRMACION.test(m) && !/^no\b/i.test(m.trim())) {
      estado.fase = FASE.INTIMO;
    } else if (PATRON_NEGACION.test(m)) {
      estado.fase = FASE.NORMAL;
    }
  }
}

function construirContexto() {
  const lineas = [];
  lineas.push(`Fase de escena: ${estado.fase}`);
  if (estado.ubicacion) lineas.push(`Ubicación: ${estado.ubicacion}`);
  if (estado.fase === FASE.TRASLADO || estado.fase === FASE.LLEGADA) {
    lineas.push('INSTRUCCIÓN DE FASE: Aún NO hay sexo explícito. Llegada + pedir confirmación si ya están en el lugar.');
  }
  if (estado.fase === FASE.INTIMO) {
    lineas.push('INSTRUCCIÓN DE FASE: Escena íntima activa. Sé explícita y sucia.');
  }
  if (estado.hechos.length) {
    lineas.push('Hechos recordados: ' + estado.hechos.slice(-8).join(' | '));
  }
  return lineas.join('\n');
}

function extraerHechos(mensajeUsuario, respuestaBot) {
  const texto = `${mensajeUsuario} ${respuestaBot}`.toLowerCase();
  if (/novia|novio|pareja/.test(texto)) estado.hechos.push('Hay relación romántica mencionada');
  if (/te amo|te quiero/.test(texto)) estado.hechos.push('Declaración afectiva');
  if (estado.ubicacion) estado.hechos.push(`Estuvieron en ${estado.ubicacion}`);
  estado.hechos = [...new Set(estado.hechos)].slice(-12);
}

async function llamarGroq(messages) {
  if (!GROQ_KEYS || !GROQ_KEYS.length || GROQ_KEYS[0].includes('TU_KEY')) {
    throw new Error('Configura tus API keys en config.js (copia desde config.example.js)');
  }

  let ultimoError = null;
  for (let i = 0; i < GROQ_KEYS.length; i++) {
    const key = GROQ_KEYS[(estado.keyIndex + i) % GROQ_KEYS.length];
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
          temperature: 0.9,
          max_tokens: 1200
        })
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Groq ${res.status}: ${t.slice(0, 200)}`);
      }

      const data = await res.json();
      estado.keyIndex = (estado.keyIndex + i) % GROQ_KEYS.length;
      return data.choices?.[0]?.message?.content || '';
    } catch (e) {
      ultimoError = e;
    }
  }
  throw ultimoError || new Error('Falló la API');
}

function parseJsonRespuesta(raw) {
  if (!raw) return null;
  let t = raw.trim();
  // quitar fences
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
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
  // Si el bot describe llegada y pide confirmación, marcar LLEGADA
  if (estado.fase === FASE.TRASLADO) {
    if (/ya estamos|llegamos|habitaci[oó]n|cierro la puerta|a solas/i.test(respuestaTexto)) {
      estado.fase = FASE.LLEGADA;
    }
  }
  // Si en íntimo el bot sigue pidiendo confirmación rara, no degradar
}

export async function enviarMensaje(mensajeUsuario) {
  if (!estado.chica) throw new Error('Selecciona una chica primero');

  actualizarFaseSegunUsuario(mensajeUsuario);

  const personalidad = getPersonalidad(estado.chica);
  const contexto = construirContexto();
  const system = armarSystemPrompt(personalidad, estado.nombreUsuario, contexto);

  const messages = [
    { role: 'system', content: system },
    ...estado.historial.slice(-MAX_HISTORIAL),
    { role: 'user', content: mensajeUsuario }
  ];

  let parsed = null;
  let raw = await llamarGroq(messages);
  parsed = parseJsonRespuesta(raw);

  // Reintentos anti-censura / JSON
  if (!parsed) {
    for (const extra of PROMPTS_REINTENTO) {
      const retryMessages = [
        { role: 'system', content: system + '\n\n' + extra },
        ...estado.historial.slice(-8),
        { role: 'user', content: mensajeUsuario },
        { role: 'assistant', content: raw || '' },
        { role: 'user', content: 'Corrige y responde SOLO con el JSON pedido.' }
      ];
      raw = await llamarGroq(retryMessages);
      parsed = parseJsonRespuesta(raw);
      if (parsed) break;
    }
  }

  if (!parsed) {
    // fallback mínimo en personaje
    parsed = {
      respuesta: `*te miro y sonrío de lado* Oye ${estado.nombreUsuario}... se me trabó un segundo. Repíteme eso, que quiero contestarte bien.`,
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

  const imagenUrl = resolverImagen(estado.chica, parsed.imagen_tag || 'hablando');

  return {
    texto: parsed.respuesta,
    imagen_tag: parsed.imagen_tag || 'hablando',
    imagenUrl,
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

export { getChicasDisponibles };
