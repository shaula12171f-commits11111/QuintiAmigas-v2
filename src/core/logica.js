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
  resumenConversacion: '',  // resumen progresivo = único contexto histórico enviado a la IA
  nombreUsuario: NOMBRE_USUARIO_DEFAULT || 'Fabrizio',
  hechos: [],
  keyIndex: 0,
  modo: 'libre',
  historiaId: null,
  outfitActual: null,       // legacy: { chica, tag, descripcion }
  accionActual: null,
  relacion: RELACION.DESCONOCIDA,
  mensajesCount: 0,         // para progresion automatica de relacion
  ultimoMensajeUsuario: null, // para boton refresh
  // Ropa por chica: { [chica]: { actual, anterior, tagActual, tagAnterior } }
  ropaPorChica: {},
  // Eyaculación rápida
  turnosEnSexo: 0,           // turnos desde que empezó la escena sexual activa
  eyaculacionRapida: false,  // true si se corrió en <= 2 turnos de sexo
  ultimaEyaculacionRapida: false // se mantiene un turno para el prompt
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
  if (/ropa_|idol|vestido|yukata|elegante|sexy|modelo|cita|cosplay/.test(t)) return 'vestida';
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
    accionActual: estado.accionActual,
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
  estado.accionActual = snap.accionActual || null;
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
  estado.outfitActual = null;
  estado.accionActual = null;
  estado.relacion = RELACION.DESCONOCIDA;
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
  estado.outfitActual = null;
  estado.accionActual = null;
  estado.relacion = RELACION.DESCONOCIDA;
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
  estado.outfitActual = null;
  estado.accionActual = null;
  estado.relacion = RELACION.CONOCIDA; // en historias ya se conocen un poco
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
  const welcomeSexual = /chup|mamad|pija|verga|foll|coño|boxers|te saca la|en la boca/i.test(texto);
  if (welcomeSexual) estado.fase = FASE.INTIMO;
  let tagInferido = 'hablando';
  if (String(historiaId || '').includes('confesion')) tagInferido = 'hablando';
  else if (welcomeSexual) tagInferido = inferirTagFuerte(chica, texto, '', false) || 'hablando';
  else if (/beso|besarte|besando/i.test(texto)) tagInferido = normalizarTag(chica, 'besando', true) || 'hablando';
  const media = resolverImagen(chica, tagInferido, !welcomeSexual);
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

function detectarPersonajesEnContexto(textoUsuario) {
  const t = (textoUsuario || '').toLowerCase();
  const found = new Set(estado.chicasActivas);
  for (const n of TODOS) { if (t.includes(n.toLowerCase())) found.add(n); }
  if (/hermanas?|las cinco|todas las|las quintillizas/i.test(t)) {
    for (const n of TODAS_CHICAS) found.add(n);
  }
  return [...found].filter((n) => existePersonaje(n));
}

