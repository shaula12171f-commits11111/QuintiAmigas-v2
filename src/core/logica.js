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
import { GROQ_KEYS, MODELO, MODELO_TAGS, NOMBRE_USUARIO_DEFAULT } from '../../config.js';

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
  historial: [],
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
  ropaPorChica: {}
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
  if (!GROQ_KEYS?.length) throw new Error('Configura tus API keys en config.js');
  const model = opts.model || MODELO || 'llama-3.3-70b-versatile';
  const temperature = opts.temperature ?? 1.05;
  const max_tokens = opts.max_tokens ?? 1600;
  const proposito = opts.proposito || 'chat';
  let ultimoError = null;
  const totalKeys = GROQ_KEYS.length;
  const intentosLog = [];

  console.log(
    `%c[Groq] Inicio llamada (${proposito}) | modelo=${model} | keys en config=${totalKeys} | keyIndex actual=${estado.keyIndex}`,
    'color:#38bdf8;font-weight:bold'
  );

  for (let i = 0; i < totalKeys; i++) {
    const ordenAbsoluto = (estado.keyIndex + i) % totalKeys; // 0-based en el array
    const numeroOrden = ordenAbsoluto + 1; // 1-based para humanos
    const key = GROQ_KEYS[ordenAbsoluto];
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
    `%c[Groq] Resumen: ${totalKeys} key(s) en GROQ_KEYS | propósito=${proposito} | modelo=${model}`,
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


/**
 * Selector de tag con Qwen (sistema principal).
 * Recibe mensaje usuario + texto de la chica + tags reales de imagenes.js + ropa.
 * Devuelve el tag más coherente.
 */
async function elegirTagConQwen(chica, mensajeUsuario, textoBot, soloNoSex = false) {
  const tags = soloNoSex ? listarTagsNoSex(chica) : listarTags(chica);
  if (!tags.length) return { tag: 'hablando', razon: 'sin_tags', fuente: 'qwen' };

  const ropa = getRopaChica(chica);
  const listaTags = tags.join(', ');

  const system = `Sos un selector de tags de imagen para roleplay erótico.
Se te da el mensaje del usuario, la respuesta de la chica, el estado de ropa y la lista REAL de tags disponibles.
Debés elegir UN solo tag de esa lista que mejor represente la escena.

Reglas estrictas:
- SOLO podés elegir un tag que esté en la lista. No inventes tags.
- Prestá atención a la zona del cuerpo (culo, ano, coño, tetas, boca, etc.).
- Prestá atención a si hay penetración, solo roce, oral, etc.
- Respetá el estado de ropa: si está desnuda, NO elijas tags con tanga/bikini/ropa.
- Si el usuario solo muestra la verga, usá un tag de muestra de verga si existe.
- Respondé SOLO con el nombre exacto del tag, sin comillas, sin explicación, sin JSON, sin pensar en voz alta.`;

  const user = `CHICA: ${chica}
ROPA ACTUAL: ${ropa.actual || 'desconocida'}
ROPA ANTERIOR: ${ropa.anterior || '—'}

MENSAJE DEL USUARIO:
"""${String(mensajeUsuario || '').slice(0, 800)}"""

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
        temperature: 0.2,
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

export async function enviarMensaje(mensajeUsuario) {
  if (!estado.chica) throw new Error('Selecciona una chica primero');
  try { await ensureImagenesLoaded(); } catch (_) {}

  estado.ultimoMensajeUsuario = mensajeUsuario;

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

  const messages = [
    { role: 'system', content: system },
    ...estado.historial.slice(-MAX_HISTORIAL).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: mensajeUsuario }
  ];
  let raw = await llamarGroq(messages, { proposito: 'respuesta-chat (MODELO)' });
  let parsed = parseJsonRespuesta(raw);
  if (!parsed) {
    for (const extra of PROMPTS_REINTENTO) {
      raw = await llamarGroq([
        { role: 'system', content: system + '\n\n' + extra },
        ...estado.historial.slice(-8).map((h) => ({ role: h.role, content: h.content })),
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
    const qwen = await elegirTagConQwen(b.chica, mensajeUsuario, b.texto, ahoraSoloNoSex);
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

    partes.push({
      chica: b.chica,
      texto: b.texto,
      imagenUrl: media.url,
      audioUrl: media.audio || '',
      descripcionImg: media.descripcion || '',
      imagen_tag: media.tag
    });
  }

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
  estado.outfitActual = null;
  estado.accionActual = null;
  estado.relacion = RELACION.DESCONOCIDA;
  estado.mensajesCount = 0;
  estado.ultimoMensajeUsuario = null;
  estado.ropaPorChica = {};
}

export { getChicasDisponibles, getImagenSelector, getDescripcionChica, listarTags };
