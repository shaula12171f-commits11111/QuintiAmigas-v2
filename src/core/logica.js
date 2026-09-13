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