/** Progresion automatica de relacion */
function actualizarRelacionAutomatica(mensajeUsuario, respuestaBot) {
  estado.mensajesCount = (estado.mensajesCount || 0) + 1;
  const idx = RELACION_ORDEN.indexOf(estado.relacion);
  const m = String(mensajeUsuario || '').toLowerCase();
  const r = String(respuestaBot || '').toLowerCase();

  // Subir a conocida tras unos mensajes
  if (estado.relacion === RELACION.DESCONOCIDA && estado.mensajesCount >= 3) {
    estado.relacion = RELACION.CONOCIDA;
    log('Relacion → conocida');
  }
  // Amiga: mas mensajes + tono amistoso
  if (estado.relacion === RELACION.CONOCIDA && estado.mensajesCount >= 8) {
    estado.relacion = RELACION.AMIGA;
    log('Relacion → amiga');
  }
  // Novia: mencion de pareja / amor / exclusividad o muchos mensajes
  if (estado.relacion === RELACION.AMIGA) {
    if (/novia|novio|pareja|te amo|te quiero|somos|exclusiv/i.test(m + ' ' + r) || estado.mensajesCount >= 18) {
      estado.relacion = RELACION.NOVIA;
      log('Relacion → novia');
    }
  }
  // Sexfriend: cuando hay escena intima reiterada
  if ((estado.relacion === RELACION.AMIGA || estado.relacion === RELACION.NOVIA) && estado.fase === FASE.INTIMO) {
    if (estado.mensajesCount >= 12 || /sexfriend|amigos con derechos|solo sexo/i.test(m)) {
      // Si ya es novia no bajamos; si es amiga podemos marcar sexfriend
      if (estado.relacion === RELACION.AMIGA) {
        estado.relacion = RELACION.SEXFRIEND;
        log('Relacion → sexfriend');
      }
    }
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

function construirContexto(mensajeUsuarioActual = '') {
  const lineas = [
    `Fase: ${estado.fase}`,
    `Relacion actual: ${estado.relacion}`,
    'Usuario = HOMBRE (pija). Las chicas = MUJERES.',
    `Chica principal: ${estado.chica}`,
    `Presentes: ${estado.chicasActivas.join(', ')}`
  ];
  if (estado.resumenConversacion && estado.resumenConversacion.trim()) {
    lineas.push('### RESUMEN DE LA CONVERSACIÓN (contexto histórico)');
    lineas.push(estado.resumenConversacion.trim());
  }
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
  if (estado.hechos.length) lineas.push('Hechos: ' + estado.hechos.slice(-8).join(' | '));
  if (estado.outfitActual?.descripcion) lineas.push('OUTFIT: ' + estado.outfitActual.descripcion);
  if (estado.chica) {
    const ropa = getRopaChica(estado.chica);
    lineas.push(`Ropa actual de ${estado.chica}: ${ropa.actual}` + (ropa.anterior ? ` (antes: ${ropa.anterior})` : ''));
    if (ropa.actual === 'desnuda') {
      lineas.push('IMPORTANTE: Está DESNUDA. No digas que lleva tanga, bikini, vestido ni ropa. No inventes prendas.');
    }
  }
  if (estado.accionActual) lineas.push('Accion en curso: ' + estado.accionActual);

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
  const max_tokens = opts.max_tokens ?? 1600;
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
  for (const c of claves) {
    const hit = tags.find((k) => k.toLowerCase().includes(String(c).toLowerCase()));
    if (hit) return hit;
  }
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

async function elegirTagConQwen(chica, mensajeUsuario, textoBot, soloNoSex = false, accionAnterior = null) {
  const tags = soloNoSex ? listarTagsNoSex(chica) : listarTags(chica);
  if (!tags.length) return { tag: 'hablando', razon: 'sin_tags', fuente: 'qwen' };

  const ropa = getRopaChica(chica);
  const listaTags = tags.join(', ');
  const msg = String(mensajeUsuario || '').trim();
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
2) Si esta chica NO está involucrada en el acto del mensaje (solo mira / se pone celosa), elegí tag de reacción o "hablando", NO tags de recibir semen / oral / facial.
3) Si el usuario menciona explícitamente otra zona (assjob, nalgas, tetas, boca, cara, etc.) sobre ESTA chica, ahí sí cambiá.
4) BOLAS: Si la escena es chupar/lamer bolas, el tag DEBE indicar lado: izquierda, derecha o ambas (chupando_bola_izquierda / chupando_bola_derecha / chupando_bolas). No uses un tag genérico de oral si hay tags de bola con lado.
5) SOLO podés elegir un tag que esté en la lista. No inventes tags.
6) Prestá atención a la zona del cuerpo y a QUIÉN recibe la acción.
7) Respetá el estado de ropa: si está desnuda, NO elijas tags con tanga/bikini/ropa.
8) Respondé SOLO con el nombre exacto del tag, sin comillas, sin explicación, sin JSON, sin pensar en voz alta.`;

  const user = `CHICA: ${chica}
ACCIÓN ANTERIOR (solo si aplica a ESTA chica y el usuario se corre): ${accionParaContinuar || 'ninguna — no arrastrar de otra chica/otra escena'}
ROPA ACTUAL: ${ropa.actual || 'desconocida'}
ROPA ANTERIOR: ${ropa.anterior || '—'}

MENSAJE DEL USUARIO:
"""${msg.slice(0, 800)}"""

RESPUESTA DE LA CHICA:
"""${String(textoBot || '').slice(0, 1200)}"""

TAGS DISPONIBLES (elegí UNO exacto de esta lista):
${listaTags}

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
  const t = String(texto || '').toLowerCase();
  const todas = ['Ichika', 'Nino', 'Miku', 'Yotsuba', 'Itsuki', 'Emilia'];
  return todas.filter((c) => t.includes(c.toLowerCase()));
}

