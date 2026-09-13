// ============================================================
//  LUGARES — QuintiAmigas v2
//  Lista de lugares + URL de fondo (escenario)
//  Cuando lugarActual cambia, se actualiza el background.
// ============================================================

/**
 * Cada lugar tiene:
 *  - id: clave interna
 *  - nombre: texto legible
 *  - fondo: URL directa de la imagen de fondo (poné la tuya)
 *  - keywords: para detección en mensajes
 */
export const LUGARES = {
  casa: {
    id: 'casa',
    nombre: 'Casa',
    fondo: '', // ← poné tu link de imagen aquí
    keywords: ['casa', 'hogar', 'departamento', 'depto', 'living', 'cocina', 'mi casa', 'tu casa']
  },
  cafe: {
    id: 'cafe',
    nombre: 'Café',
    fondo: '', // ← poné tu link de imagen aquí
    keywords: ['cafe', 'café', 'cafeteria', 'cafetería', 'bar']
  },
  parque: {
    id: 'parque',
    nombre: 'Parque',
    fondo: '', // ← poné tu link de imagen aquí
    keywords: ['parque', 'plaza', 'jardin', 'jardín', 'aire libre']
  },
  playa: {
    id: 'playa',
    nombre: 'Playa',
    fondo: '', // ← poné tu link de imagen aquí
    keywords: ['playa', 'mar', 'arena', 'costa']
  },
  hotel: {
    id: 'hotel',
    nombre: 'Hotel',
    fondo: '', // ← poné tu link de imagen aquí
    keywords: ['hotel', 'motel', 'habitacion', 'habitación', 'suite']
  },
  escuela: {
    id: 'escuela',
    nombre: 'Escuela / Universidad',
    fondo: '',
    keywords: ['escuela', 'universidad', 'colegio', 'aula', 'campus']
  },
  calle: {
    id: 'calle',
    nombre: 'Calle',
    fondo: '',
    keywords: ['calle', 'afuera', 'camino', 'vereda']
  },
  'lugar privado': {
    id: 'lugar privado',
    nombre: 'Lugar privado',
    fondo: '',
    keywords: ['lugar privado', 'a solas', 'privado']
  }
};

export function listarLugares() {
  return Object.keys(LUGARES);
}

export function getLugar(id) {
  if (!id) return null;
  const key = String(id).toLowerCase().trim();
  return LUGARES[key] || null;
}

export function getFondoLugar(id) {
  const l = getLugar(id);
  return l?.fondo || '';
}

/** Detecta un lugar mencionado en el texto del usuario */
export function detectarLugarEnTexto(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  for (const [id, data] of Object.entries(LUGARES)) {
    for (const kw of data.keywords) {
      const k = kw.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      if (t.includes(k)) return id;
    }
  }
  return null;
}

/**
 * Detecta si el mensaje es SUGERENCIA o ORDEN de cambio de lugar.
 * Sugerencia: "vamos al café?", "qué te parece ir al parque?"
 * Orden: "vamos al café ya", "llévanos al hotel", "quiero ir al parque"
 */
export function clasificarIntencionLugar(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const lugar = detectarLugarEnTexto(t);
  if (!lugar) return { tipo: null, lugar: null };

  // Indicadores de sugerencia (pregunta / tentativo)
  const esSugerencia =
    /\?\s*$/.test(t.trim()) ||
    /\b(que te parece|qué te parece|te gustaria|te gustaría|podemos|podriamos|podríamos|si queres|si querés|tal vez|quizas|quizás|o vamos)\b/.test(t) ||
    /\bvamos (al|a la|a)\b.*\?/.test(t);

  // Indicadores de orden / aceptación firme
  const esOrden =
    /\b(vamos (ya|ahora)|llevalo|llevame|llévanos|quiero ir|vamos al|vamos a la|nos vamos|ya mismo|ahora mismo)\b/.test(t) ||
    /\b(dale|si|sí|claro|ok|okay)\b.*\b(vamos|cafe|parque|playa|hotel|casa)\b/.test(t);

  if (esSugerencia && !esOrden) {
    return { tipo: 'sugerencia', lugar };
  }
  if (esOrden || (!esSugerencia && lugar)) {
    // Si menciona lugar sin ser claramente sugerencia, tratamos como orden suave
    // (el sistema de fase ya maneja traslados)
    return { tipo: 'orden', lugar };
  }
  return { tipo: 'sugerencia', lugar };
}
