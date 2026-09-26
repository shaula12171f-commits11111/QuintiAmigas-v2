// ============================================================
//  Motor principal - QuintiAmigas v2
//  Tags: Qwen elige el tag principal (se usa de verdad)
//  + IA tag + Nakardas pasan a TESTING only
//  + Estados de relacion automaticos + lugar actual (sugerencia vs orden)
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
import { clasificarIntencionLugar, getFondoLugar, getLugar } from '../systems/lugares.js';
import { detectarEmocionEnTexto, listarEmociones } from '../systems/emociones.js';
import {
  listarEscenasDisponibles as listarGrupalesDisponibles,
  getEscenaPorTag as getGrupalPorTag
} from '../systems/imagenesGrupales.js';
import {
  listarEscenasDisponibles as listarParejasDisponibles,
  getEscenaPorTag as getParejaPorTag
} from '../systems/imagenesParejas.js';
import {
  listarEscenasDisponibles as listarMultiHombresDisponibles,
  getEscenaPorTag as getMultiHombresPorTag
} from '../systems/imagenesMultiHombres.js';
import { GROQ_KEYS, MODELO, MODELO_TAGS, NOMBRE_USUARIO_DEFAULT } from '../../config.js';
import { getGroqKeyStrings } from '../systems/apiKeys.js';

export const FASE = { NORMAL: 'normal', TRASLADO: 'traslado', LLEGADA: 'llegada', INTIMO: 'intimo' };

/** Estados de relacion (automatico por ahora) */
export const RELACION = {
  DESCONOCIDA: 'desconocida',
  CONOCIDA: 'conocida',
  AMIGA: 'amiga',
  NOVIA: 'novia',
  SEXFRIEND: 'sexfriend'
};

const RELACION_ORDEN = [
  RELACION.DESCONOCIDA,
  RELACION.CONOCIDA,
  RELACION.AMIGA,
  RELACION.NOVIA,
  RELACION.SEXFRIEND
];

const TODAS_CHICAS = ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia'];
const TODOS = [...TODAS_CHICAS, 'Aldo'];

let estado = {
  fase: FASE.NORMAL,
  ubicacion: null,          // lugar actual (casa, cafe, parque, etc.)
  chica: null,
  chicasActivas: [],
  historial: [],            // se guarda localmente (memorias/UI); YA NO se manda completo a la IA
  resumenConversacion: '',  // resumen progresivo + últimos N mensajes completos = contexto histórico
  nombreUsuario: NOMBRE_USUARIO_DEFAULT || 'Fabrizio',
  hechos: [],
  keyIndex: 0,
  modo: 'libre',
  historiaId: null,
  eventosDisparados: [],   // ids de eventos de historia ya disparados en esta partida
  eventoPendienteReaccion: null, // evento mostrado; la chica reacciona en el SIGUIENTE turno

  outfitActual: null,       // legacy: { chica, tag, descripcion }
  accionActual: null,
  accionPorChica: {}, // última pose/tag sexual por chica (continuidade multi)
  relacion: RELACION.DESCONOCIDA, // espejo de la chica principal
  relacionPorChica: {}, // { Nino: 'novia', Miku: 'sexfriend', ... }
  vinculosNPC: {}, // { Aldo: 'novio de Ichika' }
  mensajesCount: 0,         // para progresion automatica de relacion
  ultimoMensajeUsuario: null, // para boton refresh
  // Ropa por chica: { [chica]: { actual, anterior, tagActual, tagAnterior } }
  ropaPorChica: {},
  // Eyaculación rápida
  turnosEnSexo: 0,           // turnos desde que empezó la escena sexual activa
  eyaculacionRapida: false,  // true si se corrió en <= 2 turnos de sexo
  ultimaEyaculacionRapida: false, // se mantiene un turno para el prompt
  // Máquina de corridas
  corridas: [],              // [{ de, en, donde, pose, id }]
  corridasCountPorChica: {}, // { Nino: 2, Miku: 1 }
  ultimaCorrida: null
};

const MAX_HISTORIAL = 20;
/** Cuántos mensajes recientes completos se mandan además del resumen (2 = último par user+bot). */
const ULTIMOS_MENSAJES_CONTEXTO = 2;
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

/** Detecta si el mensaje es solo una pregunta/sugerencia (NO una orden ni escena en curso). */
function esMensajeSugerencia(mensaje, { escenaSexualActiva = false } = {}) {
  const m = String(mensaje || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!m) return false;

  // Si YA hay sexo en curso, casi nunca es "sugerencia": es dirty talk / feedback
  // ("te gusta?", "te gusta perra?", "más rico?") → NO forzar hablando
  if (escenaSexualActiva) {
    // Solo tratar como sugerencia hipotética si pregunta por OTRA posición futura sin continuar el acto
    const cambiaDeTema = /\b(despu[eé]s|m[aá]s\s*tarde|en\s*otro\s*momento|cuando\s*terminemos)\b/.test(m)
      && /\b(posici[oó]n|prefer[ií]s|quer[eé]s\s+foll|te\s+gustar[ií]a)\b/.test(m);
    return !!cambiaDeTema;
  }

  // Acto / orden / descripción de lo que está pasando → NO es sugerencia
  if (/\b(follame|cogeme|chupame|mamame|hacelo|hazlo|metela|meto|te la meto|ahora doggy|ahora anal|me corro|eyacul|assjob|titjob|paizuri|handjob|dedos?|concha|co[nñ]o|chapoteo|meto\s*dedos|metiendo)\b/.test(m)) {
    return false;
  }
  if (/\b(estoy|estas|est[aá]s|estamos|haciendo|follando|chupando|metiendo)\b/.test(m) && !/\?/.test(m)) {
    if (/\b(foll|chup|mam|penetr|doggy|anal|oral|dedo)\b/.test(m)) return false;
  }

  // Dirty talk durante/después de acto: "te gusta?", "te gusta puta/perra?" → NO sugerencia de escena nueva
  if (/\bte\s+gusta\b/.test(m) && !/\b(posici[oó]n|doggy|misionero|anal|oral|follar)\b/.test(m)) {
    return false;
  }

  // Preguntas / preferencias HIPOTÉTICAS (sin escena activa)
  const esPreguntaPosicion = /\b(en\s+que\s+posici[oó]n|qu[eé]\s+posici[oó]n|prefer[ií]s|quer[eé]s\s+foll|c[oó]mo\s+quer[eé]s|qu[eé]\s+te\s+gustar[ií]a)\b/.test(m);
  const esPreferencia = /\b(prefer[ií]s|te\s+gustar[ií]a|elige|eleg[ií]|opci[oó]n)\b/.test(m) && /\b(posici[oó]n|doggy|anal|oral|misionero)\b/.test(m);
  const esHipotesis = /\b(y\s+si|podr[ií]amos|te\s+animar[ií]as|te\s+gustar[ií]a\s+que)\b/.test(m);

  // Pregunta genérica sola ("¿cómo estás?") sin sexo → sí puede ser neutra, pero no forzamos hablando por eso
  // Solo forzar hablando en sugerencias de ACTO sexual futuro
  return esPreguntaPosicion || esPreferencia || esHipotesis;
}

function hayEscenaSexualActiva() {
  if ((estado.turnosEnSexo || 0) > 0) return true;
  const a = String(estado.accionActual || '').toLowerCase();
  if (a && a !== 'hablando' && /doggy|mision|cowgirl|anal|chup|handjob|assjob|paizuri|foll|69|oral|paja|dedo|concha|sex|metiendo|sidefuck|standfuck/.test(a)) {
    return true;
  }
  if (estado.fase === FASE.INTIMO) return true;
  return false;
}


const CHICAS_ENOJO_RAPIDO = ['Nino', 'Ichika', 'Yotsuba'];
const PATRON_SEXO_ACTIVO = /\b(foll|cog|chup|mam[ao]|oral|handjob|paja|assjob|paizuri|titjob|doggy|mision|cowgirl|anal|penetr|meto|metela|69|lam[ei]|deepthroat|entre (las )?nalgas|entre (las )?tetas|dedos?|concha|co[nñ]o|chapoteo|metiendo)\b/i;
const PATRON_EYACULA = /\b(me\s*corr[oií]|me\s*vine|eyacul|acabo|me\s*sali[oó]|tiro\s*(semen|leche)|cum\b|finished)\b/i;

function esActoSexualActivo(texto) {
  return PATRON_SEXO_ACTIVO.test(String(texto || ''));
}

function esMensajeEyaculacion(texto) {
  return PATRON_EYACULA.test(String(texto || ''));
}

/** Actualiza contador de turnos de sexo y flag de eyaculación rápida. */
function actualizarContadorSexoYEyaculacion(mensajeUsuario, tagUsado = null) {
  const msg = String(mensajeUsuario || '');
  const haySexo = esActoSexualActivo(msg) || (tagUsado && esTagSex && typeof esTagSex === 'function' && esTagSex(tagUsado))
    || (tagUsado && /doggy|mision|cowgirl|anal|chup|handjob|assjob|paizuri|foll|69|oral|paja/i.test(String(tagUsado)));
  const eyacula = esMensajeEyaculacion(msg);

  if (eyacula) {
    // Se corrió: evaluar rapidez ANTES de resetear
    const rapido = (estado.turnosEnSexo > 0 && estado.turnosEnSexo <= 2)
      || (estado.turnosEnSexo === 0 && haySexo); // se corrió en el mismo mensaje que empezó el acto
    // Si no había contador pero había acción sexual previa en accionActual
    const rapido2 = estado.turnosEnSexo <= 2 && (estado.turnosEnSexo >= 1 || !!estado.accionActual && /doggy|mision|cowgirl|anal|chup|handjob|assjob|paizuri|foll|69|oral|paja|sex/i.test(String(estado.accionActual||'')));
    estado.eyaculacionRapida = rapido || rapido2 || (estado.turnosEnSexo > 0 && estado.turnosEnSexo <= 2);
    // Si turnosEnSexo era 0 y solo dice "me corro" sin contexto sexual previo, no marcar
    if (estado.turnosEnSexo === 0 && !estado.accionActual && !haySexo) {
      estado.eyaculacionRapida = false;
    }
    estado.ultimaEyaculacionRapida = estado.eyaculacionRapida;
    log('Eyaculación detectada. turnosEnSexo=', estado.turnosEnSexo, 'rapida=', estado.eyaculacionRapida);
    // Después de corrida, reiniciar contador de escena
    estado.turnosEnSexo = 0;
    return;
  }

  if (haySexo) {
    estado.turnosEnSexo = (estado.turnosEnSexo || 0) + 1;
    estado.eyaculacionRapida = false;
    log('Turno sexo #', estado.turnosEnSexo);
  }
}



// ========== MÁQUINA DE CORRIDAS ==========
function canonChicaNombre(n) {
  const x = String(n || '').toLowerCase();
  return ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia'].find((c) => c.toLowerCase() === x) || null;
}

function detectarDondeCorrida(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (/dentro\s+(de\s+)?(su\s+)?(culo|ano)|en\s+(el\s+)?culo|anal\s+dentro|creampie\s+anal/.test(t)) return 'dentro_anal';
  if (/dentro|adentro|creampie|en\s+(su\s+)?(concha|coño|vagina|interior)|llen[oa]\s+(de\s+)?(semen|leche)/.test(t)) return 'dentro_vagina';
  if (/en\s+(la\s+|su\s+)?cara|facial|sobre\s+(la\s+)?cara|rostro/.test(t)) return 'cara';
  if (/en\s+(la\s+|su\s+)?boca|trag|oral\s+cum|leche\s+en\s+la\s+boca/.test(t)) return 'boca';
  if (/en\s+(las\s+|sus\s+)?tetas|pecho|entre\s+(las\s+)?tetas|paizuri/.test(t)) return 'pecho';
  if (/en\s+(el\s+|su\s+)?cuerpo|sobre\s+(el\s+)?cuerpo|barriga|espalda|nalgas/.test(t)) return 'cuerpo';
  if (/afuera|fuera|exterior|pull\s*out/.test(t)) return 'afuera';
  return 'desconocido';
}

function detectarPoseParaCorrida(texto, chica) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (/doggy|doggystyle|a cuatro|perrito/.test(t)) return 'doggy';
  if (/misioner|misionero/.test(t)) return 'misionero';
  if (/cowgirl|vaquera|horcajadas/.test(t)) return 'cowgirl';
  if (/stand\s*fuck|standfuck|de pie/.test(t)) return 'standfuck';
  if (/chup|oral|mamad|boca/.test(t) && !/dentro/.test(t)) return 'oral';
  // Buscar en hechos recientes de esa chica
  const C = chica || '';
  const hechos = estado.hechos || [];
  for (let i = hechos.length - 1; i >= 0; i--) {
    const h = String(hechos[i]);
    if (C && !h.toLowerCase().includes(String(C).toLowerCase())) continue;
    if (/doggy/i.test(h)) return 'doggy';
    if (/misionero/i.test(h)) return 'misionero';
    if (/cowgirl|vaquera/i.test(h)) return 'cowgirl';
    if (/standfuck|de pie/i.test(h)) return 'standfuck';
    if (/oral/i.test(h)) return 'oral';
  }
  const a = String(estado.accionActual || '').toLowerCase();
  if (/doggy/.test(a)) return 'doggy';
  if (/mision/.test(a)) return 'misionero';
  if (/cowgirl|vaquera/.test(a)) return 'cowgirl';
  return null;
}

function detectarChicaObjetivoCorrida(texto) {
  const t = String(texto || '').toLowerCase();
  const chicas = ['ichika', 'nino', 'miku', 'yotsuba', 'itsuki', 'emilia'];
  // "en la cara de nino" / "dentro de miku" / "a nino"
  for (const cl of chicas) {
    if (new RegExp(`\\b(de|en|a|dentro de)\\s+${cl}\\b|\\b${cl}\\b`).test(t)) {
      // prefer explicit target patterns
      if (new RegExp(`\\b(de|en|a|dentro\\s+de)\\s+${cl}\\b`).test(t)) return canonChicaNombre(cl);
    }
  }
  for (const cl of chicas) {
    if (new RegExp(`\\b${cl}\\b`).test(t)) return canonChicaNombre(cl);
  }
  return estado.chica || null;
}

function registrarCorrida({ de, en, donde, pose, fuente = 'parse' }) {
  if (!en) en = estado.chica;
  if (!en) return null;
  const rec = {
    id: Date.now() + Math.floor(Math.random() * 999),
    de: de || 'usuario',
    en,
    donde: donde || 'desconocido',
    pose: pose || null,
    fuente
  };
  if (!Array.isArray(estado.corridas)) estado.corridas = [];
  // Evitar duplicar la misma corrida en el mismo turno (misma firma)
  const firma = `${rec.de}|${rec.en}|${rec.donde}|${rec.pose}`;
  const last = estado.corridas[estado.corridas.length - 1];
  if (last && `${last.de}|${last.en}|${last.donde}|${last.pose}` === firma) {
    return last;
  }
  estado.corridas.push(rec);
  estado.corridas = estado.corridas.slice(-30);
  estado.ultimaCorrida = rec;
  if (!estado.corridasCountPorChica) estado.corridasCountPorChica = {};
  estado.corridasCountPorChica[en] = (estado.corridasCountPorChica[en] || 0) + 1;

  const dondeTxt = {
    dentro_vagina: 'dentro (vaginal)',
    dentro_anal: 'dentro (anal)',
    cara: 'en la cara',
    boca: 'en la boca',
    pecho: 'en el pecho/tetas',
    cuerpo: 'sobre el cuerpo',
    afuera: 'afuera',
    desconocido: 'lugar no especificado'
  }[rec.donde] || rec.donde;

  const poseTxt = rec.pose ? ` en pose ${rec.pose}` : '';
  const hecho = `CORRIDAS: ${rec.de} se corrió ${dondeTxt} de/en ${rec.en}${poseTxt} (#${estado.corridasCountPorChica[en]} en ${rec.en})`;
  if (typeof addHechoFijo === 'function') {
    addHechoFijo(hecho);
  } else if (!estado.hechos.includes(hecho)) {
    estado.hechos.push(hecho);
    estado.hechos = estado.hechos.slice(-24);
  }
  log('Corrida registrada:', rec);
  return rec;
}