function clasificarTamanoEscena(nChicas) {
  if (nChicas >= 5) return 'QUINTETO';
  if (nChicas === 4) return 'CUARTETO';
  if (nChicas === 3) return 'TRIO';
  if (nChicas === 2) return 'DUO';
  return 'INDIVIDUAL';
}

/** Match local: tag que contenga los nombres de las chicas involucradas (+ keywords del mensaje). */
function matchLocalEscenaCompartida(disponibles, mensajeUsuario, chicas) {
  if (!disponibles.length || chicas.length < 2) return null;
  const msg = String(mensajeUsuario || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const names = chicas.map((c) => c.toLowerCase());

  // 1) Todos los nombres de chicas aparecen en el tag
  let candidatos = disponibles.filter((e) => {
    const tl = e.tag.toLowerCase();
    return names.every((n) => tl.includes(n));
  });

  // 2) Si no, al menos 2 nombres en el tag y coinciden con las del mensaje
  if (!candidatos.length) {
    candidatos = disponibles.filter((e) => {
      const tl = e.tag.toLowerCase();
      const hit = names.filter((n) => tl.includes(n));
      return hit.length >= 2;
    });
  }

  if (!candidatos.length) return null;

  // Preferir el que más keywords del mensaje tenga en el tag
  const keywords = [];
  if (/doggy|a cuatro/.test(msg)) keywords.push('doggy', 'doggystyle');
  if (/dedo|concha|squirt|finger/.test(msg)) keywords.push('dedo', 'concha', 'dedos');
  if (/mam|chup|oral|blow/.test(msg)) keywords.push('mamada', 'blowjob', 'chup');
  if (/aire/.test(msg)) keywords.push('aire');
  if (/handjob|paja/.test(msg)) keywords.push('handjob', 'paja');

  let best = null;
  let bestScore = -1;
  for (const e of candidatos) {
    const tl = e.tag.toLowerCase();
    let score = names.filter((n) => tl.includes(n)).length * 10;
    for (const k of keywords) {
      if (tl.includes(k)) score += 3;
    }
    // bonus si el tamaño del tag sugiere el mismo N de chicas
    if (names.length === 3 && /trio|triple|miku|ichika/.test(tl)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (best && bestScore >= 20) {
    // al menos 2 nombres * 10
    log('Match LOCAL escena compartida:', best.tag, 'score=', bestScore);
    return best;
  }
  // Si hay un solo candidato con todos los nombres, usarlo igual
  if (candidatos.length === 1 && names.every((n) => candidatos[0].tag.toLowerCase().includes(n))) {
    log('Match LOCAL escena compartida (único con todos los nombres):', candidatos[0].tag);
    return candidatos[0];
  }
  return bestScore >= 20 ? best : null;
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
  const delMensaje = detectarChicasEnTexto(msg);
  const deBloques = [...new Set((nombresBloques || []).filter((n) => n && n !== 'Aldo' && n !== 'Sistema'))];
  // Unir chicas del mensaje + bloques (el mensaje manda para el tamaño de escena)
  const presentes = [...new Set([...delMensaje, ...deBloques])];
  const tamano = clasificarTamanoEscena(Math.max(delMensaje.length, presentes.length >= 2 ? presentes.length : delMensaje.length));
  log('Escena compartida: chicasMsg=', delMensaje.join(','), 'bloques=', deBloques.join(','), '→', tamano);

  // 1) Match local primero (tags largos tipo follo_a_nino_doggystyle_mientras_...)
  const local = matchLocalEscenaCompartida(disponibles, msg, delMensaje.length >= 2 ? delMensaje : presentes);
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
2) Si es TRIO/CUARTETO/QUINTETO, preferí tags que nombren a ESAS chicas y la acción (doggy, dedos, mamada, etc.).
3) NO elijas un DUO si el usuario nombró 3+ chicas, salvo que no haya otro tag.
4) Si la escena es 1 chica + 2 hombres (Aldo), preferí multi_hombres.
5) Si NINGÚN tag cubre la escena, respondé: ninguno
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
  const system = `Sos un asistente que mantiene un resumen corto y útil de un roleplay erótico adulto.
Actualizá el resumen con el último intercambio. Reglas:
- Máximo 350 palabras.
- Conservá: personajes presentes, lugar, relación, ropa/estado físico, acciones sexuales relevantes, hechos importantes, tono emocional.
- Escribí en tercera persona, claro y denso (sin relleno).
- Si no había resumen previo, creá uno desde cero con este intercambio.
- Respondé SOLO con el resumen actualizado, sin título ni comillas.`;

  const user = `RESUMEN ANTERIOR:
${prev || '(vacío — primer mensaje)'}

ÚLTIMO INTERCAMBIO:
Usuario: ${String(mensajeUsuario || '').slice(0, 600)}
${estado.chica || 'Bot'}: ${String(respuestaBot || '').slice(0, 900)}

Escribí el resumen actualizado:`;

  try {
    const raw = await llamarGroq(
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      {
        model: (typeof MODELO_TAGS !== 'undefined' && MODELO_TAGS) ? MODELO_TAGS : MODELO,
        temperature: 0.3,
        max_tokens: 500,
        proposito: 'resumen-progresivo'
      }
    );
    const limpio = String(raw || '').trim();
    if (limpio && limpio.length > 20) {
      estado.resumenConversacion = limpio.slice(0, 2500);
      log('Resumen actualizado (' + estado.resumenConversacion.length + ' chars)');
    }
  } catch (e) {
    const linea = `Usuario: ${String(mensajeUsuario || '').slice(0, 120)} | ${estado.chica}: ${String(respuestaBot || '').slice(0, 160)}`;
    estado.resumenConversacion = ((prev ? prev + '\n' : '') + linea).slice(-2000);
    log('Resumen fallback local');
  }
}