/** Detecta corridas SOLO desde el mensaje del usuario (por cláusula). No inventa desde el texto del bot. */
function procesarCorridasDelIntercambio(mensajeUsuario, respuestaBot = '') {
  const u = String(mensajeUsuario || '').trim();
  if (!u) return;
  const uLow = u.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const bLow = String(respuestaBot || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

  // Evitar procesar dos veces el mismo mensaje (early + post)
  const firma = uLow.slice(0, 160);
  const yaRegistro = estado._corridaMsgFirma === firma && estado._corridaMsgDone;
  const soloRefinar = yaRegistro && bLow;

  const chicas = ['ichika', 'nino', 'miku', 'yotsuba', 'itsuki', 'emilia'];
  function targetEnFragmento(frag) {
    // "en la cara de nino" / "en la boca de ichika" / "dentro de nino"
    for (const cl of chicas) {
      if (new RegExp(`\b(de|en|a|dentro\s+de)\s+${cl}\b`).test(frag)) return canonChicaNombre(cl);
    }
    for (const cl of chicas) {
      if (new RegExp(`\b${cl}\b`).test(frag)) return canonChicaNombre(cl);
    }
    return null;
  }

  if (!soloRefinar) {
    // Partir: "aldo se corre en la cara de nino y yo me corro en la boca de ichika"
    const trozos = uLow.split(/\s+y\s+|(?<=[.!;])\s+/).map((s) => s.trim()).filter(Boolean);
    const frags = trozos.length ? trozos : [uLow];
    let registradas = 0;

    for (const frag of frags) {
      const aldoFrag = /\baldo\b/.test(frag) && /\b(se\s*corr|eyacul|se\s*vine|acab)/.test(frag);
      const userFrag = /\b(me\s*corr[oóí]|me\s*vine|eyacul[oó]|acabo|me\s*sali[oó]|tiro\s*(semen|leche))\b/.test(frag)
        && !/\baldo\b/.test(frag);

      if (aldoFrag) {
        const en = targetEnFragmento(frag) || (() => {
          // fallback: chica en hechos con Aldo
          for (let i = (estado.hechos || []).length - 1; i >= 0; i--) {
            const h = String(estado.hechos[i]);
            const m = h.match(/\b(Ichika|Nino|Miku|Yotsuba|Itsuki|Emilia)\b[^\n]{0,40}Aldo|Aldo[^\n]{0,40}\b(Ichika|Nino|Miku|Yotsuba|Itsuki|Emilia)\b/i);
            if (m) return canonChicaNombre(m[1] || m[2]);
          }
          return null;
        })();
        if (!en) continue;
        const donde = detectarDondeCorrida(frag);
        const pose = detectarPoseParaCorrida(frag, en);
        registrarCorrida({ de: 'Aldo', en, donde, pose, fuente: 'aldo' });
        registradas++;
      } else if (userFrag) {
        const en = targetEnFragmento(frag) || estado.chica;
        if (!en) continue;
        const donde = detectarDondeCorrida(frag);
        const pose = detectarPoseParaCorrida(frag, en);
        registrarCorrida({ de: 'usuario', en, donde, pose, fuente: 'usuario' });
        registradas++;
      }
    }
    estado._corridaMsgFirma = firma;
    estado._corridaMsgDone = true;
    if (registradas) log('Corridas este mensaje:', registradas);
  }

  // Solo refinar "dónde" si quedó desconocido y el bot lo describe (sin crear corridas nuevas)
  if (bLow && estado.ultimaCorrida && estado.ultimaCorrida.donde === 'desconocido') {
    const donde2 = detectarDondeCorrida(bLow);
    if (donde2 !== 'desconocido') {
      estado.ultimaCorrida.donde = donde2;
      const c = estado.ultimaCorrida;
      const dondeTxt = {
        dentro_vagina: 'dentro (vaginal)', dentro_anal: 'dentro (anal)', cara: 'en la cara',
        boca: 'en la boca', pecho: 'en el pecho/tetas', cuerpo: 'sobre el cuerpo',
        afuera: 'afuera', desconocido: 'lugar no especificado'
      }[c.donde] || c.donde;
      addHechoFijo(
        `CORRIDAS: ${c.de} se corrió ${dondeTxt} de/en ${c.en}${c.pose ? ' en pose ' + c.pose : ''} (#${estado.corridasCountPorChica[c.en] || 1} en ${c.en})`,
        `CORRIDAS: ${c.de} se corrió`
      );
    }
  }
}

function textoCorridasParaContexto() {
  const lines = [];
  const counts = estado.corridasCountPorChica || {};
  const keys = Object.keys(counts);
  if (keys.length) {
    lines.push('Contador de corridas recibidas: ' + keys.map((k) => `${k}=${counts[k]}`).join(', '));
  }
  const ult = (estado.corridas || []).slice(-5);
  for (const c of ult) {
    lines.push(`- ${c.de} → ${c.en} | dónde=${c.donde}${c.pose ? ' | pose=' + c.pose : ''}`);
  }
  if (estado.ultimaCorrida) {
    lines.push(`Última corrida: ${estado.ultimaCorrida.de} en ${estado.ultimaCorrida.en} (${estado.ultimaCorrida.donde}${estado.ultimaCorrida.pose ? ', ' + estado.ultimaCorrida.pose : ''})`);
  }
  return lines.length ? lines.join('\n') : '';
}

function log(...args) { console.log('%c[Quinti]', 'color:#a78bfa;font-weight:bold', ...args); }
function logGroup(title, obj) {
  console.groupCollapsed('%c[Quinti] ' + title, 'color:#a78bfa;font-weight:bold');
  if (obj && typeof obj === 'object') { for (const [k, v] of Object.entries(obj)) console.log(k + ':', v); }
  else console.log(obj);
  console.groupEnd();
}

/** Inferir estado de ropa a partir del nombre del tag */
function inferirEstadoRopaDesdeTag(tag) {
  const t = String(tag || '').toLowerCase();
  if (!t || t === 'hablando') return null;
  if (/_nosex$/.test(t)) {
    // nosex puede seguir teniendo ropa
  }
  if (/desnuda|quitandose|sin_ropa|post_sexo/.test(t)) return 'desnuda';
  if (/bikini|playa/.test(t)) return 'bikini';
  if (/tanga/.test(t)) return 'tanga';
  if (/lenceria|sujetador|selfie_lencer/.test(t)) return 'lenceria';
  if (/cosplay|uniforme|colegiala|disfraz/.test(t)) return 'cosplay';
  if (/ropa_|idol|vestido|yukata|elegante|sexy|modelo|cita/.test(t)) return 'vestida';
  if (/mostrando_tetas|mostrando_culo|moviendo_el_culo/.test(t) && !/tanga/.test(t)) {
    // mostrando sin tanga suele ser desnuda o semi
    if (/sin_ropa|desnud/.test(t)) return 'desnuda';
  }
  if (/doggy|mision|cowgirl|sidefuck|standfuck|follando|anal|chupando|handjob|69|metiendo_dedos/.test(t)) {
    // actos sexuales: asumir desnuda salvo que el tag diga ropa
    if (/ropa|tanga|bikini|vestid/.test(t)) return 'vestida';
    return 'desnuda';
  }
  return null;
}

function getRopaChica(chica) {
  if (!estado.ropaPorChica[chica]) {
    estado.ropaPorChica[chica] = {
      actual: 'desconocida',
      anterior: null,
      tagActual: null,
      tagAnterior: null
    };
  }
  return estado.ropaPorChica[chica];
}

function actualizarRopaDesdeTag(chica, tag, descripcion = '') {
  const ropa = getRopaChica(chica);
  const nuevo = inferirEstadoRopaDesdeTag(tag);
  if (!nuevo) {
    // si hay descripcion con pistas
    const d = String(descripcion || '').toLowerCase();
    let fromDesc = null;
    if (/desnud/.test(d)) fromDesc = 'desnuda';
    else if (/bikini/.test(d)) fromDesc = 'bikini';
    else if (/tanga/.test(d)) fromDesc = 'tanga';
    else if (/lencer/.test(d)) fromDesc = 'lenceria';
    else if (/vestid|ropa|idol|falda/.test(d)) fromDesc = 'vestida';
    if (!fromDesc) return ropa;
    if (fromDesc !== ropa.actual) {
      ropa.anterior = ropa.actual;
      ropa.tagAnterior = ropa.tagActual;
      ropa.actual = fromDesc;
      ropa.tagActual = tag;
      log('Ropa actualizada (desc):', chica, ropa.anterior, '→', ropa.actual, `(tag=${tag})`);
    }
    return ropa;
  }
  if (nuevo !== ropa.actual) {
    ropa.anterior = ropa.actual;
    ropa.tagAnterior = ropa.tagActual;
    ropa.actual = nuevo;
    ropa.tagActual = tag;
    log('Ropa actualizada:', chica, ropa.anterior, '→', ropa.actual, `(tag=${tag})`);
  } else {
    ropa.tagActual = tag;
  }
  // sincronizar outfitActual legacy
  estado.outfitActual = {
    chica,
    tag,
    descripcion: descripcion || ropa.actual,
    ropaActual: ropa.actual,
    ropaAnterior: ropa.anterior
  };
  return ropa;
}


/** Actualiza el estado de ropa a partir de lo que DECLARA el usuario (antes de generar respuesta) */
function actualizarRopaDesdeMensajeUsuario(msg, chica) {
  if (!chica || !msg) return;
  const t = String(msg || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const ropa = getRopaChica(chica);

  let nuevo = null;
  // desnuda / sin ropa (prioridad alta)
  if (/\b(desnuda|desnudate|desn[uú]date|sin ropa|quitate la ropa|quit[aá]te la ropa|te ves desnuda|est[aá]s desnuda|estas desnuda|ya desnuda|completamente desnuda)\b/.test(t)) {
    nuevo = 'desnuda';
  } else if (/\btanga\b/.test(t) && !/sin tanga|sin la tanga|quita(te)? la tanga/.test(t)) {
    nuevo = 'tanga';
  } else if (/\bbikini\b/.test(t)) {
    nuevo = 'bikini';
  } else if (/\b(lencer[ií]a|sujetador|encaje)\b/.test(t)) {
    nuevo = 'lenceria';
  } else if (/\b(vestida|con ropa|ponete la ropa|ponte la ropa|viste(te)?)\b/.test(t)) {
  } else if (/\b(cosplay|disfraz|uniforme|colegiala)\b/.test(t) || /\b(pónganse|ponganse|ponte|ponete).{0,20}cosplay/.test(t)) {
    nuevo = 'cosplay';
    nuevo = 'vestida';
  }

  if (nuevo && nuevo !== ropa.actual) {
    ropa.anterior = ropa.actual;
    ropa.tagAnterior = ropa.tagActual;
    ropa.actual = nuevo;
    // tagActual se sincroniza después cuando se elija el tag real
    log('Ropa forzada por mensaje usuario:', chica, ropa.anterior, '→', ropa.actual);
    // Guardar en hechos para continuidad
    const hecho = `${chica} está ${nuevo}`;
    if (!estado.hechos.includes(hecho)) {
      estado.hechos.push(hecho);
      estado.hechos = estado.hechos.slice(-12);
    }
  }
}

/** Tags incoherentes con el estado de ropa actual */
function tagIncompatibleConRopa(tag, ropaActual) {
  const t = String(tag || '').toLowerCase();
  const r = String(ropaActual || '').toLowerCase();
  if (!t || !r || r === 'desconocida') return false;
  // Si está desnuda: no mostrar ropa/tanga/bikini/vestido/idol
  if (r === 'desnuda') {
    if (/tanga|bikini|ropa_|idol|vestido|yukata|sujetador|lenceria|cosplay|quitandose/.test(t) && !/desnuda/.test(t)) {
      return true;
    }
  }
  // Si está vestida: tags que implican ya desnuda total pueden pasar (quitandose ok)
  // Si tiene tanga: bikini completo no
  if (r === 'tanga' && /bikini_playa|ropa_idol|ropa_vestido/.test(t)) return true;
  if (r === 'bikini' && /ropa_idol|ropa_vestido|yukata/.test(t)) return true;
  if (r === 'cosplay') {
    if (/^desnuda$|post_sexo_desnuda/.test(t) && !/cosplay|quitandose/.test(t)) return true;
  }
  return false;
}

/**
 * TESTING ONLY — razonamiento visible en consola (no afecta la imagen real).
 * Itera preguntas: accion → sujeto → ropa → eyaculacion → tag sugerido.
 */
function razonarTagTestingIA(chica, mensajeUsuario, textoBot, tagIA, tagRealUsado) {
  const mu = String(mensajeUsuario || '').toLowerCase();
  const tb = String(textoBot || '').toLowerCase();
  const combinado = mu + ' ' + tb;
  const ropa = getRopaChica(chica);
  const tags = listarTags(chica) || [];

  // 1) Qué acción está pasando
  let accion = 'conversacion';
  if (/assjob|culo.?job|entre (las )?nalgas|entre (el )?culo|frot.*culo|pija.*culo|verga.*culo/.test(combinado)) accion = 'assjob';
  else if (/handjob|paja|con la mano|manosea.*verga|agarra.*verga/.test(combinado)) accion = 'handjob';
  else if (/paizuri|tetas|entre (las )?tetas|titjob|titfuck/.test(combinado)) accion = 'paizuri';
  else if (/chup|mam[ao]|oral|lam[ei]|deepthroat|blowjob/.test(combinado)) accion = 'oral';
  else if (/doggy|perrito|a cuatro/.test(combinado)) accion = 'doggystyle';
  else if (/misioner/.test(combinado)) accion = 'misionero';
  else if (/cowgirl|vaquera|montando/.test(combinado)) accion = 'cowgirl';
  else if (/anal|por el culo|en el culo/.test(combinado)) accion = 'anal';
  else if (/foll|cog|penetr|meto|metiendo/.test(combinado)) accion = 'penetracion';
  else if (/nalgue|cachetad/.test(combinado)) accion = 'nalguear';
  else if (/agarr[oa].*culo|toco.*culo|toc[ao].*culo/.test(combinado)) accion = 'usuario_toca_culo';
  else if (/muestra.*culo|culo.*muestra|enseña.*culo|moviendo.*culo/.test(combinado)) accion = 'ella_muestra_culo';
  else if (/beso|besarte|besando/.test(combinado)) accion = 'beso';
  else if (/desnud/.test(combinado)) accion = 'desnudarse';
  else if (/muestro|saco.*(verga|pija)/.test(mu)) accion = 'usuario_muestra_verga';
  else if (/69|sesenta y nueve/.test(combinado)) accion = '69';

  // 2) Quién hace qué
  let sujeto = 'indefinido';
  if (accion === 'usuario_toca_culo') sujeto = `usuario toca el culo de ${chica}`;
  else if (accion === 'ella_muestra_culo') sujeto = `${chica} muestra su culo`;
  else if (accion === 'usuario_muestra_verga') sujeto = 'usuario muestra su verga';
  else if (['oral','penetracion','doggystyle','misionero','cowgirl','anal','assjob','handjob','paizuri','69'].includes(accion)) {
    sujeto = `escena sexual (${accion}) con ${chica}`;
  } else {
    sujeto = `interaccion con ${chica}`;
  }

  // 3) Ropa
  const ropaPregunta = {
    actual: ropa.actual,
    anterior: ropa.anterior,
    coherente_con_desnuda: ropa.actual === 'desnuda'
  };

  // ========== NUEVO: Análisis de eyaculación (TESTING) ==========
  const seCorrio = /eyacul[oó]|me corr[ií]|se me sali[oó]|solt[eé].*semen|solt[eé].*leche|me vine|me corr[ií]|no aguant[eé]|no pude aguantar|me sali[oó]|tiro.*leche|tiro.*semen|cum|came|finished|orgasmo.*mio|mi orgasmo/.test(mu);
  const casiSeCorre = /casi me corro|estoy por correrme|voy a correrme|no aguanto|no puedo aguantar|al borde|a punto de|casi|edge/.test(mu) && !seCorrio;

  let tipoEyaculacion = 'ninguna';
  if (seCorrio) tipoEyaculacion = 'completa';
  else if (casiSeCorre) tipoEyaculacion = 'casi / no aguantó';

  // Lugar donde eyaculó
  let lugarEyaculacion = 'no especificado';
  if (seCorrio || casiSeCorre) {
    if (/en (el |su )?culo|entre (las )?nalgas|sobre (el )?culo|en el ass|assjob/.test(combinado) || accion === 'assjob') {
      lugarEyaculacion = 'sobre/entre el culo (assjob)';
    } else if (/en (la |su )?cara|facial|sobre (la )?cara/.test(combinado)) {
      lugarEyaculacion = 'en la cara (facial)';
    } else if (/en (las |sus )?tetas|sobre (las )?tetas|en el pecho|paizuri/.test(combinado) || accion === 'paizuri') {
      lugarEyaculacion = 'en las tetas / pecho';
    } else if (/en (la |su )?boca|dentro de (la )?boca|oral|chup/.test(combinado) || accion === 'oral') {
      lugarEyaculacion = 'en la boca / oral';
    } else if (/dentro|adentro|creampie|en (el |su )?co[nñ]o|en (la |su )?vagina/.test(combinado)) {
      lugarEyaculacion = 'dentro (creampie)';
    } else if (/en (la |su )?mano|handjob|paja/.test(combinado) || accion === 'handjob') {
      lugarEyaculacion = 'en la mano / handjob';
    } else if (/afuera|fuera|sobre (el )?cuerpo|encima/.test(combinado)) {
      lugarEyaculacion = 'afuera / sobre el cuerpo';
    } else {
      lugarEyaculacion = `durante ${accion} (lugar no explícito)`;
    }
  }

  // ¿La chica reaccionó?
  const ellaReacciono = /sent[ií]|lo sent[ií]|me di cuenta|se me sali[oó]|caliente|lleno|semen|leche|caliente.*adentro|me moj[oó]|gem[ií]|ahh|mmm|sí.*idiota|me gusta cuando/.test(tb);

  // Pérdida de control del usuario
  const perdidaControl = /no aguant[eé]|no pude|no control[eé]|se me sali[oó]|perdi el control|no aguant[eé] m[aá]s|me corr[ií] sin querer/.test(mu);

  // 4) Tag sugerido por este razonamiento (solo test)
  let sugerido = tagIA || 'hablando';
  if (accion === 'assjob') {
    sugerido = tags.find(t => /assjob|culo.*job|entre.*nalgas|frot.*culo/.test(t)) || 'assjob';
  } else if (accion === 'ella_muestra_culo') {
    if (ropa.actual === 'desnuda') {
      sugerido = tags.find(t => /mostrando_culo_sin_ropa|mostrando_culo(?!_tanga)|desnuda/.test(t)) || 'desnuda';
    } else if (ropa.actual === 'tanga' || /tanga/.test(ropa.actual)) {
      sugerido = tags.find(t => /mostrando_culo_tanga|tanga/.test(t)) || sugerido;
    } else {
      sugerido = tags.find(t => /mostrando_culo|tanga|moviendo_el_culo/.test(t)) || sugerido;
    }
  } else if (accion === 'usuario_toca_culo') {
    if (ropa.actual === 'desnuda') {
      sugerido = tags.find(t => /agarra_el_culo(?!.*NOSEX)|agarra_el_culo/.test(t) && !/NOSEX/i.test(t)) ||
                 tags.find(t => /agarra_el_culo/.test(t)) || sugerido;
    } else {
      sugerido = tags.find(t => /agarra_el_culo.*NOSEX|NOSEX.*culo|agarra_el_culo/.test(t)) || sugerido;
    }
  }

  // Si hubo eyaculación, intentar sugerir tag de cum si existe
  if (seCorrio) {
    const tagCum = tags.find(t => /cum|semen|leche|corrida|facial|creampie|post_sexo/.test(t));
    if (tagCum) sugerido = tagCum;
  }

  // Incompatibilidad del tag de la IA vs ropa
  const iaIncoherente = tagIncompatibleConRopa(tagIA, ropa.actual);
  const realIncoherente = tagIncompatibleConRopa(tagRealUsado, ropa.actual);

  // LOG BIEN VISIBLE
  console.log('%c========== ESTE TAG DETERMINO LA IA (TESTING) ==========', 'color:#fbbf24;font-weight:bold;font-size:13px');
  console.log('%c  Tag IA →', 'color:#fbbf24;font-weight:bold', tagIA || '(ninguno)');
  console.log('%c  Tag REAL usado →', 'color:#34d399;font-weight:bold', tagRealUsado || '(ninguno)');
  console.log('%c  (El tag IA NO cambia la imagen; solo se compara)', 'color:#94a3b8;font-style:italic');
  console.groupCollapsed('%c  Razonamiento testing (iterativo)', 'color:#38bdf8');
  console.log('1) Que accion esta pasando?', accion);
  console.log('2) Quien / que?', sujeto);
  console.log('3) Que ropa lleva / como esta?', ropaPregunta);
  console.log('4) ¿El usuario se corrió / eyaculó / soltó semen?', seCorrio ? 'SÍ' : (casiSeCorre ? 'CASI / no aguantó' : 'no'));
  console.log('5) Tipo de eyaculación:', tipoEyaculacion);
  console.log('6) ¿En qué acción estaba eyaculando?', seCorrio || casiSeCorre ? accion : 'n/a');
  console.log('7) ¿Eyaculó en un lugar específico?', lugarEyaculacion);
  console.log('8) ¿Pérdida de control del usuario?', perdidaControl ? 'SÍ' : 'no');
  console.log('9) ¿La chica se dio cuenta / reaccionó?', ellaReacciono ? 'SÍ' : 'no');
  console.log('10) Tag sugerido por razonamiento local:', sugerido);
  console.log('11) Tag IA incoherente con ropa actual?', iaIncoherente ? 'SI' : 'no');
  console.log('12) Tag REAL incoherente con ropa actual?', realIncoherente ? 'SI' : 'no');
  console.log('Mensaje usuario:', mensajeUsuario);
  console.log('Texto bot (recorte):', String(textoBot || '').slice(0, 140));
  console.groupEnd();
  console.log('%c========================================================', 'color:#fbbf24;font-weight:bold');

  return {
    accion,
    sujeto,
    ropa: ropaPregunta,
    eyaculacion: {
      seCorrio,
      casiSeCorre,
      tipo: tipoEyaculacion,
      lugar: lugarEyaculacion,
      perdidaControl,
      ellaReacciono
    },
    tagIA: tagIA || null,
    tagReal: tagRealUsado || null,
    sugeridoRazonamiento: sugerido,
    iaIncoherente,
    realIncoherente
  };
}


export function getEstado() {
  const ropa = estado.chica ? getRopaChica(estado.chica) : null;
  return {
    ...estado,
    chicasActivas: [...estado.chicasActivas],
    fondoLugar: getFondoLugar(estado.ubicacion),
    ropaActual: ropa ? ropa.actual : null,
    ropaAnterior: ropa ? ropa.anterior : null,
    ropaPorChica: { ...estado.ropaPorChica }
  };
}

/** Serializa el estado completo para guardar en localStorage (Memorias) */
export function exportarEstadoCompleto() {
  const ropaCopy = {};
  for (const [k, v] of Object.entries(estado.ropaPorChica || {})) {
    ropaCopy[k] = { ...v };
  }
  return {
    version: 1,
    fecha: Date.now(),
    chica: estado.chica,
    chicasActivas: [...(estado.chicasActivas || [])],
    fase: estado.fase,
    ubicacion: estado.ubicacion,
    relacion: estado.relacion,
    modo: estado.modo,
    historiaId: estado.historiaId,
    eventosDisparados: [...(estado.eventosDisparados || [])],
    eventoPendienteReaccion: estado.eventoPendienteReaccion ? { ...estado.eventoPendienteReaccion } : null,
    accionActual: estado.accionActual,
    accionPorChica: { ...(estado.accionPorChica || {}) },
    outfitActual: estado.outfitActual ? { ...estado.outfitActual } : null,
    mensajesCount: estado.mensajesCount || 0,
    nombreUsuario: estado.nombreUsuario,
    hechos: [...(estado.hechos || [])],
    historial: estado.historial.map(h => ({ ...h })),
    resumenConversacion: estado.resumenConversacion || '',
    ultimoMensajeUsuario: estado.ultimoMensajeUsuario,
    ropaPorChica: ropaCopy
  };
}

/** Restaura un estado completo guardado (Memorias). No toca keyIndex. */
export function restaurarEstadoCompleto(snap) {
  if (!snap || typeof snap !== 'object') throw new Error('Snapshot inválido');
  estado.chica = snap.chica || null;
  estado.chicasActivas = Array.isArray(snap.chicasActivas) ? [...snap.chicasActivas] : (snap.chica ? [snap.chica] : []);
  estado.fase = snap.fase || FASE.NORMAL;
  estado.ubicacion = snap.ubicacion || null;
  estado.relacion = snap.relacion || RELACION.DESCONOCIDA;
  estado.modo = snap.modo || 'libre';
  estado.historiaId = snap.historiaId || null;
  estado.eventosDisparados = Array.isArray(snap.eventosDisparados) ? [...snap.eventosDisparados] : [];
  estado.eventoPendienteReaccion = snap.eventoPendienteReaccion || null;
  estado.accionActual = snap.accionActual || null;
  estado.accionPorChica = (snap.accionPorChica && typeof snap.accionPorChica === 'object') ? { ...snap.accionPorChica } : {};
  estado.outfitActual = snap.outfitActual ? { ...snap.outfitActual } : null;
  estado.mensajesCount = snap.mensajesCount || 0;
  if (snap.nombreUsuario) estado.nombreUsuario = snap.nombreUsuario;
  estado.hechos = Array.isArray(snap.hechos) ? [...snap.hechos] : [];
  estado.historial = Array.isArray(snap.historial) ? snap.historial.map(h => ({ ...h })) : [];
  estado.resumenConversacion = snap.resumenConversacion || '';
  estado.ultimoMensajeUsuario = snap.ultimoMensajeUsuario || null;
  estado.ropaPorChica = {};
  if (snap.ropaPorChica && typeof snap.ropaPorChica === 'object') {
    for (const [k, v] of Object.entries(snap.ropaPorChica)) {
      estado.ropaPorChica[k] = { ...v };
    }
  }
  log('Estado restaurado desde Memoria', {
    chica: estado.chica,
    fase: estado.fase,
    relacion: estado.relacion,
    msgs: estado.historial.length,
    ropa: estado.ropaPorChica
  });
  return getEstado();
}

export function setNombreUsuario(nombre) { if (nombre && nombre.trim()) estado.nombreUsuario = nombre.trim(); }
export function getNombreUsuario() { return estado.nombreUsuario; }


export async function iniciarChatLasCinco() {
  const lasCinco = ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki'];
  estado.chica = 'Nino';
  estado.chicasActivas = [...lasCinco];
  estado.historial = [];
  estado.resumenConversacion = '';
  estado.fase = FASE.NORMAL;
  estado.ubicacion = null;
  estado.hechos = [];
  estado.modo = 'multi5';
  estado.historiaId = null;
  estado.eventosDisparados = [];
  estado.eventoPendienteReaccion = null;
  estado.outfitActual = null;
  estado.accionActual = null;
  estado.accionPorChica = {};
  estado.relacion = RELACION.DESCONOCIDA;
  estado.relacionPorChica = {};
  estado.vinculosNPC = {};
  estado.corridas = [];
  estado.corridasCountPorChica = {};
  estado.ultimaCorrida = null;
  estado._corridaMsgFirma = '';
  estado._corridaMsgDone = false;
  estado.mensajesCount = 0;
  estado.ultimoMensajeUsuario = null;
  estado.ropaPorChica = {};
  estado.resumenConversacion = 'Modo: chat con las 5.\nPresentes: Ichika, Nino, Miku, Yotsuba, Itsuki.\nMensaje inicial: están las cinco juntas; el usuario puede escribir y ellas responden cada una con su estilo.';
  log('Chat con las 5 iniciado');
  return {
    chica: 'Nino',
    chicasActivas: [...lasCinco],
    fase: estado.fase,
    relacion: estado.relacion,
    partes: [{
      chica: 'Sistema',
      texto: 'Están las cinco: Ichika, Nino, Miku, Yotsuba e Itsuki. Escribí y ellas responden (cada una con su estilo).',
      imagenUrl: '',
      audioUrl: '',
      descripcionImg: '',
      imagen_tag: 'hablando'
    }]
  };
}

export function iniciarChatLibre(chica) {
  if (!existeChica(chica)) throw new Error('Chica no existe');
  estado.chica = chica;
  estado.chicasActivas = [chica];
  estado.fase = FASE.NORMAL;
  estado.ubicacion = null;
  estado.historial = [];
  estado.resumenConversacion = '';
  estado.hechos = [];
  estado.modo = 'libre';
  estado.historiaId = null;
  estado.eventosDisparados = [];
  estado.eventoPendienteReaccion = null;
  estado.outfitActual = null;
  estado.accionActual = null;
  estado.accionPorChica = {};
  estado.relacion = RELACION.DESCONOCIDA;
  estado.relacionPorChica = {};
  estado.vinculosNPC = {};
  estado.corridas = [];
  estado.corridasCountPorChica = {};
  estado.ultimaCorrida = null;
  estado._corridaMsgFirma = '';
  estado._corridaMsgDone = false;
  estado.mensajesCount = 0;
  estado.ultimoMensajeUsuario = null;
  estado.ropaPorChica[chica] = { actual: 'desconocida', anterior: null, tagActual: null, tagAnterior: null };
  log('Chat libre iniciado', { chica, usuario: estado.nombreUsuario, relacion: estado.relacion, ropa: 'desconocida' });
}

export function iniciarHistoria(chica, historiaId) {
  if (!existeChica(chica)) throw new Error('Chica no existe');
  const h = getHistoria(chica, historiaId);
  if (!h) throw new Error('Historia no existe');
  estado.chica = chica;
  estado.chicasActivas = [chica];
  estado.fase = FASE.NORMAL;
  estado.ubicacion = null;
  estado.historial = [];
  estado.resumenConversacion = '';
  estado.hechos = [];
  estado.modo = 'historia';
  estado.historiaId = historiaId;
  estado.eventosDisparados = [];
  estado.eventoPendienteReaccion = null;
  estado.outfitActual = null;
  estado.accionActual = null;
  estado.accionPorChica = {};
  estado.relacion = RELACION.CONOCIDA; // en historias ya se conocen un poco
  estado.relacionPorChica = { [chica]: RELACION.CONOCIDA };
  estado.vinculosNPC = {};
  estado.mensajesCount = 0;
  estado.ultimoMensajeUsuario = null;
  const texto = rellenarNombre(h.mensajeBienvenida, estado.nombreUsuario);
  estado.historial.push({ role: 'assistant', content: texto, chica });
  // Semilla del resumen progresivo con el mensaje de bienvenida (primer mensaje de la historia)
  const nombreHist = (h.nombre || historiaId || 'historia').toString();
  const extracto = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 420);
  estado.resumenConversacion = [
    `Historia: ${nombreHist}`,
    `Presentes: ${chica}`,
    `Relación inicial: ${estado.relacion}`,
    `Mensaje de bienvenida (${chica}): ${extracto}`
  ].join('\n');
  log('Resumen sembrado con bienvenida de historia:', nombreHist);
  // Imagen de bienvenida: preferir lo definido en historias.js (imagenBienvenida)
  const imgB = h.imagenBienvenida || null;
  const welcomeSexual = /chup|mamad|pija|verga|foll|coño|boxers|te saca la|en la boca/i.test(texto)
    || (imgB && imgB.tag && !/^hablando$/i.test(imgB.tag));
  if (welcomeSexual) estado.fase = FASE.INTIMO;

  let media = { url: '', audio: '', descripcion: '', tag: 'hablando' };
  if (imgB && (imgB.url || imgB.tag)) {
    if (imgB.tag) {
      media = resolverImagen(chica, imgB.tag, !welcomeSexual) || media;
    }
    // Overrides explícitos (mismo estilo que una entrada de imagenes.js)
    if (imgB.url) media.url = imgB.url;
    if (imgB.audio != null && imgB.audio !== '') media.audio = imgB.audio;
    if (imgB.descripcion) media.descripcion = imgB.descripcion;
    if (imgB.tag) media.tag = imgB.tag;
    log('Bienvenida historia: imagen desde historias.js', media.tag || imgB.url);
  } else {
    // Fallback legacy: inferir tag del texto
    let tagInferido = 'hablando';
    if (String(historiaId || '').includes('confesion')) tagInferido = 'hablando';
    else if (welcomeSexual) tagInferido = inferirTagFuerte(chica, texto, '', false) || 'hablando';
    else if (/beso|besarte|besando/i.test(texto)) tagInferido = normalizarTag(chica, 'besando', true) || 'hablando';
    media = resolverImagen(chica, tagInferido, !welcomeSexual);
    log('Bienvenida historia: tag inferido', media.tag);
  }

  if (media.descripcion) estado.outfitActual = { chica, tag: media.tag, descripcion: media.descripcion };
  if (media.tag && media.tag !== 'hablando') estado.accionActual = media.tag;
  return {
    texto, chica,
    imagenUrl: media.url,
    audioUrl: media.audio || '',
    descripcionImg: media.descripcion || '',
    imagen_tag: media.tag || 'hablando',
    fase: estado.fase,
    relacion: estado.relacion,
    ubicacion: estado.ubicacion
  };
}

export function setChica(nombre) { iniciarChatLibre(nombre); }

function esEscenaSex() {
  if (estado.fase === FASE.INTIMO) return true;
  const ultimos = estado.historial.slice(-6).map((h) => h.content || '').join(' ');
  return PATRON_SEXO.test(ultimos);
}


/** Distancia de edición (typos: ichiak → ichika). */
function distanciaLevenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const m = s.length;
  const n = t.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** ¿Token se parece a un nombre de personaje? (typos de 1–2 letras). */
function tokenPareceNombre(token, nombreCanonico) {
  const t = String(token || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const n = String(nombreCanonico || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!t || !n || t.length < 3) return false;
  if (t === n || t.includes(n) || n.includes(t)) return true;
  if (Math.abs(t.length - n.length) > 2) return false;
  const maxDist = n.length <= 4 ? 1 : 2;
  return distanciaLevenshtein(t, n) <= maxDist;
}

/** Corrige typos de nombres en el mensaje del usuario (ichiak→Ichika). */
function corregirTyposNombresEnMensaje(mensaje) {
  const raw = String(mensaje || '');
  if (!raw.trim()) return raw;
  const nombres = ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia', 'Aldo'];
  return raw.replace(/[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}/g, (tok) => {
    for (const nom of nombres) {
      if (tokenPareceNombre(tok, nom) && tok.toLowerCase() !== nom.toLowerCase()) {
        // preservar capitalización aproximada
        log('Typo nombre corregido:', tok, '→', nom);
        return nom;
      }
    }
    return tok;
  });
}

function detectarPersonajesEnContexto(textoUsuario) {
  const t = (textoUsuario || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const found = new Set(estado.chicasActivas);
  const tokens = t.split(/[^a-z0-9áéíóúñ]+/i).filter(Boolean);
  for (const n of TODOS) {
    const nl = n.toLowerCase();
    if (t.includes(nl)) { found.add(n); continue; }
    for (const tok of tokens) {
      if (tokenPareceNombre(tok, n)) { found.add(n); break; }
    }
  }
  if (/hermanas?|las cinco|todas las|las quintillizas/i.test(t)) {
    for (const n of TODAS_CHICAS) found.add(n);
  }
  return [...found].filter((n) => existePersonaje(n));
}


/** Añade hecho fijo sin duplicar; opcionalmente reemplaza hechos viejos de la misma “clave”. */
function addHechoFijo(h, claveReemplazo = null) {
  if (!h) return;
  if (!Array.isArray(estado.hechos)) estado.hechos = [];
  if (claveReemplazo) {
    const re = new RegExp(claveReemplazo, 'i');
    estado.hechos = estado.hechos.filter((x) => !re.test(String(x)));
  }
  if (!estado.hechos.includes(h)) {
    estado.hechos.push(h);
    log('Hecho fijo:', h);
  }
  estado.hechos = estado.hechos.slice(-24);
}

/**
 * Declaraciones explícitas del usuario sobre vínculos:
 * "Nino es mi novia", "Miku es la novia de Aldo"
 */
function aplicarDeclaracionesVinculoUsuario(mensajeUsuario) {
  const t = String(mensajeUsuario || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const chicas = ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia'];
  if (!estado.vinculosNPC) estado.vinculosNPC = {};

  // 1) Primero: "X es (la) novia de Aldo" (más específico)
  for (const c of chicas) {
    const cl = c.toLowerCase();
    const esNoviaAldo =
      new RegExp(`\\b${cl}\\s+es\\s+(la\\s+)?novia\\s+de\\s+aldo\\b`).test(t) ||
      new RegExp(`\\b${cl}\\s+novia\\s+de\\s+aldo\\b`).test(t) ||
      new RegExp(`\\bla\\s+novia\\s+de\\s+aldo\\s+es\\s+${cl}\\b`).test(t);
    if (esNoviaAldo) {
      estado.vinculosNPC.Aldo = `novio de ${c}`;
      // vínculo con usuario: no es novia de él
      if (getRelacionChica(c) === RELACION.NOVIA || getRelacionChica(c) === RELACION.SEXFRIEND) {
        setRelacionChica(c, RELACION.CONOCIDA);
      }
      addHechoFijo(`${c} es novia de Aldo (no del usuario)`, `${c} es novia`);
    }
  }

  // 2) "X es mi novia" (sin "de aldo")
  for (const c of chicas) {
    const cl = c.toLowerCase();
    const esMia =
      new RegExp(`\\b${cl}\\s+es\\s+mi\\s+novia\\b`).test(t) ||
      new RegExp(`\\bmi\\s+novia\\s+es\\s+${cl}\\b`).test(t) ||
      new RegExp(`\\b${cl}\\s+mi\\s+novia\\b`).test(t);
    // evitar falso positivo si en la misma frase es novia de aldo
    const esDeAldo = new RegExp(`\\b${cl}\\s+es\\s+(la\\s+)?novia\\s+de\\s+aldo\\b`).test(t);
    if (esMia && !esDeAldo) {
      setRelacionChica(c, RELACION.NOVIA);
      addHechoFijo(`${c} es novia del usuario (declarado)`, `${c} es novia del usuario`);
    }
    if (new RegExp(`\\b${cl}\\s+es\\s+mi\\s+sexfriend\\b|\\b${cl}\\s+sexfriend\\b`).test(t)) {
      setRelacionChica(c, RELACION.SEXFRIEND);
      addHechoFijo(`${c} es sexfriend del usuario (declarado)`);
    }
  }
}

/** Parsea “aldo folla a nino doggy y yo follo a miku en misionero con condon” */
function registrarHechosDesdeIntercambio(mensajeUsuario, respuestaBot = '') {
  const u = String(mensajeUsuario || '');
  const uLow = u.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const bLow = String(respuestaBot || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

  aplicarDeclaracionesVinculoUsuario(u);

  const chicas = ['ichika', 'nino', 'miku', 'yotsuba', 'itsuki', 'emilia'];
  const canon = (n) => {
    const x = String(n || '').toLowerCase();
    return ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia'].find((c) => c.toLowerCase() === x) || n;
  };

  function poseDeFragmento(frag) {
    const f = frag.toLowerCase();
    if (/doggy|doggystyle|a cuatro|perrito/.test(f)) return 'doggy';
    if (/misioner|misionero/.test(f)) return 'misionero';
    if (/cowgirl|vaquera|horcajadas/.test(f)) return 'cowgirl';
    if (/stand\s*fuck|standfuck|de pie/.test(f)) return 'standfuck';
    if (/chup|mamad|oral|bolas/.test(f)) return 'oral';
    if (/foll|penetr|cog/.test(f)) return 'sexo';
    return null;
  }

  // Partir por "y" / comas cuando hay varios actos
  const trozos = uLow.split(/\s+y\s+|(?<=[.!;])\s+/).map((s) => s.trim()).filter(Boolean);
  if (!trozos.length) trozos.push(uLow);

  for (const frag of trozos) {
    const pose = poseDeFragmento(frag);
    if (!pose) continue;
    const conCondon = /condon|condón|preservativo/.test(frag);
    // ¿Quién penetra?
    const aldoActua = /\baldo\b/.test(frag) && /\b(foll|penetr|cog|mete|doggy|mision)/.test(frag);
    const yoActuo = /\b(yo|follo|follare|follaré|me la follo|la follo)\b/.test(frag) ||
      (!aldoActua && /\b(follo|follando)\b/.test(frag));

    for (const cl of chicas) {
      if (!new RegExp(`\\b${cl}\\b`).test(frag)) continue;
      const C = canon(cl);
      const pareja = aldoActua && !yoActuo ? 'Aldo'
        : yoActuo || /\b(yo|follo)\b/.test(frag) ? 'usuario'
        : aldoActua ? 'Aldo' : 'usuario';
      // Si "aldo folla a nino" → pareja Aldo; "yo follo a miku" → usuario
      let par = 'usuario';
      if (/\baldo\b/.test(frag) && new RegExp(`(foll|penetr|cog).{0,20}${cl}|${cl}.{0,20}(foll|doggy|mision)`).test(frag) &&
          !new RegExp(`\\b(yo|follo a ${cl}|a ${cl}.*(yo|follo))`).test(frag)) {
        // aldo folla a X
        if (new RegExp(`aldo\\s+(foll|la folla|folla a)\\s+${cl}|foll\\w*\\s+a\\s+${cl}`).test(frag) && /\baldo\b/.test(frag)) {
          par = /\byo\b|\bfollo a\b/.test(frag) && new RegExp(`follo a ${cl}|a ${cl}`).test(frag) && !new RegExp(`aldo.*${cl}`).test(frag)
            ? 'usuario' : 'Aldo';
        }
      }
      if (new RegExp(`aldo\\s+folla\\s+a\\s+${cl}|aldo\\s+folla\\s+${cl}`).test(frag)) par = 'Aldo';
      if (new RegExp(`(yo\\s+)?follo\\s+a\\s+${cl}|a\\s+${cl}\\s+en\\s+`).test(frag) && !new RegExp(`aldo\\s+folla\\s+a\\s+${cl}`).test(frag)) {
        par = 'usuario';
      }
      // fragmento solo de una pareja
      if (new RegExp(`aldo\\s+folla\\s+a\\s+${cl}`).test(frag)) par = 'Aldo';
      if (new RegExp(`follo\\s+a\\s+${cl}`).test(frag)) par = 'usuario';

      const cond = conCondon ? ' con condón' : '';
      addHechoFijo(
        `${C} en ${pose} con ${par}${cond}`.replace(/\s+/g, ' ').trim(),
        `${C} en (doggy|misionero|cowgirl|standfuck|oral|sexo)`
      );
    }
  }

  // Facial / quitar condón genéricos
  if (/\b(saco|saque|saqué|quitar)\b.*\bcondon|\bsin condon\b/.test(uLow)) {
    addHechoFijo('Usuario se quitó / dejó de usar el condón');
  }
  const ch = estado.chica || 'la chica';
  if (/\b(me corro|me corrí|eyacul)\b/.test(uLow) && /\bcara|facial|rostro\b/.test(uLow)) {
    // a quién
    let target = ch;
    for (const cl of chicas) {
      if (new RegExp(`\\b${cl}\\b`).test(uLow)) { target = canon(cl); break; }
    }
    addHechoFijo(`Usuario se corrió en la cara de ${target}`, `se corrió en la cara`);
  }

  // Desde respuesta: poses por bloque implícito (si bot describe doggy de alguien)
  if (bLow) {
    for (const cl of chicas) {
      const C = canon(cl);
      if (!new RegExp(`\\b${cl}\\b`).test(bLow)) continue;
      // ventana simple: si menciona chica cerca de doggy/aldo
      if (new RegExp(`${cl}[\\s\\S]{0,120}(doggy|a cuatro|perrito)|(doggy|a cuatro)[\\s\\S]{0,80}${cl}`).test(bLow)) {
        const conAldo = /aldo/.test(bLow);
        // no pisar si ya hay hecho más preciso del usuario este turno
        const ya = (estado.hechos || []).some((h) => new RegExp(`${C} en doggy`).test(h));
        if (!ya) addHechoFijo(`${C} en doggy con ${conAldo ? 'Aldo' : 'usuario'}`, `${C} en doggy`);
      }
      if (new RegExp(`${cl}[\\s\\S]{0,120}misioner|misioner[\\s\\S]{0,80}${cl}`).test(bLow)) {
        const ya = (estado.hechos || []).some((h) => new RegExp(`${C} en misionero`).test(h));
        if (!ya) addHechoFijo(`${C} en misionero con usuario`, `${C} en misionero`);
      }
    }
  }
}



function getRelacionChica(chica) {
  const c = chica || estado.chica;
  if (!c) return RELACION.DESCONOCIDA;
  if (estado.relacionPorChica && estado.relacionPorChica[c]) return estado.relacionPorChica[c];
  if (c === estado.chica && estado.relacion) return estado.relacion;
  return RELACION.DESCONOCIDA;
}

function setRelacionChica(chica, rel) {
  if (!chica || !rel) return;
  if (!estado.relacionPorChica) estado.relacionPorChica = {};
  estado.relacionPorChica[chica] = rel;
  if (chica === estado.chica) estado.relacion = rel;
  log('Relacion', chica, '→', rel);
}

function textoMapaRelaciones() {
  const lines = [];
  const mapa = estado.relacionPorChica || {};
  const names = new Set([...(estado.chicasActivas || []), estado.chica].filter(Boolean));
  for (const n of names) lines.push(`${n}: ${getRelacionChica(n)}`);
  for (const [n, r] of Object.entries(mapa)) {
    if (!names.has(n)) lines.push(`${n}: ${r}`);
  }
  for (const [n, v] of Object.entries(estado.vinculosNPC || {})) {
    lines.push(`NPC ${n}: ${v}`);
  }
  return lines.length ? lines.join(' | ') : `(${estado.chica || '?'}: ${estado.relacion})`;
}

/** Normaliza etiqueta de relación de la IA. */
function normalizarEtiquetaRelacion(raw) {
  const t = String(raw || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (/novia|novio|pareja exclusiv/.test(t)) return RELACION.NOVIA;
  if (/sexfriend|sex friend|amigos con derechos|solo sexo/.test(t)) return RELACION.SEXFRIEND;
  if (/amiga|amigo|friends/.test(t)) return RELACION.AMIGA;
  if (/conocid/.test(t)) return RELACION.CONOCIDA;
  if (/desconoc/.test(t)) return RELACION.DESCONOCIDA;
  return null;
}

/**
 * Relación híbrida: la IA interpreta el vínculo; la lógica valida saltos.
 * Novia solo si ella aceptó; no subir solo porque el usuario lo pidió.
 */
async function actualizarRelacionAutomatica(mensajeUsuario, respuestaBot) {
  estado.mensajesCount = (estado.mensajesCount || 0) + 1;
  const m = String(mensajeUsuario || '');
  const r = String(respuestaBot || '');
  const mix = (m + ' ' + r).toLowerCase();
  const principal = estado.chica;

  if (principal && getRelacionChica(principal) === RELACION.DESCONOCIDA && estado.mensajesCount >= 3) {
    setRelacionChica(principal, RELACION.CONOCIDA);
  }

  const haySenal = /novia|novio|pareja|te amo|te quiero|sexfriend|amigos con derechos|solo sexo|relacion|relación|seamos|rechaz|no quiero|no todavía|no todavia|amigos\b|conocer|aldo|rompe|termin/i.test(mix)
    || estado.mensajesCount % 5 === 0;
  if (!haySenal) return;

  const presentes = [...new Set([...(estado.chicasActivas || []), principal].filter(Boolean))];
  const mapaActual = {};
  for (const c of presentes) mapaActual[c] = getRelacionChica(c);

  const system = `Clasificás VÍNCULOS en roleplay erótico multi.
El usuario (hombre) puede tener relación DISTINTA con cada chica.
NPCs (Aldo, etc.) pueden ser novios de una chica.

SOLO JSON:
{"relaciones":{"Nino":"desconocida|conocida|amiga|sexfriend|novia"},"vinculos_npc":{"Aldo":"novio de Ichika"},"motivo":"frase"}

Reglas:
- Clave por cada chica relevante.
- "novia" = novia DEL USUARIO, solo si ESA chica aceptó ser novia de él.
- Si el usuario dice "Miku es la novia de Aldo" → vinculos_npc: {"Aldo":"novio de Miku"} y relaciones.Miku NO debe ser novia ni sexfriend del usuario solo por follar en intercambio.
- Sexo puntual en intercambio de parejas ≠ convertirla en sexfriend automáticamente.
- sexfriend = vínculo sexual habitual con el usuario sin ser pareja.
- No subir a novia solo porque él lo pidió.
- Respetá declaraciones explícitas del usuario sobre quién es novia de quién.`;

  const user = `Mapa actual: ${JSON.stringify(mapaActual)}
NPC: ${JSON.stringify(estado.vinculosNPC || {})}
Presentes: ${presentes.join(', ')}
Usuario: ${m.slice(0, 500)}
Respuesta: ${r.slice(0, 800)}
JSON:`;

  try {
    const raw = await llamarGroq(
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      {
        model: (typeof MODELO_TAGS !== 'undefined' && MODELO_TAGS) ? MODELO_TAGS : MODELO,
        temperature: 0.15,
        max_tokens: 250,
        proposito: 'clasificar-relacion-multi'
      }
    );
    let parsed = null;
    try {
      const j = String(raw || '').match(/\{[\s\S]*\}/);
      parsed = j ? JSON.parse(j[0]) : null;
    } catch (_) {}
    if (!parsed) return;

    const rels = parsed.relaciones || parsed.relations || {};
    for (const [nombre, val] of Object.entries(rels)) {
      const ch = TODAS_CHICAS.find((c) => c.toLowerCase() === String(nombre).toLowerCase());
      if (!ch) continue;
      const candidata = normalizarEtiquetaRelacion(val);
      if (!candidata) continue;
      const actual = getRelacionChica(ch);
      if (candidata === RELACION.NOVIA && (actual === RELACION.DESCONOCIDA || actual === RELACION.CONOCIDA)) {
        if (!/\b(s[ií]|acepto|está bien|esta bien|seamos novios|novios)\b/i.test(r)) {
          log('Novia bloqueada para', ch);
          continue;
        }
      }
      if (actual === RELACION.NOVIA && (candidata === RELACION.DESCONOCIDA || candidata === RELACION.CONOCIDA)) continue;
      // Si es novia de un NPC, no marcarla sexfriend/novia del usuario por un trío/intercambio
      const npcTxt = JSON.stringify(estado.vinculosNPC || {}).toLowerCase();
      if ((candidata === RELACION.SEXFRIEND || candidata === RELACION.NOVIA) &&
          npcTxt.includes(ch.toLowerCase()) && /novio de|novia de/.test(npcTxt)) {
        log('Relacion: no pisar vínculo NPC de', ch);
        continue;
      }
      if (candidata !== actual) {
        setRelacionChica(ch, candidata);
        const hecho = `Relación con ${ch} → ${candidata}`;
        if (!estado.hechos.includes(hecho)) {
          estado.hechos.push(hecho);
          estado.hechos = estado.hechos.slice(-20);
        }
      }
    }
    const npcs = parsed.vinculos_npc || parsed.vinculosNPC || {};
    if (npcs && typeof npcs === 'object') {
      estado.vinculosNPC = { ...(estado.vinculosNPC || {}), ...npcs };
    }
  } catch (e) {
    log('Relacion multi IA falló:', e?.message || e);
  }
}

function actualizarFaseYLugar(mensaje) {
  const m = mensaje.toLowerCase();
  const intencionLugar = clasificarIntencionLugar(mensaje);

  // Solo cambiar ubicacion si es ORDEN (no sugerencia)
  if (intencionLugar.tipo === 'orden' && intencionLugar.lugar) {
    const anterior = estado.ubicacion;
    estado.ubicacion = intencionLugar.lugar;
    if (anterior !== estado.ubicacion) {
      log('Lugar actualizado (orden):', anterior, '→', estado.ubicacion);
      if (PATRON_LUGAR_PRIVADO.test(m) || /hotel|motel|casa|habitaci/i.test(m)) {
        if (estado.fase === FASE.NORMAL) estado.fase = FASE.TRASLADO;
      }
    }
  } else if (intencionLugar.tipo === 'sugerencia') {
    log('Sugerencia de lugar detectada (NO se cambia ubicacion):', intencionLugar.lugar);
    // No tocamos estado.ubicacion
  }

  // Logica previa de fase privada (por si no entro por clasificarIntencionLugar)
  if ((estado.fase === FASE.NORMAL || estado.fase === FASE.TRASLADO) && PATRON_LUGAR_PRIVADO.test(m) && intencionLugar.tipo !== 'sugerencia') {
    estado.fase = FASE.TRASLADO;
    if (/hotel|motel/i.test(m)) estado.ubicacion = estado.ubicacion || 'hotel';
    else if (/casa|departamento|depto/i.test(m)) estado.ubicacion = estado.ubicacion || 'casa';
    else estado.ubicacion = estado.ubicacion || 'lugar privado';
  }
  if (estado.fase === FASE.LLEGADA) {
    if (PATRON_CONFIRMACION.test(m) && !/^no\b/i.test(m.trim())) estado.fase = FASE.INTIMO;
    else if (PATRON_NEGACION.test(m)) estado.fase = FASE.NORMAL;
  }
  if (estado.fase !== FASE.INTIMO && /chup|foll|met[eo]|cog|mam[ao]|mamad|lam[ei]|lamiendo|lamer|chupame|mamame|doggy|misioner|bola/i.test(m)) {
    estado.fase = FASE.INTIMO;
  }
}


/** Últimos N mensajes del historial local para mandar completos a la IA (además del resumen). */
function obtenerMensajesRecientesParaIA(n = ULTIMOS_MENSAJES_CONTEXTO) {
  const h = Array.isArray(estado.historial) ? estado.historial : [];
  if (!h.length || n <= 0) return [];
  const slice = h.slice(-n);
  return slice
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 2000) // tope por mensaje por tokens
    }));
}


function detectarPedidoAcelerado(mensajeUsuario) {
  const t = String(mensajeUsuario || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const relacion = /\b(novia|novio|novios|relacion|relación|seamos pareja|quiero que seamos|formemos una relacion|formemos una relación)\b/.test(t);
  const exposicion = /\b(muestrame|muéstrame|ensename|enséñame|levanta la falda|tu concha|tu coño|enseña el culo)\b/.test(t);
  const sexo = /\b(foll|cog[eé]|chup|mam[aá]|met[eé]|penetr|sex|oral|anal|doggy|standfuck)\b/.test(t);
  const publico = /\b(oficina|trabajo|pasillo|impresora|escritorio)\b/.test(t) ||
    /oficina|trabajo|pasillo/i.test(String(estado.ubicacion || ''));
  return { relacion, exposicion, sexo, publico };
}

function armarBloqueRitmoRelacion(mensajeUsuario) {
  const r = getRelacionChica(estado.chica) || estado.relacion || RELACION.DESCONOCIDA;
  const p = detectarPedidoAcelerado(mensajeUsuario);
  const lineas = [
    `RITMO SOCIAL (con ${estado.chica || '?'} = ${r}):`,
    `Mapa vínculos: ${textoMapaRelaciones()}`
  ];

  if (r === RELACION.DESCONOCIDA || r === RELACION.CONOCIDA) {
    lineas.push('- Apenas se conocen. Ninguna es "fácil".');
    if (p.relacion) lineas.push('- Pidió NOVIAZGO muy pronto → RECHAZO firme; puede dejar puerta a conocerse despacio.');
    if (p.sexo || p.exposicion) lineas.push('- Pidió SEXO/exposición muy pronto → RECHAZO claro.');
    if (p.publico && (p.sexo || p.exposicion)) lineas.push('- Contexto trabajo/público → aún más inaceptable.');
    if (!p.relacion && !p.sexo && !p.exposicion) lineas.push('- Pedido normal: evaluadora, sin abrirse de golpe.');
  } else if (r === RELACION.AMIGA) {
    lineas.push('- Amigos: coqueteo OK; sexo no automático.');
    if (p.relacion) lineas.push('- Noviazgo: puede dudar, pedir tiempo o aceptar según química.');
    if (p.sexo && p.publico) lineas.push('- Sexo en público: rechazar el lugar, no necesariamente a la persona.');
    else if (p.sexo) lineas.push('- Puede aceptar sexo si hay tensión, o frenar con estilo.');
  } else if (r === RELACION.SEXFRIEND) {
    lineas.push('- Sexfriends: sexo natural en el vínculo.');
    if (p.relacion) lineas.push('- Noviazgo: puede aceptar, dudar o seguir como sexfriends.');
    if (p.publico && p.sexo) lineas.push('- En público: discreción ("aquí no").');
  } else if (r === RELACION.NOVIA) {
    lineas.push('- Novios: cariño y sexo naturales; puede negar momento/lugar, no el vínculo entero.');
  }
  return lineas.join('\n');
}

function construirContexto(mensajeUsuarioActual = '') {
  const lineas = [
    `Fase: ${estado.fase}`,
    `Relacion principal (${estado.chica || '?'}): ${typeof getRelacionChica === 'function' ? getRelacionChica(estado.chica) : estado.relacion}`,
    `Mapa de relaciones: ${typeof textoMapaRelaciones === 'function' ? textoMapaRelaciones() : estado.relacion}`,
    'Usuario = HOMBRE (pija y bolas). Las chicas = MUJERES (sin pija ni testículos).',
    'GÉNERO: PROHIBIDO que la chica hable como si tuviera pija o testículos. Las bolas/pija son del usuario.',
    `Chica principal: ${estado.chica}`,
    `Presentes: ${estado.chicasActivas.join(', ')}`
  ];
  if (estado.resumenConversacion && estado.resumenConversacion.trim()) {
    lineas.push('### MAPA DE ESCENA / RESUMEN (memoria; no contradigas hechos ni borres la acción en curso por un evento de celular)');
    lineas.push(estado.resumenConversacion.trim());
  }
  // Ritmo según relación (desconocidos ≠ sexfriends ≠ novios)
  try {
    lineas.push(armarBloqueRitmoRelacion(mensajeUsuarioActual));
  } catch (_) {}
  if (estado.ubicacion) {
    const lug = getLugar(estado.ubicacion);
    lineas.push(`Lugar actual: ${lug ? lug.nombre : estado.ubicacion}`);
    lineas.push('IMPORTANTE: Estan en este lugar. NO te teletransportes a otro sitio a menos que el usuario lo ordene claramente.');
  } else {
    lineas.push('Lugar actual: no definido (puede ser casa o calle).');
  }
  if (estado.fase === FASE.INTIMO) lineas.push('Escena íntima activa.');
  if (mensajeUsuarioActual && esSoloMuestra(mensajeUsuarioActual)) {
    lineas.push('⚠️ Usuario SOLO muestra la verga. Reaccioná. PROHIBIDO chupar. tag=usuario_muestra_su_verga.');
  }
  if (estado.ultimaEyaculacionRapida || estado.eyaculacionRapida) {
    const ch = estado.chica || '';
    if (CHICAS_ENOJO_RAPIDO.includes(ch)) {
      lineas.push('⚠️ eyaculacion_rapida=true. Se corrió MUY PRONTO (pocos turnos de sexo). ' + ch + ' DEBE molestarse / burlarse / exigir más según su personalidad. No lo ignores.');
    } else {
      lineas.push('eyaculacion_rapida=true (se corrió pronto). Reaccioná acorde a tu personalidad.');
    }
  } else if (estado.turnosEnSexo > 0) {
    lineas.push(`Turnos de sexo activo en esta escena: ${estado.turnosEnSexo}.`);
  }
  if (estado.hechos.length) {
    lineas.push('### HECHOS_FIJOS (no olvidar ni contradecir; si preguntan la posición u otros detalles, usá ESTO):');
    lineas.push(estado.hechos.slice(-16).map((h) => '- ' + h).join('\n'));
  }
  const bloqueCorridas = typeof textoCorridasParaContexto === 'function' ? textoCorridasParaContexto() : '';
  if (bloqueCorridas) {
    lineas.push('### CORRIDAS (quién, en quién, dónde, pose — no contradecir):');
    lineas.push(bloqueCorridas);
  }
  if (estado.outfitActual?.descripcion) lineas.push('OUTFIT: ' + estado.outfitActual.descripcion);
  if (estado.chica) {
    const ropa = getRopaChica(estado.chica);
    lineas.push(`Ropa actual de ${estado.chica}: ${ropa.actual}` + (ropa.anterior ? ` (antes: ${ropa.anterior})` : ''));
    if (ropa.actual === 'desnuda') {
      lineas.push('IMPORTANTE: Está DESNUDA. No digas que lleva tanga, bikini, vestido ni ropa. No inventes prendas.');
    } else if (ropa.actual === 'cosplay') {
      lineas.push('IMPORTANTE: Está en COSPLAY/disfraz. Describí el traje con detalle; no digas ropa de calle ni desnuda sin que el usuario lo pida.');
    }
  }
  if (estado.accionActual) {
    lineas.push('Acción/pose en curso (NO reinicies de cero): ' + estado.accionActual);
    lineas.push('CONTINUIDAD: si el usuario pide otra acción, TRANSICIONÁ desde la actual (ej. lamiendo glande → "chupa bolas" = dejás el glande y pasás a las bolas).');
  }

  // Emociones disponibles (info para la IA)
  const emos = listarEmociones(estado.chica);
  if (emos.length) lineas.push('Emociones posibles de ' + estado.chica + ': ' + emos.join(', '));

  return lineas.join('\n');
}

function extraerHechos() {
  if (estado.ubicacion) estado.hechos.push(`En ${estado.ubicacion}`);
  estado.hechos = [...new Set(estado.hechos)].slice(-12);
}

function enmascararKey(key) {
  const k = String(key || '');
  if (k.length < 12) return '(muy corta/vacía)';
  return k.slice(0, 7) + '…' + k.slice(-4);
}

async function llamarGroq(messages, opts = {}) {
  // Prioridad: localStorage (apiKeys) → fallback config.js (legacy)
  const keysLS = getGroqKeyStrings();
  const keysConfig = Array.isArray(GROQ_KEYS) ? GROQ_KEYS.filter((k) => k && !String(k).includes('TU_KEY')) : [];
  const KEYS = keysLS.length ? keysLS : keysConfig;
  const fuenteKeys = keysLS.length ? 'localStorage' : 'config.js';

  if (!KEYS.length) {
    throw new Error(
      'No hay API keys. Abrí 🔑 APIs, pegá tu key de Groq y guardala. ' +
      '(No uses config.js en el repo público.)'
    );
  }
  const model = opts.model || MODELO || 'llama-3.3-70b-versatile';
  const temperature = opts.temperature ?? 1.05;
  const max_tokens = opts.max_tokens ?? 2200;
  const proposito = opts.proposito || 'chat';
  let ultimoError = null;
  const totalKeys = KEYS.length;
  const intentosLog = [];

  console.log(
    `%c[Groq] Inicio llamada (${proposito}) | modelo=${model} | keys=${totalKeys} (${fuenteKeys}) | keyIndex actual=${estado.keyIndex}`,
    'color:#38bdf8;font-weight:bold'
  );

  for (let i = 0; i < totalKeys; i++) {
    const ordenAbsoluto = (estado.keyIndex + i) % totalKeys; // 0-based en el array
    const numeroOrden = ordenAbsoluto + 1; // 1-based para humanos
    const key = KEYS[ordenAbsoluto];
    const mascara = enmascararKey(key);

    if (!key || !String(key).trim() || String(key).includes('TU_KEY') || String(key).includes('YOUR_KEY') || String(key).includes('gsk_xxx')) {
      const msg = `Key #${numeroOrden}/${totalKeys} (${mascara}) SALTADA: placeholder o vacía`;
      intentosLog.push(msg);
      console.warn('%c[Groq] ' + msg, 'color:#fbbf24');
      continue;
    }

    try {
      console.log(
        `%c[Groq] Probando key #${numeroOrden}/${totalKeys} → ${mascara} (${proposito})`,
        'color:#a78bfa'
      );
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          top_p: 0.95,
          max_tokens,
          ...(opts.reasoning_effort ? { reasoning_effort: opts.reasoning_effort } : {}),
          ...(opts.reasoning_format ? { reasoning_format: opts.reasoning_format } : {})
        })
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        const errMsg = `Groq ${res.status}: ${body}`;
        intentosLog.push(`Key #${numeroOrden}/${totalKeys} (${mascara}) FALLÓ → ${res.status}`);
        console.error(
          `%c[Groq] ✗ Key #${numeroOrden}/${totalKeys} FALLÓ | ${mascara} | status=${res.status}`,
          'color:#f87171;font-weight:bold',
          body
        );
        throw new Error(errMsg);
      }
      const data = await res.json();
      estado.keyIndex = ordenAbsoluto;
      intentosLog.push(`Key #${numeroOrden}/${totalKeys} (${mascara}) OK`);
      console.log(
        `%c[Groq] ✓ Key #${numeroOrden}/${totalKeys} OK | ${mascara} | modelo=${model} | (${proposito})`,
        'color:#34d399;font-weight:bold'
      );
      return data.choices?.[0]?.message?.content || '';
    } catch (e) {
      ultimoError = e;
      if (!String(e?.message || '').startsWith('Groq ')) {
        intentosLog.push(`Key #${numeroOrden}/${totalKeys} (${mascara}) ERROR RED → ${e.message}`);
        console.error(
          `%c[Groq] ✗ Key #${numeroOrden}/${totalKeys} ERROR DE RED/OTRO | ${mascara}`,
          'color:#f87171;font-weight:bold',
          e
        );
      }
    }
  }

  console.error(
    '%c[Groq] ===== TODAS LAS KEYS FALLARON =====',
    'color:#f87171;font-weight:bold;font-size:13px'
  );
  intentosLog.forEach((l, idx) => console.error(`  ${idx + 1}. ${l}`));
  console.error(
    `%c[Groq] Resumen: ${totalKeys} key(s) (${fuenteKeys}) | propósito=${proposito} | modelo=${model}`,
    'color:#f87171'
  );
  throw ultimoError || new Error('Falló la API (todas las keys)');
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
    // Obligatorio definir lado: izquierda, derecha o ambas
    if (/\b(izquierda|izq|lado izquierdo)\b/.test(t) && !/\b(derecha|ambas|los dos)\b/.test(t)) {
      return { tagHint: ['chupando_bola_izquierda', 'bola_izquierda', 'bolas_izquierda'], label: 'oral_bola_izquierda' };
    }
    if (/\b(derecha|der|lado derecho)\b/.test(t) && !/\b(izquierda|ambas|los dos)\b/.test(t)) {
      return { tagHint: ['chupando_bola_derecha', 'bola_derecha', 'bolas_derecha'], label: 'oral_bola_derecha' };
    }
    if (/\b(ambas|los dos|las dos|las dos bolas)\b/.test(t) || (/\bbolas\b/.test(t) && !/\b(izquierda|derecha|izq|der)\b/.test(t))) {
      return { tagHint: ['chupando_bolas', 'chupando_bola', 'bolas', 'lamiendo_bolas'], label: 'oral_bolas_ambas' };
    }
    // "chupame la bola" sin lado → el selector debe elegir un lado concreto
    return {
      tagHint: ['chupando_bola_izquierda', 'chupando_bola_derecha', 'chupando_bolas'],
      label: 'oral_bolas_definir_lado'
    };
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
  if (!tags.length || !claves?.length) return null;
  const claveJoin = claves.map((c) => String(c).toLowerCase()).join(' ');
  const permiteMeta = /porno|grabar|filmar|camara|c[aá]mara|video|tape/.test(claveJoin);
  const scored = [];
  for (const c of claves) {
    const cl = String(c || '').toLowerCase();
    if (!cl) continue;
    for (const k of tags) {
      const kl = String(k).toLowerCase();
      let score = 0;
      if (kl === cl) score = 100;
      else if (kl.startsWith(cl + '_') || kl.endsWith('_' + cl)) score = 85;
      else if (kl.includes(cl)) score = Math.max(15, 55 - Math.floor(kl.length / 4));
      else continue;
      // Penalizar tags meta (porno/cámara) si el contexto no lo pide
      if (!permiteMeta && /grabando|porno|c[aá]mara|camera|film|tape|video_sex|sex_tape/.test(kl)) {
        score -= 60;
      }
      // Preferir doggystyle/misionero limpios sobre compuestos raros
      if (/^(doggystyle|doggy|misionero|cowgirl|standfuck|chupando_todo_el_pene|follando)$/i.test(kl)) {
        score += 10;
      }
      scored.push({ k, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  if (scored.length && scored[0].score >= 20) return scored[0].k;
  return null;
}


/**
 * Selector de tag con Qwen (sistema principal).
 * Recibe mensaje usuario + texto de la chica + tags reales de imagenes.js + ropa.
 * Devuelve el tag más coherente.
 */

/** ¿El usuario es quien se corre? (no Aldo ni otro NPC) */
function mensajeEsCorridaDelUsuario(mensaje) {
  const m = String(mensaje || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!m.trim()) return false;
  // Corrida de otro personaje (Aldo, etc.) → NO es del usuario
  if (/\b(aldo|el|otro)\s+se\s+corr/.test(m)) return false;
  if (/\bse\s+corre\s+(en|sobre|dentro|a)\b/.test(m) && !/\b(me\s+corro|me\s+vine|eyacul[oó]|acabo)\b/.test(m)) {
    // "se corre en la boca de ichika" sin "me corro" → no es el usuario
    if (!/\bme\s+corr/.test(m)) return false;
  }
  return /\b(me\s*corro|me\s*vine|eyacul[oó]|me\s*sal[ií][oó]|acabo|cum\b|me\s*corr[ií])\b/.test(m);
}

/** ¿El mensaje describe una acción sexual entre otros (NPC→NPC), no del usuario? */
function mensajeEsAccionEntreOtros(mensaje) {
  const m = String(mensaje || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!m.trim()) return false;
  // Ej: "aldo se corre en la boca de ichika", "miku está follando con aldo"
  const actores = ['aldo', 'ichika', 'nino', 'miku', 'yotsuba', 'itsuki', 'emilia'];
  const mencionaActor = actores.some((a) => m.includes(a));
  if (!mencionaActor) return false;
  if (mensajeEsCorridaDelUsuario(mensaje)) return false;
  // Acción sexual narrada sin que el usuario sea el sujeto
  if (/\b(se\s+corre|se\s+la\s+chupa|follando|chupando|mamando|penetr)\b/.test(m)) {
    // Si el sujeto es claramente otro
    if (/\b(aldo|ichika|nino|miku|yotsuba|itsuki|emilia)\b/.test(m) && !/\b(me\s+corro|te\s+la\s+meto|te\s+foll)\b/.test(m)) {
      return true;
    }
  }
  return false;
}

/**
 * Continuidad de corrida SOLO si:
 * - el USUARIO es quien se corre, y
 * - esta chica es con quien está el usuario ahora (chica principal o nombrada en el mensaje).
 * No aplicar si el acto es de Aldo/otros sobre otra chica.
 */
function debeAplicarContinuidadCorrida(chica, mensajeUsuario) {
  if (!mensajeEsCorridaDelUsuario(mensajeUsuario)) return false;
  if (mensajeEsAccionEntreOtros(mensajeUsuario)) return false;
  const m = String(mensajeUsuario || '').toLowerCase();
  const nombre = String(chica || '').toLowerCase();
  // Si nombra explícitamente a esta chica → sí
  if (nombre && m.includes(nombre)) return true;
  // Mensaje corto tipo "me corro" / "me corro en la cara" → solo la chica principal del chat
  if (estado.chica && String(estado.chica).toLowerCase() === nombre) return true;
  return false;
}


/**
 * Extrae del mensaje del usuario la parte que afecta a ESTA chica.
 * Evita que "doggy a Nino + dedos a Miku" le ponga doggy también a Miku.
 */
function extractAccionRelevanteParaChica(chica, mensajeUsuario, otrasChicas = []) {
  const msg = String(mensajeUsuario || '').trim();
  if (!msg) return msg;
  const nombre = String(chica || '').toLowerCase();
  if (!nombre) return msg;

  const todas = ['ichika', 'nino', 'miku', 'yotsuba', 'itsuki', 'emilia'];
  const msgLow = msg.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const meNombran = msgLow.includes(nombre);
  const otrasNombradas = todas.filter((t) => t !== nombre && msgLow.includes(t));

  // El usuario solo nombra a OTRA(s) chica(s), no a esta → NO heredar el acto
  if (!meNombran && otrasNombradas.length >= 1) {
    return (
      `SIN_ACCION_PARA_${chica.toUpperCase()}. ` +
      `El usuario actúa solo con: ${otrasNombradas.join(', ')}. ` +
      `${chica} NO está en el acto. PROHIBIDO tag de follar/doggy/aire/oral. ` +
      `Solo reacción (celos, mirar, hablar) → preferí hablando/enojada/sonrojada.`
    );
  }

  // Varias chicas en el mensaje incluyendo a esta: partir por "mientras"
  if (meNombran && otrasNombradas.length >= 1) {
    const trozos = msg.split(
      /\s*(?:\bmientras(?:\s+que)?\b|\bal\s+mismo\s+tiempo\b|\ba\s+la\s+vez\b|(?<=[.!?;])\s+)/i
    ).map((t) => t.trim()).filter(Boolean);
    const conElla = trozos.filter((t) => t.toLowerCase().includes(nombre));
    if (conElla.length) return conElla.join(' | ').slice(0, 500);
  }

  // Solo ella (o nadie por nombre): mensaje completo
  return msg;
}



/**
 * Detecta pose sexual EN CURSO en el texto (no mera invitación/preparación).
 * La decisión fina la hace Qwen; esto solo evita forzar doggy por "por detrás" sin acto.
 */
function detectarPoseSexualEnTexto(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!t) return null;
  // Acto consumado / en curso (no solo ofrecer pose)
  const actoEnCurso = /\b(foll|penetr|me penetra|te penetra|lo siento dentro|metiend|meti[eé]nd|la tiene dentro|coge|cogiend|embestida|ritmo de (las )?embest|chup[aá]nd|mamand|mamánd|deepthroat|ordenand|ordeñ)\b/.test(t);
  const soloInvita = /\b(acercate|acércate|quiero que me tomes|toma el control|ofrec|invit|prepar|cuando entremos|sin que (me )?hayas|esperando que)\b/.test(t)
    && !actoEnCurso;
  if (soloInvita) return null;
  if (!actoEnCurso && !/\b(chup|mamad|oral|doggy|mision|follando|dentro de m[ií])\b/.test(t)) return null;
  // Sin verbo de acto: no forzar penetración solo por "por detrás" / "culo" / "empuj"
  if (!actoEnCurso) {
    if (/\b(chup|mamad|oral|petera|en (la )?boca|deepthroat)\b/.test(t)) return 'chupando';
    return null;
  }
  if (/\b(doggy|doggystyle|a cuatro|perrito|por detras|por detrás|detras de|detrás de)\b/.test(t)) return 'doggy';
  if (/\b(misioner|misionero)\b/.test(t)) return 'misionero';
  if (/\b(vaquera|cowgirl|horcajadas|montand|montánd)\b/.test(t)) return 'cowgirl';
  if (/\b(stand\s*fuck|standfuck|de pie|contra la pared)\b/.test(t)) return 'standfuck';
  if (/\b(chup|mamad|oral|petera|en (la )?boca|deepthroat|lengua.*punta|lam.*glande)\b/.test(t) && !/\b(penetr|me penetra|embest)\b/.test(t)) {
    return 'chupando';
  }
  if (/\b(69)\b/.test(t)) return '69';
  return 'follando';
}

function resolverTagContinuidadChica(chica, textoBot, soloNoSex) {
  if (soloNoSex) return null;
  const pose = detectarPoseSexualEnTexto(textoBot);
  let prev = (estado.accionPorChica && estado.accionPorChica[chica]) || null;
  // Si el tag previo es meta (porno) y el texto no habla de grabar, ignorarlo
  if (prev && /grabando|porno|c[aá]mara|film/i.test(prev) && !/grabar|porno|c[aá]mara|film/i.test(String(textoBot || ''))) {
    prev = null;
  }
  // Prioridad: pose clara del texto → tag previo limpio → aliases
  const claves = [];
  if (pose === 'doggy') claves.push('doggystyle', 'doggy', prev || '');
  else if (pose === 'misionero') claves.push('misionero', prev || '');
  else if (pose === 'cowgirl') claves.push('cowgirl', 'vaquera', prev || '');
  else if (pose === 'chupando') claves.push('chupando_todo_el_pene', 'chupando', 'oral', prev || '');
  else if (pose) claves.push(pose, 'doggystyle', 'misionero', prev || '');
  if (prev && !/hablando|enojada|sonrojada|grabando|porno/i.test(prev)) {
    claves.unshift(prev);
  }
  // Desde hechos: "Nino en doggy con Aldo"
  const hechos = estado.hechos || [];
  for (let i = hechos.length - 1; i >= 0; i--) {
    const h = String(hechos[i]);
    if (!new RegExp(chica, 'i').test(h)) continue;
    if (/doggy/i.test(h)) { claves.unshift('doggystyle', 'doggy'); break; }
    if (/misionero/i.test(h)) { claves.unshift('misionero'); break; }
    if (/oral/i.test(h)) { claves.unshift('chupando_todo_el_pene', 'chupando'); break; }
  }
  const limpio = claves.filter(Boolean);
  if (!limpio.length) return null;
  let tag = buscarTagEnPack(chica, limpio, false);
  if (tag && /grabando|porno/i.test(tag) && !/grabar|porno/i.test(String(textoBot || ''))) {
    tag = buscarTagEnPack(chica, limpio.filter((c) => !/porno|grabar/i.test(c)).concat(['doggystyle', 'doggy', 'misionero', 'follando']), false);
  }
  if (!tag && pose === 'doggy') tag = normalizarTag(chica, 'doggystyle', false) || normalizarTag(chica, 'doggy', false);
  if (!tag && pose === 'misionero') tag = normalizarTag(chica, 'misionero', false);
  if (!tag && prev && !/grabando|porno|hablando/i.test(prev)) tag = normalizarTag(chica, prev, false);
  if (tag && /hablando/i.test(tag)) return null;
  if (tag && /grabando|porno/i.test(tag) && !/grabar|porno/i.test(String(textoBot || ''))) return null;
  return tag || null;
}

async function elegirTagConQwen(chica, mensajeUsuario, textoBot, soloNoSex = false, accionAnterior = null, opciones = {}) {
  const tags = soloNoSex ? listarTagsNoSex(chica) : listarTags(chica);
  if (!tags.length) return { tag: 'hablando', razon: 'sin_tags', fuente: 'qwen' };

  const ropa = getRopaChica(chica);
  const listaTags = tags.join(', ');
  const otrasChicas = opciones.otrasChicas || [];
  const msgCompleto = String(mensajeUsuario || '').trim();
  // En multi: solo la parte del mensaje que afecta a ESTA chica
  const msg = extractAccionRelevanteParaChica(chica, msgCompleto, otrasChicas) || msgCompleto;
  if (msg !== msgCompleto) {
    log('Tag foco por chica:', chica, '→', msg.slice(0, 120));
  }
  const sinAccionPropia = /SIN_ACCION_PARA_/i.test(msg);
  if (sinAccionPropia) {
    // Usuario no la nombró, pero puede SEGUIR en acto (Aldo la penetra) o tener pose previa
    const tagCont = resolverTagContinuidadChica(chica, textoBot, soloNoSex);
    if (tagCont) {
      log('Tag continuidad multi (sigue el acto):', chica, '→', tagCont);
      return { tag: tagCont, razon: 'continuidad_pose_o_previa', fuente: 'local_pose' };
    }
    const emocion = /enoj|celos|furios/i.test(String(textoBot || '')) ? 'enojada'
      : /sonroj|timid/i.test(String(textoBot || '')) ? 'sonrojada'
      : 'hablando';
    const tagSafe = normalizarTag(chica, emocion, true) || 'hablando';
    log('Tag forzado (sin acción ni pose sexual):', chica, '→', tagSafe);
    return { tag: tagSafe, razon: 'sin_accion_en_mensaje_usuario', fuente: 'local_multi' };
  }
  const msgLower = msg.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

  // ¿El usuario solo está diciendo que se corre? (mensaje corto de eyaculación)
  const soloCorriendose = /^(me\s*corro|me\s*vine|eyacul[oó]|me\s*sal[ií][oó]|acabo|cum|me\s*corr[ií]|ya\s*me\s*corr[ií]|me\s*corr[ií]\.?)$/i.test(msg.trim())
    || (/^(me\s*corro|eyacul|me\s*vine|acabo|cum)\b/.test(msgLower) && msg.length < 40 && !/assjob|titjob|paizuri|nalgas|tetas|boca|cara|culo|oral|handjob|paja|doggy|anal/.test(msgLower));

  // Mapa de familia de acción → preferencia de tag de corrida
  function familiaDeTag(tag) {
    const t = String(tag || '').toLowerCase();
    if (/assjob|entre.*nalga|frot.*culo|culo.?job/.test(t)) return 'assjob';
    if (/paizuri|titjob|tit.?job|tetas|entre.*tetas/.test(t)) return 'paizuri';
    if (/handjob|paja/.test(t)) return 'handjob';
    if (/chup|oral|mam|boca|deepthroat|69/.test(t)) return 'oral';
    if (/anal|ano/.test(t)) return 'anal';
    if (/doggy|mision|cowgirl|sidefuck|standfuck|follando|penetr/.test(t)) return 'penetracion';
    if (/cara|facial/.test(t)) return 'facial';
    return null;
  }

  function buscarTagCorridaParaFamilia(familia) {
    if (!familia) return null;
    const candidatos = tags.filter(t => /se_corre|usuario_se_corre|cumming|_cum|corrida|eyacul/.test(t.toLowerCase()));
    if (familia === 'assjob') {
      return candidatos.find(t => /assjob|nalga|culo.?job/.test(t.toLowerCase())) || null;
    }
    if (familia === 'paizuri') {
      return candidatos.find(t => /paizuri|titjob|tit.?job|tetas/.test(t.toLowerCase())) || null;
    }
    if (familia === 'handjob') {
      return candidatos.find(t => /handjob|paja/.test(t.toLowerCase())) || null;
    }
    if (familia === 'oral') {
      return candidatos.find(t => /boca|oral|chup|69/.test(t.toLowerCase())) || null;
    }
    if (familia === 'anal') {
      return candidatos.find(t => /anal/.test(t.toLowerCase())) || null;
    }
    if (familia === 'penetracion') {
      return candidatos.find(t => /doggy|mision|cowgirl|foll|penetr|creampie/.test(t.toLowerCase())) || null;
    }
    if (familia === 'facial') {
      return candidatos.find(t => /cara|facial/.test(t.toLowerCase())) || null;
    }
    return null;
  }

  // Continuidad de corrida SOLO si el USUARIO se corre CON ESTA chica (no si Aldo se corre en otra)
  const continuidadOk = debeAplicarContinuidadCorrida(chica, mensajeUsuario);
  const accionParaContinuar = continuidadOk ? accionAnterior : null;

  // CORRECCIÓN LOCAL PRIORITARIA: "me corro" + acción anterior de ESTA chica
  if (soloCorriendose && accionParaContinuar && continuidadOk) {
    const fam = familiaDeTag(accionParaContinuar);
    const tagCorrida = buscarTagCorridaParaFamilia(fam);
    if (tagCorrida) {
      log('Qwen override local (me corro + accionAnterior):', accionParaContinuar, '→', tagCorrida, '| chica=', chica);
      return {
        tag: normalizarTag(chica, tagCorrida, soloNoSex),
        razon: `local:me_corro+continidad(${accionParaContinuar}→${tagCorrida})`,
        fuente: 'qwen_local_override'
      };
    }
  }

  // Si el mensaje es acto entre otros (ej. Aldo→Ichika) y esta chica NO es la involucrada, no arrastrar tag sexual de continuidad
  const accionEntreOtros = mensajeEsAccionEntreOtros(mensajeUsuario);
  const chicaEnMensaje = String(mensajeUsuario || '').toLowerCase().includes(String(chica || '').toLowerCase());
  if (accionEntreOtros && !chicaEnMensaje && !mensajeEsCorridaDelUsuario(mensajeUsuario)) {
    // Nino mirando a Ichika+Aldo → reacción / hablando, no tag de corrida en su boca
    log('Tag: acto entre otros, chica no involucrada → sin continuidad sexual', chica);
  }

  const system = `Sos un selector de tags de imagen para roleplay erótico.
Se te da el mensaje del usuario, la respuesta de la chica, la ACCIÓN ANTERIOR, el estado de ropa y la lista REAL de tags disponibles.
Debés elegir UN solo tag de esa lista que mejor represente la escena.

Reglas estrictas (prioridad de arriba hacia abajo):
1) CONTINUIDAD DE CORRIDA: Solo si el USUARIO se corre y la ACCIÓN ANTERIOR es de ESTA misma chica. Si el mensaje dice que OTRO (ej. Aldo) se corre en otra chica, IGNORÁ la acción anterior y elegí según el mensaje actual.
2) Si el mensaje del usuario no la involucra PERO su RESPUESTA describe que sigue en un acto (Aldo la folla doggy, etc.), elegí el tag de ESA pose. Solo usá "hablando"/celos si su cuerpo NO está en un acto sexual en el texto.
3) Si el usuario menciona explícitamente otra zona (assjob, nalgas, tetas, boca, cara, etc.) sobre ESTA chica, ahí sí cambiá.
4) BOLAS: Si la escena es chupar/lamer bolas, el tag DEBE indicar lado: izquierda, derecha o ambas (chupando_bola_izquierda / chupando_bola_derecha / chupando_bolas). No uses un tag genérico de oral si hay tags de bola con lado.
5) SOLO podés elegir un tag que esté en la lista. No inventes tags.
6) Prestá atención a la zona del cuerpo y a QUIÉN recibe la acción.
7) MULTI: el "mensaje del usuario" que recibís puede estar REORTADO a ESTA chica. Elegí SOLO la acción de ${chica}. PROHIBIDO copiar doggy/oral/etc. de otra hermana si no le corresponde a ella.
7b) Si la RESPUESTA DE LA CHICA describe que ELLA sigue siendo penetrada / en doggy / misionero / oral EN CURSO (aunque el usuario hable de otra), elegí el tag de ESA pose. PROHIBIDO "hablando" solo porque también habla o tiene celos.
7c) "hablando" solo si NO hay acto sexual en curso en su cuerpo en este turno.
7d) INVITACIÓN / PREPARACIÓN vs ACTO (decisión contextual, no automática):
   - Si ella SOLO se posiciona, ofrece el cuerpo, invita ("acércate por detrás", "toma el control", "quiero que me tomes", se apoya en la cama, muestra el culo) PERO ni el usuario ni el texto describen penetración/follar/meter/chupar EN CURSO → NO elijas tags de penetración (doggystyle, misionero, standfuck, etc.).
   - En ese caso elegí el tag de la lista que mejor represente invitación, pose preparatoria, coqueteo o el más cercano NO penetrativo (según tags disponibles). Usá tu criterio según el texto.
   - Solo tags de penetración/oral activo si el acto YA está ocurriendo en el mensaje del usuario o en la respuesta como hecho consumado (la mete, folla, chupa, ritmo de embestidas, etc.).
7e) COSPLAY / CAMBIO DE LOOK (contextual):
   - Si el usuario pide cosplay/disfraz/uniforme O la ROPA ACTUAL es "cosplay", priorizá tags de la lista que reflejen ese look (cosplay, uniforme, colegiala, idol, etc.) cuando el turno sea vestirse o mostrar el traje — evitá "hablando" si hay mejor opción visual.
   - El tag exacto lo elegís según el texto (no hay un tag fijo obligatorio).
   - Si ya hay sexo en curso con el cosplay puesto, podés elegir tag sexual; si solo se están poniendo el traje, priorizá el look.
8) Respetá el estado de ropa: si está desnuda, NO elijas tags con tanga/bikini/ropa. Si está en cosplay, evitá desnuda total salvo que el acto lo pida.
9) Respondé SOLO con el nombre exacto del tag, sin comillas, sin explicación, sin JSON, sin pensar en voz alta.`;

  const user = `CHICA: ${chica}
ACCIÓN ANTERIOR (solo si aplica a ESTA chica y el usuario se corre): ${accionParaContinuar || 'ninguna — no arrastrar de otra chica/otra escena'}
ROPA ACTUAL: ${ropa.actual || 'desconocida'}
ROPA ANTERIOR: ${ropa.anterior || '—'}

ACCIÓN DEL USUARIO RELEVANTE PARA ${chica} (no uses acciones de otras chicas):
"""${msg.slice(0, 800)}"""

MENSAJE COMPLETO (solo contexto; el tag debe seguir la acción de ${chica}):
"""${msgCompleto.slice(0, 400)}"""

RESPUESTA DE LA CHICA:
"""${String(textoBot || '').slice(0, 1200)}"""

TAGS DISPONIBLES (elegí UNO exacto de esta lista):
${listaTags}

Pregunta guía: ¿el acto sexual ya está ocurriendo, o solo hay invitación/preparación de pose? Elegí el tag acorde.
Respondé solo el tag:`;

  try {
    // Desactivar thinking de Qwen3 en Groq (clave para que no mande <think>)
    const raw = await llamarGroq(
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      {
        model: (typeof MODELO_TAGS !== 'undefined' && MODELO_TAGS) ? MODELO_TAGS : 'qwen/qwen3.6-27b',
        temperature: 0.15,
        max_tokens: 60,
        reasoning_effort: 'none',
        reasoning_format: 'hidden',
        proposito: 'selector-tags (MODELO_TAGS)'
      }
    );

    // Parser robusto: quita <think>...</think> y basura
    let limpio = String(raw || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<\/?think>/gi, '')
      .replace(/^qwen\s*:?\s*/i, '')
      .trim();

    const lineas = limpio.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    let candidato = lineas.length ? lineas[lineas.length - 1] : limpio;
    candidato = candidato.replace(/^["'`]+|["'`]+$/g, '').replace(/^tag\s*[:=]\s*/i, '').trim();

    let tag = candidato.split(/[\s,;|]+/)[0].replace(/["'`]/g, '').trim();

    // Si no está en la lista, buscar coincidencia
    const tagsLower = tags.map(t => t.toLowerCase());
    if (!tagsLower.includes(tag.toLowerCase())) {
      const match = tags.find(t =>
        t.toLowerCase() === tag.toLowerCase() ||
        t.toLowerCase().includes(tag.toLowerCase()) ||
        tag.toLowerCase().includes(t.toLowerCase())
      );
      if (match) tag = match;
      else {
        const encontrado = tags.find(t => limpio.toLowerCase().includes(t.toLowerCase()));
        tag = encontrado || 'hablando';
      }
    }

    tag = normalizarTag(chica, tag, soloNoSex);

    // Si Qwen puso "hablando" pero sigue el sexo en el texto o había pose previa → corregir
    if (!soloNoSex && /hablando|enojada|sonrojada|celos/i.test(String(tag || ''))) {
      const alt = resolverTagContinuidadChica(chica, textoBot, soloNoSex);
      if (alt && !/hablando/i.test(alt)) {
        log('Tag corregido hablando→pose/prev:', tag, '→', alt);
        tag = alt;
      }
    }

    // Segunda corrección: solo si continuidad aplica a ESTA chica
    if (soloCorriendose && accionParaContinuar && continuidadOk) {
      const famAnterior = familiaDeTag(accionParaContinuar);
      const famElegida = familiaDeTag(tag);
      if (famAnterior && famElegida && famAnterior !== famElegida) {
        const corregido = buscarTagCorridaParaFamilia(famAnterior);
        if (corregido) {
          log('Qwen post-fix familia corrida:', tag, '→', corregido, `(anterior=${accionParaContinuar})`);
          tag = normalizarTag(chica, corregido, soloNoSex);
        }
      }
    }

    // Si acto es entre otros y esta chica no está en el mensaje, evitar tags de recibir corrida/oral
    if (accionEntreOtros && !chicaEnMensaje) {
      if (/se_corre|usuario_se_corre|cumming|corrida|facial|boca|oral|chupando/i.test(tag)) {
        const neutro = tags.find((t) => /^hablando$/i.test(t)) || tags.find((t) => /celos|mirando|enojada|hablando/i.test(t)) || 'hablando';
        log('Tag corregido: chica no involucrada en acto ajeno', tag, '→', neutro);
        tag = normalizarTag(chica, neutro, soloNoSex);
      }
    }

    if (soloNoSex) {
      const esMuestra = /usuario_muestra_su_verga|viendo_verga|ve_mi_verga|muestra_su_verga/i.test(tag);
      if (!esMuestra && esTagSex(tag)) tag = 'hablando';
    }

    if (tagIncompatibleConRopa(tag, ropa.actual)) {
      const alt = tags.find(t =>
        !tagIncompatibleConRopa(t, ropa.actual) &&
        (ropa.actual === 'desnuda' ? /desnuda|hablando|mostrando_culo_sin|culo(?!.*tanga)/.test(t) : true)
      );
      if (alt) {
        log('Qwen tag corregido por ropa:', tag, '→', alt);
        tag = alt;
      }
    }

    return { tag, razon: `qwen:${String(raw || '').slice(0, 80).replace(/\n/g, ' ')}`, fuente: 'qwen' };
  } catch (e) {
    console.error('%c[Qwen tag] Error (selector de tags / MODELO_TAGS)', 'color:#f87171;font-weight:bold', e);
    console.error('[Qwen tag] Revisá en el log [Groq] de arriba qué key # falló y el status (401 = API key inválida).');
    return { tag: 'hablando', razon: `qwen_error:${e.message}`, fuente: 'qwen_error' };
  }
}



/**
 * Qwen elige UNA imagen compartida (grupal / parejas / multi hombres) o "ninguno".
 * Solo se llama si hay 2+ personajes o el mensaje nombra varias chicas / aldo+chica.
 */
function detectarChicasEnTexto(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const todas = ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia'];
  const tokens = t.split(/[^a-z0-9áéíóúñ]+/i).filter(Boolean);
  return todas.filter((c) => {
    const cl = c.toLowerCase();
    if (t.includes(cl)) return true;
    return tokens.some((tok) => tokenPareceNombre(tok, c));
  });
}

function clasificarTamanoEscena(nChicas) {
  if (nChicas >= 5) return 'QUINTETO';
  if (nChicas === 4) return 'CUARTETO';
  if (nChicas === 3) return 'TRIO';
  if (nChicas === 2) return 'DUO';
  return 'INDIVIDUAL';
}

/** Normaliza texto a “slug” parecido a tags (espacios → _, sin acentos). */
function slugEscena(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Acciones clave del mensaje para no reusar un trío viejo (doggy vs standfuck vs anal). */
function accionesClaveMensaje(msg) {
  const t = String(msg || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const keys = [];
  if (/\bstand\s*fuck|standfuck|de pie|contra la pared\b/.test(t)) keys.push('standfuck');
  if (/\bdoggy|doggystyle|a cuatro\b/.test(t)) keys.push('doggy');
  if (/\banal\b|por el culo|en el culo\b/.test(t)) keys.push('anal');
  if (/\bdedo|concha|co[nñ]o|finger\b/.test(t)) keys.push('dedos');
  if (/\bmamada|chup|oral|blow\b/.test(t)) keys.push('oral');
  if (/\baire\b/.test(t)) keys.push('aire');
  if (/\bmision|misionero\b/.test(t)) keys.push('misionero');
  if (/\bcowgirl|vaquera\b/.test(t)) keys.push('cowgirl');
  return keys;
}

function chicasEnTagNombre(tag) {
  const tl = String(tag || '').toLowerCase();
  return ['ichika', 'nino', 'miku', 'yotsuba', 'itsuki', 'emilia'].filter((n) => tl.includes(n));
}

function tagCubreAcciones(tag, accionesMsg) {
  const tl = String(tag || '').toLowerCase();
  if (!accionesMsg.length) return true;
  const mapa = {
    standfuck: [/stand/, /de_pie/, /pared/],
    doggy: [/doggy/, /doggystyle/, /cuatro/],
    anal: [/anal/, /culo/],
    dedos: [/dedo/, /concha/, /coño/, /finger/],
    oral: [/mamada/, /chup/, /oral/, /blow/],
    aire: [/aire/],
    misionero: [/mision/],
    cowgirl: [/cowgirl/, /vaquera/]
  };
  let cubiertas = 0;
  for (const a of accionesMsg) {
    const pats = mapa[a] || [];
    if (pats.some((p) => p.test(tl))) cubiertas++;
  }
  if (accionesMsg.includes('standfuck') && /doggy/.test(tl) && !/stand/.test(tl)) return false;
  if (accionesMsg.includes('doggy') && /stand/.test(tl) && !/doggy/.test(tl)) return false;
  if (accionesMsg.includes('anal') && !/anal|culo/.test(tl) && accionesMsg.length >= 2) return false;
  // Si el mensaje NO pide dedos, un tag de "dedos en concha" no sirve
  if (!accionesMsg.includes('dedos') && /dedo|finger/.test(tl) && accionesMsg.length <= 2) return false;
  // Si el mensaje NO pide oral, no usar tag de mamada como escena completa
  if (!accionesMsg.includes('oral') && /mamada|chup|blow|oral/.test(tl) && accionesMsg.includes('doggy') && !/doggy/.test(tl)) return false;
  return cubiertas >= Math.ceil(accionesMsg.length * 0.85);
}

/** Parejas cruzadas (Aldo↔X, usuario↔Y): casi nunca hay imagen grupal genérica válida. */
function esParejasCruzadasOParalelas(mensajeUsuario) {
  const t = String(mensajeUsuario || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const aldo = /\baldo\b/.test(t) && /\b(foll|doggy|mision|penetr|cog)/.test(t);
  const yo = /\b(yo\s+follo|follo\s+a|a\s+mi\s+novia|ami\s+novia)\b/.test(t);
  return aldo && yo;
}

/** Match local estricto: mismos nombres (sin chicas de más), mismas acciones. */
function matchLocalEscenaCompartida(disponibles, mensajeUsuario, chicas) {
  if (!disponibles.length || chicas.length < 2) return null;
  const msg = String(mensajeUsuario || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const slugMsg = slugEscena(mensajeUsuario);
  const names = chicas.map((c) => c.toLowerCase());
  const accionesMsg = accionesClaveMensaje(mensajeUsuario);

  // Parejas cruzadas: solo match si el tag describe explícitamente esa estructura; si no, null
  if (esParejasCruzadasOParalelas(mensajeUsuario)) {
    log('Match LOCAL: escena parejas cruzadas — no forzar trío/grupal genérico');
    // Solo aceptar tags que mencionen aldo o "intercambio" y las mismas chicas sin extras
  }

  const candidatosOk = (e) => {
    if (!e.url) return false;
    const tl = e.tag.toLowerCase();
    const enTag = chicasEnTagNombre(tl);
    // PROHIBIDO: el tag nombra a una chica que NO está en la escena actual
    if (enTag.some((n) => !names.includes(n))) return false;
    // Debe cubrir al menos a todas las chicas de la escena (duo/trío real)
    if (names.some((n) => !tl.includes(n))) return false;
    if (!tagCubreAcciones(tl, accionesMsg)) return false;
    // Tag con "dedos" solo si el mensaje habla de dedos
    if (/dedo|finger/.test(tl) && !/dedo|concha|finger/.test(msg)) return false;
    // Parejas cruzadas: evitar tags tipo "mientras meto dedos a miku y ichika"
    if (esParejasCruzadasOParalelas(mensajeUsuario) && /mientras|dedo|miku/.test(tl) && !/aldo/.test(tl)) {
      return false;
    }
    return true;
  };

  // 0) Match slug casi exacto
  for (const e of disponibles) {
    if (!candidatosOk(e)) continue;
    const tl = e.tag.toLowerCase();
    if (slugMsg === tl || (slugMsg.length > 12 && (slugMsg.includes(tl) || tl.includes(slugMsg)))) {
      log('Match LOCAL exacto/slug:', e.tag);
      return e;
    }
  }

  // 1) Score estricto
  let best = null;
  let bestScore = -1;
  for (const e of disponibles) {
    if (!candidatosOk(e)) continue;
    const tl = e.tag.toLowerCase();
    let score = names.length * 15;
    for (const a of accionesMsg) {
      if (tl.includes(a) || (a === 'doggy' && /doggy/.test(tl)) || (a === 'dedos' && /dedo/.test(tl))) score += 12;
    }
    // Penalizar tags mucho más largos/complejos que el mensaje (trío viejo)
    const extra = chicasEnTagNombre(tl).length - names.length;
    if (extra > 0) score -= 40;
    if (/mientras/.test(tl) && !/mientras/.test(msg)) score -= 15;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  // Umbral alto: mejor individuales que imagen incorrecta
  if (best && bestScore >= 40) {
    log('Match LOCAL escena compartida:', best.tag, 'score=', bestScore, 'acciones=', accionesMsg.join(','));
    return best;
  }
  log('Match LOCAL: sin candidato estricto (score=' + bestScore + ')', 'acciones=', accionesMsg.join(','));
  return null;
}



/** Tags “fuertes”: vale la pena alinear el texto con la imagen. */
function tagPideRearme(tag) {
  const t = String(tag || '').toLowerCase();
  if (!t || t === 'hablando' || t === 'normal') return false;
  if (/enojada|alegre|triste|sonrojada|timida|seria|feliz|riendo|coqueta|nerviosa/.test(t) && !/foll|chup|mam|corro|semen|dedo|doggy|mision|cowgirl|anal|handjob|paja/.test(t)) {
    return false;
  }
  return true;
}

async function rearmarTextoSegunTag(chica, textoOriginal, tag, mensajeUsuario) {
  if (!tagPideRearme(tag)) return textoOriginal;
  const texto = String(textoOriginal || '').trim();
  if (texto.length < 20) return textoOriginal;

  const system = `Ajustás un párrafo de roleplay erótico para que coincida con el TAG de imagen.
Reglas:
1) Mantené la personalidad de ${chica} y el sentido del texto.
2) Incorporá de forma NATURAL lo que implica el tag (sin listar el nombre del tag).
3) NO contradigas al usuario ni inventes otra escena.
4) NO alargues mucho: mismo largo o un poco más.
5) PROHIBIDO frases telegráficas ("La pija. Ahora.", "Es mía." sueltos). Oraciones naturales; variá el tono.
6) Respondé SOLO el párrafo final, sin explicaciones.`;

  const user = `CHICA: ${chica}
TAG DE IMAGEN: ${tag}
MENSAJE DEL USUARIO: """${String(mensajeUsuario || '').slice(0, 400)}"""
TEXTO ACTUAL:
"""${texto.slice(0, 1200)}"""

Reescribí el texto alineado al tag:`;

  try {
    const raw = await llamarGroq(
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      {
        model: (typeof MODELO_TAGS !== 'undefined' && MODELO_TAGS) ? MODELO_TAGS : MODELO,
        temperature: 0.55,
        max_tokens: 500,
        reasoning_effort: 'none',
        reasoning_format: 'hidden',
        proposito: 'rearme-texto-segun-tag'
      }
    );
    let limpio = String(raw || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<\/?think>/gi, '')
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim();
    if (limpio.length < 15) return textoOriginal;
    log('Texto rearmado según tag', tag, '(' + limpio.length + ' chars)');
    return limpio;
  } catch (e) {
    log('Rearme texto falló, se deja original:', e?.message || e);
    return textoOriginal;
  }
}


async function elegirImagenCompartidaConQwen(mensajeUsuario, nombresBloques = []) {
  const disponibles = [
    ...listarGrupalesDisponibles(),
    ...listarParejasDisponibles(),
    ...listarMultiHombresDisponibles()
  ];
  if (!disponibles.length) {
    log('Imagen compartida: no hay escenas con URL en grupales/parejas/multi');
    return null;
  }

  const msg = String(mensajeUsuario || '').trim();
  // CRÍTICO: solo cuentan las chicas NOMBRADAS EN EL MENSAJE del usuario.
  // No usar bloques del turno (pueden responder hermanas que no están en la acción).
  const delMensaje = detectarChicasEnTexto(msg);
  const deBloques = [...new Set((nombresBloques || []).filter((n) => n && n !== 'Aldo' && n !== 'Sistema'))];
  const tamano = clasificarTamanoEscena(delMensaje.length);
  log('Escena compartida: chicasMsg=', delMensaje.join(','), 'bloques=', deBloques.join(','), '→', tamano);

  // Sin 2+ chicas en el mensaje → no hay imagen compartida (evita reusar trío anterior)
  if (delMensaje.length < 2 && !/\baldo\b/i.test(msg)) {
    log('Compartida: mensaje con <2 chicas → null (individuales)');
    return null;
  }

  // 1) Match local solo con chicas del MENSAJE
  const local = matchLocalEscenaCompartida(disponibles, msg, delMensaje);
  if (local && local.url) {
    return getGrupalPorTag(local.tag) || getParejaPorTag(local.tag) || getMultiHombresPorTag(local.tag) || local;
  }

  const lista = disponibles.map((e) => e.tag).join(', ');

  const system = `Sos un selector de IMAGEN DE ESCENA compartida para roleplay erótico multi.
El usuario describe una escena con VARIAS personas. Hay tags ya cargados.
Tipo de escena detectado: ${tamano} (${delMensaje.length || presentes.length} chicas nombradas: ${(delMensaje.length ? delMensaje : presentes).join(', ') || '?'}).

Debés elegir UN tag de la lista que represente TODA la escena, o "ninguno".

Reglas:
1) SOLO un tag exacto de la lista, o la palabra ninguno.
2) El tag debe cubrir TODAS las acciones distintas del mensaje (ej. standfuck + dedos + anal). Si el tag es doggy+dedos pero el usuario pidió standfuck y anal, respondé: ninguno.
3) NO reutilices un trío viejo solo porque coinciden los nombres.
4) Si es TRIO, preferí tags que nombren a ESAS chicas y LAS acciones correctas.
5) Si NINGÚN tag cubre la escena completa, respondé: ninguno (mejor individuales que imagen incorrecta).
6) NO inventes tags. SOLO el tag o ninguno.`;

  const user = `MENSAJE DEL USUARIO:
"""${msg.slice(0, 900)}"""

TIPO DE ESCENA: ${tamano}
CHICAS NOMBRADAS: ${(delMensaje.length ? delMensaje : presentes).join(', ') || '(ninguna)'}
PERSONAJES QUE RESPONDEN: ${deBloques.join(', ') || '(desconocido)'}

TAGS DE ESCENA DISPONIBLES (elegí UNO o ninguno):
${lista}

Respondé solo el tag o ninguno:`;

  try {
    const raw = await llamarGroq(
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      {
        model: (typeof MODELO_TAGS !== 'undefined' && MODELO_TAGS) ? MODELO_TAGS : 'qwen/qwen3.6-27b',
        temperature: 0.1,
        max_tokens: 80,
        reasoning_effort: 'none',
        reasoning_format: 'hidden',
        proposito: 'selector-escena-compartida (MODELO_TAGS)'
      }
    );

    let limpio = String(raw || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<\/?think>/gi, '')
      .trim();
    const lineas = limpio.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
    let candidato = (lineas.length ? lineas[lineas.length - 1] : limpio)
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^tag\s*[:=]\s*/i, '')
      .trim();
    let tag = candidato.split(/[\s,;|]+/)[0].replace(/["'`]/g, '').trim();

    if (!tag || /^ninguno$/i.test(tag) || /^none$/i.test(tag) || /^null$/i.test(tag)) {
      log('Qwen escena compartida → ninguno');
      return null;
    }

    // Resolver entrada completa
    let escena = getGrupalPorTag(tag) || getParejaPorTag(tag) || getMultiHombresPorTag(tag);
    if (!escena) {
      // fuzzy
      const low = tag.toLowerCase();
      const hit = disponibles.find((e) =>
        e.tag.toLowerCase() === low ||
        e.tag.toLowerCase().includes(low) ||
        low.includes(e.tag.toLowerCase())
      );
      if (hit) {
        escena = getGrupalPorTag(hit.tag) || getParejaPorTag(hit.tag) || getMultiHombresPorTag(hit.tag) || hit;
      }
    }
    if (!escena || !escena.url) {
      log('Qwen escena compartida tag no encontrado:', tag);
      return null;
    }
    log('Qwen escena compartida →', escena.tag, '(' + (escena.tipo || '?') + ')');
    return escena;
  } catch (e) {
    console.error('[Qwen escena compartida]', e);
    return null;
  }
}


/** TESTING ONLY — Motor Nakardas (ya no decide el tag real, solo se compara con la IA) */
function elegirTag(chica, tagModelo, textoBloque, textoUsuario, soloNoSex, intencionUsuario = null) {
  const ropa = getRopaChica(chica);
  const resultado = resolverTagEscena({
    chica,
    mensajeUsuario: textoUsuario || '',
    textoBot: textoBloque || '',
    tagModelo: tagModelo || '',
    soloNoSex: !!soloNoSex,
    accionAnterior: estado.accionActual,
    intencionUsuario: intencionUsuario || null,
    ropaActual: ropa.actual || null
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

  // Coherencia de ropa: si está desnuda, no usar tags de tanga/ropa
  if (tagIncompatibleConRopa(elegido, ropa.actual)) {
    const alt = listarTags(chica).find(t =>
      !tagIncompatibleConRopa(t, ropa.actual) &&
      (ropa.actual === 'desnuda' ? /desnuda|hablando|mostrando_culo_sin/.test(t) : true)
    );
    razon += `+ropa_incompatible(${ropa.actual}↛${elegido})`;
    if (alt) {
      elegido = alt;
      razon += `→${alt}`;
    } else if (ropa.actual === 'desnuda' && listarTags(chica).includes('desnuda')) {
      elegido = 'desnuda';
      razon += '→desnuda';
    }
    log('Tag corregido por ropa:', chica, razon);
  }
  return { elegido, razon, fuente: resultado.fuente || '', puntuacion: resultado.puntuacion || 0 };
}


/** Actualiza el resumen progresivo de la conversación (único contexto histórico enviado a la IA). */
async function actualizarResumenProgresivo(mensajeUsuario, respuestaBot) {
  const prev = (estado.resumenConversacion || '').trim();
  const presentes = (estado.chicasActivas || []).join(', ') || estado.chica || '?';
  const system = `Mantenés un MAPA DE ESCENA (resumen estructurado) de un roleplay erótico adulto.
Actualizá el resumen con el último intercambio. Respondé SOLO el resumen, sin título.

FORMATO OBLIGATORIO (las etiquetas en mayúsculas):
PRESENTES: (quiénes están en escena, incl. NPCs si aparecen)
ACCIONES: (quién hace qué ahora; ej. "Nino: oral en bolas; Ichika: mira con celos")
LUGAR: (sitio concreto)
ROPA_VISUAL: (ropa, cuerpo, objetos notables: condón, celular, falda, etc.)
RELACION: (por chica con el usuario, ej. Nino:novia; Miku:sexfriend; NPCs: Aldo novio de Ichika)
HECHOS: (acuerdos, rechazos, eventos de celular/foto, promesas; no borres hechos viejos importantes)
PENDIENTES: (lo que quedó a medias)
CLIMA: (charla | coqueteo | rechazo | sexo | after)
ARCO: (capítulo breve: ej. oficina | fiesta | VIP | post-sexo | día siguiente; qué quedó pendiente del arco)

Reglas:
- Máximo ~400 palabras, denso, tercera persona.
- ACCIONES = solo el estado AHORA (este turno): quién hace qué CON QUIÉN (ej. "Nino: doggy con Aldo; Miku: doggy con usuario + condón").
- HECHOS_FIJOS del sistema son sagrados. Copialos. NUNCA contradigas pose/pareja/condón/corridas.
- Si hay CORRIDAS en HECHOS_FIJOS/sistema, copialas tal cual. PROHIBIDO inventar corridas extra o contadores (#2 #3 #4) que no estén en el sistema.
- Si el resumen anterior tiene corridas inventadas que no están en HECHOS_FIJOS del sistema, elimínalas.
- RELACION: una entrada por chica con el USUARIO + NPCs (ej. "Aldo: novio de Miku"). Si Miku es novia de Aldo, NO la marques sexfriend/novia del usuario salvo que HECHOS_FIJOS lo digan.
- LUGAR: solo si está claro en el resumen anterior o el intercambio. Si no, "no definido". PROHIBIDO inventar café/oficina.
- No mezcles poses viejas de otra escena si el turno actual las reemplazó (preferí el hecho más reciente por chica+pose).
- Evento de celular: anotá en HECHOS sin borrar el sexo en curso.`;

  const hechosFijos = (estado.hechos || []).slice(-16).join('\n- ') || '(ninguno aún)';
  const user = `RESUMEN ANTERIOR:
${prev || '(vacío)'}

HECHOS_FIJOS DEL SISTEMA (NUNCA los borres, reescribas ni contradigas; copialos a HECHOS):
- ${hechosFijos}

ESTADO ACTUAL DEL SISTEMA:
Presentes sistema: ${presentes}
Relación sistema (mapa): ${typeof textoMapaRelaciones === 'function' ? textoMapaRelaciones() : estado.relacion}
Lugar sistema: ${estado.ubicacion || 'no definido'}
Acción tag: ${estado.accionActual || 'ninguna'}
Fase: ${estado.fase}
Corridas: ${typeof textoCorridasParaContexto === 'function' ? textoCorridasParaContexto() : '(n/a)'}

ÚLTIMO INTERCAMBIO:
Usuario: ${String(mensajeUsuario || '').slice(0, 700)}
Respuesta: ${String(respuestaBot || '').slice(0, 1100)}

Escribí el resumen actualizado en el FORMATO OBLIGATORIO.
Si el usuario pregunta qué posición usaron, la respuesta debe basarse en HECHOS_FIJOS (ej. misionero), NO inventar otra.`;

  try {
    const raw = await llamarGroq(
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      {
        model: (typeof MODELO_TAGS !== 'undefined' && MODELO_TAGS) ? MODELO_TAGS : MODELO,
        temperature: 0.25,
        max_tokens: 750,
        proposito: 'resumen-progresivo'
      }
    );
    const limpio = String(raw || '').trim();
    if (limpio && limpio.length > 30) {
      estado.resumenConversacion = limpio.slice(0, 3200);
      log('Resumen mapa escena (' + estado.resumenConversacion.length + ' chars)');
    }
  } catch (e) {
    const linea =
      `PRESENTES: ${presentes}\n` +
      `ACCIONES: ${estado.accionActual || 'charla'}\n` +
      `LUGAR: ${estado.ubicacion || '?'}\n` +
      `RELACION: ${estado.relacion}\n` +
      `HECHOS: Usuario: ${String(mensajeUsuario || '').slice(0, 100)} | Bot: ${String(respuestaBot || '').slice(0, 140)}\n` +
      `CLIMA: ${estado.fase === FASE.INTIMO ? 'sexo' : 'charla'}`;
    estado.resumenConversacion = (prev ? prev + '\n---\n' + linea : linea).slice(-2800);
    log('Resumen fallback local estructurado');
  }
}


/** Resuelve media de un evento de historia (tag y/o url). */
function resolverMediaEventoHistoria(chicaPrincipal, imagenCfg) {
  const cfg = imagenCfg || {};
  let media = { url: '', audio: '', descripcion: '', tag: cfg.tag || '' };
  if (cfg.tag) {
    try {
      media = resolverImagen(chicaPrincipal, cfg.tag, false) || media;
      media.tag = cfg.tag;
    } catch (_) {}
  }
  if (cfg.url) media.url = cfg.url;
  if (cfg.audio != null && cfg.audio !== '') media.audio = cfg.audio;
  if (cfg.descripcion) media.descripcion = cfg.descripcion;
  return media;
}

/**
 * Si estamos en historia y toca un evento en este nº de mensaje de usuario, lo devuelve y marca disparado.
 * numMensaje = mensajes del usuario en esta partida (1 = primer mensaje del usuario).
 */
function consumirEventoHistoriaSiToca(numMensaje) {
  if (estado.modo !== 'historia' || !estado.historiaId || !estado.chica) return null;
  let h;
  try {
    h = getHistoria(estado.chica, estado.historiaId);
  } catch (_) {
    return null;
  }
  if (!h || !Array.isArray(h.eventos) || !h.eventos.length) return null;

  const disparados = new Set(estado.eventosDisparados || []);
  for (const ev of h.eventos) {
    if (!ev || typeof ev.enMensaje !== 'number') continue;
    const eid = String(ev.id || `${estado.historiaId}_msg${ev.enMensaje}`);
    if (disparados.has(eid)) continue;
    if (ev.enMensaje !== numMensaje) continue;

    // Marcar como disparado
    estado.eventosDisparados = [...disparados, eid];
    // Anotar en resumen sin borrar acción en curso
    try {
      const nota = `HECHOS: evento ${eid} — ${String(ev.texto || '').slice(0, 180)}`;
      const prevR = (estado.resumenConversacion || '').trim();
      if (prevR && !prevR.includes(eid)) {
        estado.resumenConversacion = (prevR + '\n' + nota).slice(0, 3200);
      } else if (!prevR) {
        estado.resumenConversacion = nota;
      }
    } catch (_) {}
    const de = ev.de || 'Sistema';
    // Imagen del evento: resolver con la chica del evento (ej. Ichika), no la principal
    const media = resolverMediaEventoHistoria(de !== 'Sistema' ? de : estado.chica, ev.imagen);
    const texto = rellenarNombre(String(ev.texto || '').trim(), estado.nombreUsuario);
    log('Evento historia disparado:', eid, 'enMensaje=', numMensaje);
    return {
      id: eid,
      tipo: ev.tipo || 'evento',
      de,
      texto,
      forzarReaccion: !!ev.forzarReaccion,
      imagenUrl: media.url || '',
      audioUrl: media.audio || '',
      descripcionImg: media.descripcion || '',
      imagen_tag: media.tag || '',
      raw: ev
    };
  }
  return null;
}


export async function enviarMensaje(mensajeUsuario) {
  if (!estado.chica) throw new Error('Selecciona una chica primero');
  try { await ensureImagenesLoaded(); } catch (_) {}

  // Corregir typos de nombres (ichiak→Ichika) antes de todo
  mensajeUsuario = corregirTyposNombresEnMensaje(mensajeUsuario);
  estado.ultimoMensajeUsuario = mensajeUsuario;
  // Hechos fijos desde el mensaje del usuario (misionero, condón, etc.) antes de que la IA responda
  registrarHechosDesdeIntercambio(mensajeUsuario, '');
  procesarCorridasDelIntercambio(mensajeUsuario, '');

  // Nº de mensaje del usuario en esta partida (la bienvenida no cuenta)
  const numMensajeUsuario = (estado.mensajesCount || 0) + 1;
  const eventoHistoria = consumirEventoHistoriaSiToca(numMensajeUsuario);

  // Contador de sexo + flag eyaculación rápida (Nino/Ichika/Yotsuba)
  actualizarContadorSexoYEyaculacion(mensajeUsuario, estado.accionActual);

  const enContexto = detectarPersonajesEnContexto(mensajeUsuario);
  for (const n of enContexto) {
    if (!estado.chicasActivas.includes(n)) estado.chicasActivas.push(n);
  }
  actualizarFaseYLugar(mensajeUsuario);

  // Forzar estado de ropa desde lo que declara el usuario (ANTES de armar el prompt)
  const msgRopaLow = String(mensajeUsuario || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const ropaPlural = /\b(pónganse|ponganse|ponganse|vístanse|vistanse|todas)\b/.test(msgRopaLow)
    || /cosplay/.test(msgRopaLow);
  const targetsRopa = new Set();
  if (estado.chica) targetsRopa.add(estado.chica);
  if (ropaPlural) {
    for (const c of (estado.chicasActivas || [])) targetsRopa.add(c);
  }
  for (const c of ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia']) {
    if (msgRopaLow.includes(c.toLowerCase())) targetsRopa.add(c);
  }
  for (const c of targetsRopa) actualizarRopaDesdeMensajeUsuario(mensajeUsuario, c);

  const soloMuestraUsuario = esSoloMuestra(mensajeUsuario);
  const escenaSex = !soloMuestraUsuario && (esEscenaSex() || PATRON_SEXO.test(mensajeUsuario));
  const soloNoSex = !escenaSex;

  // Tags y descripciones visuales YA NO se mandan en la llamada principal (ahorro de tokens).
  // El tag real se elige después con elegirTagConQwen (segunda API call).
  // Lore deshabilitado temporalmente (standby) — ver README.
  const personalidad = getPersonalidad(estado.chica, estado.nombreUsuario);
  let system = armarSystemPrompt(personalidad, estado.nombreUsuario, construirContexto(mensajeUsuario), [], '', []);
  system += '\n\n## RECORDATORIO GÉNERO (este turno)\n';
  system += 'Usuario=HOMBRE (pija y bolas). Chica=MUJER. PROHIBIDO que ella diga "mi pija", "mis testículos", "me muevas la pija" o "me aprietes los testículos" como si fueran de ella. ';
  system += 'Si habla de pija/bolas, son LAS DEL USUARIO (te chupo la pija, tus bolas, etc.).\n';
  if (estado.accionActual) {
    system += `Acción previa en curso: ${estado.accionActual}. Si el usuario cambia de acción, transicioná desde ahí; no borres lo que estabas haciendo.\n`;
  }
  system += '\n## ESTILO DE ESCRITURA (NOVELA / ESCENA)\n';
  system += 'Escribí en PROSA NARRATIVA densa: mínimo 2–4 párrafos por personaje activo; más si el usuario da libertad, cambia de día/lugar o pide que continúes. ';
  system += 'Incluí lugar, luz, ropa/cuerpo, gestos, silencios, miradas y diálogo natural. Suena a ficción erótica bien escrita, no a chat corto. ';
  system += 'Si el usuario avanza el tiempo (mañana, oficina, fiesta, una semana), narrá el salto de escena con claridad. ';
  system += 'NPCs con voz propia. PROHIBIDO respuestas de 1–2 líneas en turnos de escena.\n';
  system += '\n## MEMORIA Y ARCO\n';
  system += 'Usá el MAPA DE ESCENA (PRESENTES, ACCIONES, HECHOS, CORRIDAS, RELACIONES). No inventes corridas ni contradigas HECHOS_FIJOS. ';
  system += 'Si hubo celular/foto, reaccioná pero no borres el acto o charla en curso. Recordá quién es novia de quién y con quién está cada una.\n';
  // Evento de historia EN ESTE TURNO: dos bloques de la chica + mensaje ajeno en el medio
  if (eventoHistoria && eventoHistoria.texto) {
    const de = eventoHistoria.de || 'Alguien';
    system += `\n\n## EVENTO DE HISTORIA — FORMATO OBLIGATORIO ESTE TURNO\n`;
    system += `El usuario verá 3 mensajes en este orden:\n`;
    system += `1) ${estado.chica} responde al usuario y NOTA que le llegó algo al celular (vibra / notificación), SIN conocer aún el contenido.\n`;
    system += `2) Mensaje de ${de} (lo pone el sistema; NO lo escribas vos).\n`;
    system += `3) ${estado.chica} reacciona al contenido del mensaje de ${de} Y sigue la escena actual con el usuario.\n\n`;
    system += `Contenido del mensaje de ${de} (solo para el bloque 3; NO lo copies literal en el bloque 1):\n"""${eventoHistoria.texto.slice(0, 400)}"""\n\n`;
    system += `Respondé SOLO con este formato (dos bloques, nada más):\n`;
    system += `[${estado.chica}_ANTES]: ... (usuario + "me llegó algo al celu", sin revelar la foto)\n`;
    system += `[${estado.chica}_DESPUES]: ... (reacción a ${de} + seguir el acto/charla actual)\n`;
    system += `PROHIBIDO inventar un bloque de ${de}. PROHIBIDO poner el texto de la foto en el bloque ANTES.\n`;
    log('System: evento split ANTES/DESPUES', eventoHistoria.id);
  } else if (estado.eventoPendienteReaccion && estado.eventoPendienteReaccion.texto) {
    // Fallback legacy por si quedó pendiente de una versión anterior
    const pend = estado.eventoPendienteReaccion;
    system += `\n\n## REACCIÓN A EVENTO PREVIO\n`;
    system += `Antes llegó: ${String(pend.texto).slice(0, 280)}\n`;
    system += `${estado.chica} debe reaccionar a eso y al usuario. NO recopies el mensaje ajeno.\n`;
    estado.eventoPendienteReaccion = null;
  }
  if (estado.chicasActivas.length > 1) {
    const extras = estado.chicasActivas.filter((c) => c !== estado.chica).map((c) => `### ${c}\n${getPersonalidad(c, estado.nombreUsuario)}`).join('\n\n');
    system += `\n\nOTROS PERSONAJES:\n${extras}`;
    system += `\n\n⚠️ MULTI ACTIVO. Personajes presentes (TODOS deben hablar): ${estado.chicasActivas.join(', ')}.`;
    system += `\nOBLIGATORIO: un bloque [Nombre]: por CADA presente. Nadie desaparece del turno aunque el usuario no la nombre en el acto.`;
    system += `\nSi el usuario solo actúa con algunas, las otras REACCIONAN (celos, mirar, comentar, tocarse, pedir turno). No las omitas.`;
    system += `\nREGLA DE ROBO DE ESCENA: solo las nombradas en el acto describen la penetración/pose. Las demás no se inventan el mismo acto.`;
    system += `\nEjemplo: usuario "standfuck a Nino y Miku" con Ichika presente → [Nino]: standfuck... [Miku]: standfuck... [Ichika]: *mira con celos/interés* reacciona sin desaparecer.`;
  }

  const intencion = resolverIntencionUsuario(mensajeUsuario);
  if (soloMuestraUsuario) {
    system += '\n\n⚠️ Usuario SOLO mostró la pija. Reaccioná. PROHIBIDO chupar. imagen_tag = usuario_muestra_su_verga.';
  } else if (intencion) {
    system += `\n\n⚠️ El usuario pidió específicamente: ${intencion.label}. Describí ESA acción (no inventes otra pose).`;
    if (String(intencion.label || '').startsWith('oral_bola')) {
      system += `\n⚠️ BOLAS: en el diálogo y la acción DEBÉS dejar claro si chupa la bola IZQUIERDA, la DERECHA o AMBAS. No digas solo "las bolas" sin especificar si el usuario pidió un lado.`;
    }
  }

  // Info de sugerencia de lugar (si hay)
  const intLugar = clasificarIntencionLugar(mensajeUsuario);
  if (intLugar.tipo === 'sugerencia') {
    system += `\n\n⚠️ El usuario SUGIRIÓ ir a "${intLugar.lugar}" (no es una orden). Responde hablando del tema pero NO digas que ya están ahí ni cambies de lugar. Sigan en el lugar actual.`;
  }

  logGroup('Request', {
    chica: estado.chica,
    fase: estado.fase,
    relacion: estado.relacion,
    ubicacion: estado.ubicacion,
    escenaSex, soloNoSex,
    soloMuestra: soloMuestraUsuario,
    mensajeUsuario,
    intencion: intencion ? intencion.label : '(ninguna)',
    intencionLugar: intLugar,
    accionActual: estado.accionActual
  });

  // System (resumen + estado) + últimos N mensajes completos + mensaje actual.
  // No se manda todo el historial: solo resumen + ventana reciente.
  const recientes = obtenerMensajesRecientesParaIA(ULTIMOS_MENSAJES_CONTEXTO);
  const messages = [
    { role: 'system', content: system },
    ...recientes,
    { role: 'user', content: mensajeUsuario }
  ];
  log('Contexto IA: resumen=' + ((estado.resumenConversacion || '').length) + ' chars, mensajes recientes=' + recientes.length);
  let raw = await llamarGroq(messages, { proposito: 'respuesta-chat (MODELO)', max_tokens: 2200, temperature: 1.05 });
  let parsed = parseJsonRespuesta(raw);
  if (!parsed) {
    for (const extra of PROMPTS_REINTENTO) {
      raw = await llamarGroq([
        { role: 'system', content: system + '\n\n' + extra },
        ...recientes,
        { role: 'user', content: mensajeUsuario },
        { role: 'assistant', content: raw || '' },
        { role: 'user', content: 'Corrige SOLO JSON.' }
      ], { proposito: 'reintento-JSON (MODELO)' });
      parsed = parseJsonRespuesta(raw);
      if (parsed) break;
    }
  }
  if (!parsed) parsed = { respuesta: `*te miro* Ay ${estado.nombreUsuario}... decime de nuevo.`, imagen_tag: 'hablando' };

  postProcesarFase(parsed.respuesta);
  extraerHechos();
  registrarHechosDesdeIntercambio(mensajeUsuario, parsed.respuesta);
  procesarCorridasDelIntercambio(mensajeUsuario, parsed.respuesta);
  await actualizarRelacionAutomatica(mensajeUsuario, parsed.respuesta);

  let bloques = partirBloquesMulti(parsed.respuesta, estado.chica);

  // Multi: si falta alguna chica activa, agregar reacción corta (no desaparecer del trío)
  if (estado.chicasActivas.length > 1 && !eventoHistoria) {
    const ya = new Set(bloques.map((b) => b.chica));
    for (const c of estado.chicasActivas) {
      if (!c || c === 'Aldo' || ya.has(c)) continue;
      const nombranActo = detectarChicasEnTexto(mensajeUsuario);
      const ellaEnActo = nombranActo.some((n) => n.toLowerCase() === c.toLowerCase());
      if (ellaEnActo) continue; // debería haber hablado; no inventar acto
      bloques.push({
        chica: c,
        texto: `*se queda en la escena, mirando* "Oye... yo también estoy acá." `
      });
      log('Multi: se agregó reacción faltante de', c);
    }
  }

  // Evento historia: parsear [Chica_ANTES] / [Chica_DESPUES]
  if (eventoHistoria && eventoHistoria.texto) {
    const rawTxt = String(parsed.respuesta || '');
    const ch = estado.chica;
    const reAntes = new RegExp('\\[' + ch + '_ANTES\\]\\s*:?\\s*', 'i');
    const reDesp = new RegExp('\\[' + ch + '_DESPUES\\]\\s*:?\\s*', 'i');
    const idxA = rawTxt.search(reAntes);
    const idxD = rawTxt.search(reDesp);
    if (idxA >= 0 && idxD >= 0 && idxD > idxA) {
      const tAntes = rawTxt.slice(idxA, idxD).replace(reAntes, '').trim();
      const tDesp = rawTxt.slice(idxD).replace(reDesp, '').trim()
        .replace(new RegExp('\\[' + ch + '\\]\\s*:?', 'i'), '').trim();
      bloques = [
        { chica: ch, texto: tAntes || rawTxt, esAntesEvento: true },
        { chica: ch, texto: tDesp || rawTxt, esDespuesEvento: true }
      ];
      log('Evento: bloques ANTES/DESPUES parseados');
    } else {
      // Fallback: un solo bloque de la chica; el evento igual se inserta en el medio duplicando reacción corta
      log('Evento: no se pudo parsear ANTES/DESPUES, fallback 1 bloque');
      bloques = [{ chica: ch, texto: rawTxt.replace(/^\[[^\]]+\]\s*:?\s*/i, '').trim(), esAntesEvento: true }];
    }
  }

  const ahoraSoloNoSex = soloMuestraUsuario ? false : !escenaSex && !(PATRON_SEXO.test(mensajeUsuario) || PATRON_ORAL.test(mensajeUsuario));

  const partes = [];
  for (const b of bloques) {
    if (b.chica === 'Aldo') {
      partes.push({ chica: 'Aldo', texto: b.texto, imagenUrl: '', audioUrl: '', descripcionImg: '', imagen_tag: '' });
      continue;
    }

    // === TAG REAL: Qwen elige ===
    const escenaActiva = hayEscenaSexualActiva();
    const esSugerencia = esMensajeSugerencia(mensajeUsuario, { escenaSexualActiva: escenaActiva });
    let qwen;
    // Solo forzar "hablando" si es sugerencia hipotética Y NO hay sexo ya ocurriendo
    if (esSugerencia && !escenaActiva) {
      log('Mensaje es SUGERENCIA/pregunta (sin escena activa) → tag forzando hablando');
      qwen = { tag: 'hablando', razon: 'sugerencia_no_acto', fuente: 'local_sugerencia' };
    } else {
      if (esSugerencia && escenaActiva) {
        log('Pregunta durante sexo activo → NO forzar hablando, mantener escena');
      }
      const otrasEnTurno = bloques.map((x) => x.chica).filter((c) => c && c !== b.chica && c !== 'Aldo' && c !== 'Sistema');
      const prevChica = (estado.accionPorChica && estado.accionPorChica[b.chica]) || estado.accionActual;
      qwen = await elegirTagConQwen(b.chica, mensajeUsuario, b.texto, ahoraSoloNoSex, prevChica, { otrasChicas: otrasEnTurno });
    }
    let tagFinal = qwen.tag || 'hablando';

    // Resolver imagen con el tag de Qwen (este es el que se usa de verdad)
    const media = resolverImagen(b.chica, tagFinal, soloMuestraUsuario ? false : ahoraSoloNoSex);

    // Actualizar ropa según el tag REAL usado (Qwen)
    actualizarRopaDesdeTag(b.chica, media.tag, media.descripcion || '');

    // === TESTING ONLY: IA tag + Nakardas (NO deciden el tag real) ===
    const tagIAOriginal = parsed.imagen_tag || '';
    const nakardas = elegirTag(b.chica, tagIAOriginal, b.texto, mensajeUsuario, ahoraSoloNoSex, intencion);

    razonarTagTestingIA(
      b.chica,
      mensajeUsuario,
      b.texto,
      tagIAOriginal,
      media.tag
    );

    console.log('%c[TESTING Qwen vs IA vs Nakardas]', 'color:#a78bfa', {
      chica: b.chica,
      tagQwen: media.tag,
      razonQwen: qwen.razon,
      tagIA: tagIAOriginal || '(ninguno)',
      tagNakardas: nakardas.elegido,
      razonNakardas: nakardas.razon
    });

    logGroup(`Tag → ${b.chica}`, {
      intencion: intencion ? intencion.label : '(ninguna)',
      tagQwen: media.tag,
      tagIA_testing: tagIAOriginal,
      tagNakardasTesting: nakardas.elegido,
      accionAnterior: estado.accionActual,
      ropaActual: getRopaChica(b.chica).actual,
      ropaAnterior: getRopaChica(b.chica).anterior
    });

    const emo = detectarEmocionEnTexto(b.texto, b.chica);
    if (emo && emo !== 'neutral') {
      console.log('%c[emocion]', 'color:#22c55e', b.chica, '→', emo);
    }

    // Alinear texto con el tag de imagen (inmersión)
    let textoFinal = b.texto;
    try {
      textoFinal = await rearmarTextoSegunTag(b.chica, b.texto, media.tag || tagFinal, mensajeUsuario);
    } catch (_) {}

    // Guardar pose por chica (nunca tags meta porno/cámara salvo que el mensaje lo pida)
    if (media.tag && !/hablando|enojada|sonrojada|celos/i.test(media.tag)) {
      const meta = /grabando|porno|c[aá]mara|film/i.test(media.tag);
      const pideMeta = /grabar|porno|c[aá]mara|film|video/i.test(String(mensajeUsuario || ''));
      if (!meta || pideMeta) {
        if (typeof esTagSex === 'function' && esTagSex(media.tag)) {
          if (!estado.accionPorChica) estado.accionPorChica = {};
          estado.accionPorChica[b.chica] = media.tag;
        } else if (detectarPoseSexualEnTexto(b.texto)) {
          if (!estado.accionPorChica) estado.accionPorChica = {};
          const cont = resolverTagContinuidadChica(b.chica, b.texto, false);
          if (cont && !/grabando|porno/i.test(cont)) estado.accionPorChica[b.chica] = cont;
        }
      }
    }

    partes.push({
      chica: b.chica,
      texto: textoFinal,
      imagenUrl: media.url,
      audioUrl: media.audio || '',
      descripcionImg: media.descripcion || '',
      imagen_tag: media.tag
    });
  }

  // === IMAGEN COMPARTIDA: solo si la escena es UNA misma acción grupal, no acciones mixtas ===
  try {
    const nombresBloques = partes.map((p) => p.chica).filter((c) => c && c !== 'Aldo' && c !== 'Sistema' && !partes.find(x => x.chica === c && x.esEventoHistoria));
    const chicasMsg = detectarChicasEnTexto(mensajeUsuario);
    const msgLow = String(mensajeUsuario || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const nombraAldoYChica = msgLow.includes('aldo') && chicasMsg.length >= 1;

    // Compartida SOLO si el MENSAJE del usuario nombra 2+ chicas (o Aldo+chica).
    // NO basarse en cuántas responden en bloques (si no, "follo a ichika en el aire"
    // reutiliza el trío anterior porque Nino/Miku también hablan).
    const convieneCompartida = chicasMsg.length >= 2 || nombraAldoYChica;

    log('¿Intentar compartida?', convieneCompartida, 'chicasMsg=', chicasMsg.join(','), 'bloques=', nombresBloques.join(','));

    if (convieneCompartida) {
      const compartida = await elegirImagenCompartidaConQwen(mensajeUsuario, nombresBloques);
      if (compartida && compartida.url) {
        const tagLow = String(compartida.tag || '').toLowerCase();
        const nombradasEnTag = chicasMsg.filter((c) => tagLow.includes(c.toLowerCase()));
        // Si el tag nombra chicas, solo esas; si no nombra (raro), todas del mensaje
        const targets = nombradasEnTag.length ? nombradasEnTag : chicasMsg;
        let aplicadas = 0;
        for (const p of partes) {
          if (!p.chica || p.chica === 'Aldo' || p.chica === 'Sistema' || p.esEventoHistoria) continue;
          if (targets.length && !targets.some((t) => t.toLowerCase() === String(p.chica).toLowerCase())) {
            continue;
          }
          p.imagenUrl = compartida.url;
          p.audioUrl = compartida.audio || p.audioUrl || '';
          p.descripcionImg = compartida.descripcion || p.descripcionImg || '';
          p.imagen_tag = compartida.tag || p.imagen_tag;
          aplicadas++;
        }
        log('Imagen compartida aplicada:', compartida.tag, '→', aplicadas, 'de', targets.join(','));
      } else {
        log('Imagen compartida → ninguno; se mantienen tags individuales por chica');
      }
    }
  } catch (e) {
    log('Imagen compartida error:', e?.message || e);
  }

  const parteConDesc = partes.find((p) => p.descripcionImg?.trim());
  if (parteConDesc) estado.outfitActual = { chica: parteConDesc.chica, tag: parteConDesc.imagen_tag, descripcion: parteConDesc.descripcionImg.trim() };

  // accionActual = continuidad del usuario CON su chica. No guardar actos solo entre NPCs (Aldo→Ichika).
  // Continuidad: no guardar tags GRUPALES/largos (contaminan el siguiente turno 1-a-1)
  const partesChica = partes.filter((p) => p.chica && p.chica !== 'Aldo' && p.chica !== 'Sistema' && !p.esEventoHistoria);
  const tagPrincipal = partesChica.find((p) => p.imagen_tag && p.imagen_tag !== 'hablando')?.imagen_tag
    || partesChica[0]?.imagen_tag;
  const esTagGrupalLargo = tagPrincipal && (
    String(tagPrincipal).length > 40
    || /_mientras_|_y_/.test(String(tagPrincipal))
    || (detectarChicasEnTexto(String(tagPrincipal).replace(/_/g, ' ')).length >= 2)
  );
  const multiMixtoTurno = partesChica.length >= 2 && new Set(partesChica.map((p) => p.imagen_tag)).size >= 2;
  if (mensajeEsAccionEntreOtros(mensajeUsuario) && !mensajeEsCorridaDelUsuario(mensajeUsuario)) {
    log('accionActual: acto entre otros → no actualizar');
  } else if (multiMixtoTurno || esTagGrupalLargo) {
    estado.accionActual = null;
  estado.accionPorChica = {};
    log('accionActual: multi/grupal → sin continuidad global');
  } else if (tagPrincipal && tagPrincipal !== 'hablando') {
    estado.accionActual = tagPrincipal;
  } else if (!escenaSex) {
    const userAct = detectarAccionEnTexto(mensajeUsuario);
    if (!userAct.tag) estado.accionActual = null;
  }

  estado.historial.push({ role: 'user', content: mensajeUsuario });
  // El flag ya se usó en el prompt de este turno
  estado.ultimaEyaculacionRapida = false;
  estado.eyaculacionRapida = false;
  estado.historial.push({ role: 'assistant', content: parsed.respuesta });
  if (estado.historial.length > MAX_HISTORIAL * 2) estado.historial = estado.historial.slice(-MAX_HISTORIAL * 2);

  // Actualizar resumen progresivo (reemplaza el historial completo en el próximo prompt)
  try {
    await actualizarResumenProgresivo(mensajeUsuario, parsed.respuesta);
  } catch (e) {
    log('No se pudo actualizar resumen:', e?.message || e);
  }

  logGroup('Respuesta final', {
    fase: estado.fase,
    relacion: estado.relacion,
    ubicacion: estado.ubicacion,
    accionActual: estado.accionActual,
    partes: partes.map((p) => `${p.chica}: tag=${p.imagen_tag}`).join(' | ')
  });

  // Si hubo evento de historia, anteponer una parte "Sistema" / narrador para la UI
  if (eventoHistoria && eventoHistoria.texto) {
    log('UI evento historia EN MEDIO (Nino → Ichika → Nino):', eventoHistoria.de, 'img=', !!(eventoHistoria.imagenUrl));
    const parteEvento = {
      chica: eventoHistoria.de || 'Sistema',
      texto: eventoHistoria.texto,
      imagenUrl: eventoHistoria.imagenUrl || '',
      audioUrl: eventoHistoria.audioUrl || '',
      descripcionImg: eventoHistoria.descripcionImg || '',
      imagen_tag: eventoHistoria.imagen_tag || '',
      esEventoHistoria: true
    };
    // Insertar entre ANTES y DESPUES si hay 2+ partes de la chica principal
    if (partes.length >= 2) {
      const mid = [partes[0], parteEvento, ...partes.slice(1)];
      partes.length = 0;
      partes.push(...mid);
    } else if (partes.length === 1) {
      // Solo ANTES: evento + misma chica reacciona (re-use short prompt via duplicating with note - already in text)
      partes.push(parteEvento);
    } else {
      partes.push(parteEvento);
    }
    estado.eventoPendienteReaccion = null; // todo en este turno
  }

  return {
    partes,
    texto: parsed.respuesta,
    imagen_tag: partes.find((p) => !p.esEventoHistoria)?.imagen_tag || partes[0]?.imagen_tag || 'hablando',
    imagenUrl: partes.find((p) => !p.esEventoHistoria)?.imagenUrl || partes[0]?.imagenUrl || '',
    audioUrl: partes.find((p) => !p.esEventoHistoria)?.audioUrl || '',
    descripcionImg: partes.find((p) => !p.esEventoHistoria)?.descripcionImg || '',
    fase: estado.fase,
    relacion: estado.relacion,
    ubicacion: estado.ubicacion,
    fondoLugar: getFondoLugar(estado.ubicacion),
    chica: estado.chica,
    chicasActivas: [...estado.chicasActivas],
    eventoHistoria: eventoHistoria || null
  };
}

/** Regenera la ultima respuesta (usa ultimoMensajeUsuario) */
export async function regenerarUltimaRespuesta() {
  if (!estado.ultimoMensajeUsuario) throw new Error('No hay mensaje previo para regenerar');
  // Quitar el ultimo par user+assistant del historial para no duplicar
  if (estado.historial.length >= 2) {
    const last = estado.historial[estado.historial.length - 1];
    const prev = estado.historial[estado.historial.length - 2];
    if (last.role === 'assistant' && prev.role === 'user') {
      estado.historial = estado.historial.slice(0, -2);
    }
  }
  // No incrementar mensajesCount de nuevo de forma artificial
  return enviarMensaje(estado.ultimoMensajeUsuario);
}

export function resetChat() {
  estado.historial = [];
  estado.resumenConversacion = '';
  estado.fase = FASE.NORMAL;
  estado.ubicacion = null;
  estado.hechos = [];
  estado.chicasActivas = estado.chica ? [estado.chica] : [];
  estado.modo = 'libre';
  estado.historiaId = null;
  estado.eventosDisparados = [];
  estado.eventoPendienteReaccion = null;
  estado.outfitActual = null;
  estado.accionActual = null;
  estado.accionPorChica = {};
  estado.relacion = RELACION.DESCONOCIDA;
  estado.relacionPorChica = {};
  estado.vinculosNPC = {};
  estado.corridas = [];
  estado.corridasCountPorChica = {};
  estado.ultimaCorrida = null;
  estado._corridaMsgFirma = '';
  estado._corridaMsgDone = false;
  estado.mensajesCount = 0;
  estado.ultimoMensajeUsuario = null;
  estado.ropaPorChica = {};
  estado.turnosEnSexo = 0;
  estado.eyaculacionRapida = false;
  estado.ultimaEyaculacionRapida = false;
}

export function volverAlSelector() {
  estado.chica = null;
  estado.chicasActivas = [];
  estado.historial = [];
  estado.resumenConversacion = '';
  estado.fase = FASE.NORMAL;
  estado.ubicacion = null;
  estado.hechos = [];
  estado.modo = 'libre';
  estado.historiaId = null;
  estado.eventosDisparados = [];
  estado.eventoPendienteReaccion = null;
  estado.outfitActual = null;
  estado.accionActual = null;
  estado.accionPorChica = {};
  estado.relacion = RELACION.DESCONOCIDA;
  estado.relacionPorChica = {};
  estado.vinculosNPC = {};
  estado.corridas = [];
  estado.corridasCountPorChica = {};
  estado.ultimaCorrida = null;
  estado._corridaMsgFirma = '';
  estado._corridaMsgDone = false;
  estado.mensajesCount = 0;
  estado.ultimoMensajeUsuario = null;
  estado.ropaPorChica = {};
}

export function getResumenConversacion() {
  return estado.resumenConversacion || '';
}

export { getChicasDisponibles, getImagenSelector, getDescripcionChica, listarTags };