export async function enviarMensaje(mensajeUsuario) {
  if (!estado.chica) throw new Error('Selecciona una chica primero');
  try { await ensureImagenesLoaded(); } catch (_) {}

  estado.ultimoMensajeUsuario = mensajeUsuario;

  // Contador de sexo + flag eyaculación rápida (Nino/Ichika/Yotsuba)
  actualizarContadorSexoYEyaculacion(mensajeUsuario, estado.accionActual);

  const enContexto = detectarPersonajesEnContexto(mensajeUsuario);
  for (const n of enContexto) {
    if (!estado.chicasActivas.includes(n)) estado.chicasActivas.push(n);
  }
  actualizarFaseYLugar(mensajeUsuario);

  // Forzar estado de ropa desde lo que declara el usuario (ANTES de armar el prompt)
  actualizarRopaDesdeMensajeUsuario(mensajeUsuario, estado.chica);

  const soloMuestraUsuario = esSoloMuestra(mensajeUsuario);
  const escenaSex = !soloMuestraUsuario && (esEscenaSex() || PATRON_SEXO.test(mensajeUsuario));
  const soloNoSex = !escenaSex;

  // Tags y descripciones visuales YA NO se mandan en la llamada principal (ahorro de tokens).
  // El tag real se elige después con elegirTagConQwen (segunda API call).
  // Lore deshabilitado temporalmente (standby) — ver README.
  const personalidad = getPersonalidad(estado.chica, estado.nombreUsuario);
  let system = armarSystemPrompt(personalidad, estado.nombreUsuario, construirContexto(mensajeUsuario), [], '', []);
  if (estado.chicasActivas.length > 1) {
    const extras = estado.chicasActivas.filter((c) => c !== estado.chica).map((c) => `### ${c}\n${getPersonalidad(c, estado.nombreUsuario)}`).join('\n\n');
    system += `\n\nOTROS PERSONAJES:\n${extras}`;
    system += `\n\n⚠️ MULTI ACTIVO. Personajes presentes: ${estado.chicasActivas.join(', ')}.`;
    system += `\nSi el usuario mencionó a alguno de ellos haciendo algo (follando, mirando, hablando, etc.), DEBÉS generar bloques [Nombre]: para la chica principal Y para TODOS los mencionados.`;
    system += `\nEjemplo: [Nino]: ... [Miku]: ... [Aldo]: ...  Nadie se queda sin hablar. Cada uno con su propia acción.`;
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

  // Solo system (incluye resumen) + mensaje actual. YA NO se manda el historial completo.
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: mensajeUsuario }
  ];
  let raw = await llamarGroq(messages, { proposito: 'respuesta-chat (MODELO)' });
  let parsed = parseJsonRespuesta(raw);
  if (!parsed) {
    for (const extra of PROMPTS_REINTENTO) {
      raw = await llamarGroq([
        { role: 'system', content: system + '\n\n' + extra },
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
  actualizarRelacionAutomatica(mensajeUsuario, parsed.respuesta);

  const bloques = partirBloquesMulti(parsed.respuesta, estado.chica);
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
      qwen = await elegirTagConQwen(b.chica, mensajeUsuario, b.texto, ahoraSoloNoSex, estado.accionActual);
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

    partes.push({
      chica: b.chica,
      texto: textoFinal,
      imagenUrl: media.url,
      audioUrl: media.audio || '',
      descripcionImg: media.descripcion || '',
      imagen_tag: media.tag
    });
  }

  // === IMAGEN COMPARTIDA: Qwen elige entre grupales / parejas / multi hombres ===
  try {
    const nombresBloques = partes.map((p) => p.chica).filter((c) => c && c !== 'Aldo' && c !== 'Sistema');
    const chicasMsg = detectarChicasEnTexto(mensajeUsuario);
    const msgLow = String(mensajeUsuario || '').toLowerCase();
    const nombraAldoYChica = msgLow.includes('aldo') && chicasMsg.length >= 1;
    const convieneCompartida = chicasMsg.length >= 2 || nombresBloques.length >= 2 || nombraAldoYChica;
    log('¿Conviene imagen compartida?', convieneCompartida, 'chicasMsg=', chicasMsg.length, 'bloques=', nombresBloques.length);

    if (convieneCompartida) {
      const compartida = await elegirImagenCompartidaConQwen(mensajeUsuario, nombresBloques);
      if (compartida && compartida.url) {
        // Aplicar a todas las chicas del turno (escena compartida)
        let aplicadas = 0;
        for (const p of partes) {
          if (!p.chica || p.chica === 'Aldo' || p.chica === 'Sistema') continue;
          p.imagenUrl = compartida.url;
          p.audioUrl = compartida.audio || p.audioUrl || '';
          p.descripcionImg = compartida.descripcion || p.descripcionImg || '';
          p.imagen_tag = compartida.tag || p.imagen_tag;
          aplicadas++;
        }
        log('Imagen compartida Qwen aplicada:', compartida.tag, 'tipo=', compartida.tipo, '→', aplicadas, 'chicas');
      } else {
        log('Imagen compartida Qwen → ninguno; se mantienen individuales');
      }
    }
  } catch (e) {
    log('Imagen compartida error:', e?.message || e);
  }

  const parteConDesc = partes.find((p) => p.descripcionImg?.trim());
  if (parteConDesc) estado.outfitActual = { chica: parteConDesc.chica, tag: parteConDesc.imagen_tag, descripcion: parteConDesc.descripcionImg.trim() };

  // accionActual = continuidad del usuario CON su chica. No guardar actos solo entre NPCs (Aldo→Ichika).
  const tagPrincipal = partes.find((p) => p.chica !== 'Aldo' && p.imagen_tag)?.imagen_tag;
  if (mensajeEsAccionEntreOtros(mensajeUsuario) && !mensajeEsCorridaDelUsuario(mensajeUsuario)) {
    // No pisar la acción usuario-chica con un acto ajeno; tampoco propagar a la próxima
    log('accionActual: acto entre otros → no actualizar continuidad global');
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

  return {
    partes,
    texto: parsed.respuesta,
    imagen_tag: partes[0]?.imagen_tag || 'hablando',
    imagenUrl: partes[0]?.imagenUrl || '',
    audioUrl: partes[0]?.audioUrl || '',
    descripcionImg: partes[0]?.descripcionImg || '',
    fase: estado.fase,
    relacion: estado.relacion,
    ubicacion: estado.ubicacion,
    fondoLugar: getFondoLugar(estado.ubicacion),
    chica: estado.chica,
    chicasActivas: [...estado.chicasActivas]
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
  estado.outfitActual = null;
  estado.accionActual = null;
  estado.relacion = RELACION.DESCONOCIDA;
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
  estado.outfitActual = null;
  estado.accionActual = null;
  estado.relacion = RELACION.DESCONOCIDA;
  estado.mensajesCount = 0;
  estado.ultimoMensajeUsuario = null;
  estado.ropaPorChica = {};
}

export function getResumenConversacion() {
  return estado.resumenConversacion || '';
}

export { getChicasDisponibles, getImagenSelector, getDescripcionChica, listarTags };
