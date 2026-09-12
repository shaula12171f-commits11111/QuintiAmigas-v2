// ============================================================
//  tagEngine.js — Sistema de tags estilo Nakardas (port a v2)
//  Prioridad: usuario > continuidad > respuesta IA > modelo > hablando
// ============================================================

import {
  listarTags, listarTagsNoSex, normalizarTag, esTagSex
} from './imagenes.js';

const PESOS = {
  VERBO: 10,
  OBJETO: 6,
  POSE: 5,
  CONTEXTO: 4,
  ASTERISCO: 8,
  MODIFICADOR: 3
};

const UMBRAL = 10;

const PATRONES_ASTERISCO = [
  { re: /\*[^*]*(?:bes[aoé]|besando|besar|kiss)[^*]*\*/gi, tag: 'besando', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:chup|mam[ao]|oral|felaci)[^*]*(?:punta|cabeza|glande)[^*]*\*/gi, tag: 'chupando_solo_la_punta_del_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:punta|cabeza)[^*]*(?:chup|mam|lam)[^*]*\*/gi, tag: 'chupando_solo_la_punta_del_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:chup|mam[ao])[^*]*(?:mitad)[^*]*\*/gi, tag: 'chupando_solo_la_mitad_del_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:chup|mam[ao]|oral)[^*]*(?:todo|fondo|entera|deep)[^*]*\*/gi, tag: 'chupando_todo_el_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:chup|mam[ao]|oral|felaci)[^*]*(?:pene|verga|polla|pija|miembro)[^*]*\*/gi, tag: 'chupando_todo_el_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:pene|verga|polla|pija)[^*]*(?:chup|mam|oral)[^*]*\*/gi, tag: 'chupando_todo_el_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:chup|mam|lam)[^*]*(?:bola|bolas|testicul|huevo)[^*]*\*/gi, tag: 'chupando_bolas', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:bola|bolas)[^*]*(?:chup|mam|lam)[^*]*\*/gi, tag: 'chupando_bolas', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:lam(?:e|iendo|er))[^*]*(?:pene|verga|polla)[^*]*\*/gi, tag: 'lamiendo_pene', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:doggy|a cuatro|por detr[aá]s|de espaldas|perrito)[^*]*\*/gi, tag: 'doggystyle', peso: PESOS.POSE },
  { re: /\*[^*]*(?:misioner)[^*]*\*/gi, tag: 'misionero', peso: PESOS.POSE },
  { re: /\*[^*]*(?:reverse\s*cowgirl|al rev[eé]s)[^*]*\*/gi, tag: 'reverse_cowgirl', peso: PESOS.POSE },
  { re: /\*[^*]*(?:cowgirl|montando|cabalg)[^*]*\*/gi, tag: 'cowgirl', peso: PESOS.POSE },
  { re: /\*[^*]*(?:sidefuck|de lado|de costado)[^*]*\*/gi, tag: 'sidefuck', peso: PESOS.POSE },
  { re: /\*[^*]*(?:de pie|standfuck|contra la pared)[^*]*\*/gi, tag: 'standfuck_follando_de_pie', peso: PESOS.POSE },
  { re: /\*[^*]*(?:en el aire|levantad)[^*]*\*/gi, tag: 'follando_en_el_aire', peso: PESOS.POSE },
  { re: /\*[^*]*(?:anal|por el culo|en el ano)[^*]*\*/gi, tag: 'follando_anal', peso: PESOS.POSE },
  { re: /\*[^*]*(?:handjob|paja|con la mano|jal[ao])[^*]*\*/gi, tag: 'handjob_paja', peso: PESOS.VERBO },
  // === CUM / FACIAL (prioridad cara > boca) estilo Nakardas ===
  { re: /\*[^*]*(?:me\s*corro|eyacul|corrida|semen|leche|esperma|cum)[^*]*(?:cara|rostro|facial|face)[^*]*\*/gi, tag: 'me_corro_en_su_cara', peso: PESOS.VERBO + 6 },
  { re: /\*[^*]*(?:cara|rostro|facial|face)[^*]*(?:me\s*corro|eyacul|corrida|semen|leche|esperma|cum)[^*]*\*/gi, tag: 'me_corro_en_su_cara', peso: PESOS.VERBO + 6 },
  { re: /\*[^*]*(?:me\s*corro|eyacul|corrida|semen|leche|esperma|cum)[^*]*(?:boca|labios|garganta|trag)[^*]*\*/gi, tag: 'me_corro_en_su_boca', peso: PESOS.VERBO + 4 },
  { re: /\*[^*]*(?:boca|labios|garganta)[^*]*(?:me\s*corro|eyacul|corrida|semen|leche|esperma|cum)[^*]*\*/gi, tag: 'me_corro_en_su_boca', peso: PESOS.VERBO + 4 },
  { re: /\*[^*]*(?:verga|pija|polla|pene)[^*]*(?:en|contra|sobre|choc)[^*]*(?:cara|rostro)[^*]*\*/gi, tag: 'verga_en_su_cara', peso: PESOS.VERBO + 3 },
  { re: /\*[^*]*(?:desnud|sin ropa)[^*]*\*/gi, tag: 'desnuda', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:mostrando|ense[nñ]a)[^*]*(?:culo|nalga|tanga)[^*]*\*/gi, tag: 'mostrando_culo_tanga', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:muestro|muestra)[^*]*(?:verga|pija|polla|pene)[^*]*\*/gi, tag: 'usuario_muestra_su_verga', peso: PESOS.VERBO },
  { re: /\*[^*]*(?:agarr[oóa]|apret[oóa]|manose)[^*]*(?:culo|nalga)[^*]*\*/gi, tag: 'usuario_agarra_el_culo', peso: PESOS.VERBO }
];

const PALABRAS_CLAVE = [
  { palabras: ['besame', 'besarme', 'besarte', 'besando', 'beso', 'besa', 'besar'], tag: 'besando', peso: PESOS.VERBO },
  { palabras: ['chupame', 'mamame', 'chupamela', 'mamamela', 'chupa', 'chupando', 'mama', 'mamando', 'oral', 'blowjob', 'deepthroat'], tag: 'chupando_todo_el_pene', peso: PESOS.VERBO },
  { palabras: ['pene', 'verga', 'polla', 'pija', 'miembro'], tag: 'chupando_todo_el_pene', peso: PESOS.OBJETO },
  { palabras: ['solo la punta', 'la punta', 'solo punta', 'cabeza del'], tag: 'chupando_solo_la_punta_del_pene', peso: PESOS.OBJETO },
  { palabras: ['hasta la mitad', 'la mitad', 'mitad del'], tag: 'chupando_solo_la_mitad_del_pene', peso: PESOS.OBJETO },
  { palabras: ['hasta el fondo', 'toda la', 'entera', 'deepthroat', 'se la traga'], tag: 'chupando_todo_el_pene', peso: PESOS.MODIFICADOR },
  { palabras: ['bolas', 'bola', 'testicul', 'huevos'], tag: 'chupando_bolas', peso: PESOS.OBJETO },
  { palabras: ['lame', 'lamiendo', 'lamer', 'lameme'], tag: 'lamiendo_pene', peso: PESOS.VERBO },
  { palabras: ['doggy', 'doggystyle', 'a cuatro', 'por detras', 'por detrás', 'de espaldas', 'perrito'], tag: 'doggystyle', peso: PESOS.POSE },
  { palabras: ['misionero', 'misioner', 'boca arriba'], tag: 'misionero', peso: PESOS.POSE },
  { palabras: ['cowgirl', 'me monto', 'cabalg'], tag: 'cowgirl', peso: PESOS.POSE },
  { palabras: ['reverse cowgirl', 'al reves encima', 'al revés'], tag: 'reverse_cowgirl', peso: PESOS.POSE },
  { palabras: ['de lado', 'de costado', 'sidefuck'], tag: 'sidefuck', peso: PESOS.POSE },
  { palabras: ['de pie', 'standfuck', 'contra la pared'], tag: 'standfuck_follando_de_pie', peso: PESOS.POSE },
  { palabras: ['en el aire', 'levantada', 'suspendida'], tag: 'follando_en_el_aire', peso: PESOS.POSE },
  { palabras: ['anal', 'por el culo', 'en el ano'], tag: 'follando_anal', peso: PESOS.POSE },
  { palabras: ['handjob', 'paja', 'con la mano', 'te la jalo', 'jalame'], tag: 'handjob_paja', peso: PESOS.VERBO },
  { palabras: ['desnudate', 'desnúdate', 'desnuda', 'sin ropa', 'quitate la ropa'], tag: 'desnuda', peso: PESOS.VERBO },
  { palabras: ['muestra el culo', 'mostrame el culo', 'enseña el culo', 'da la vuelta'], tag: 'mostrando_culo_tanga', peso: PESOS.VERBO },
  { palabras: ['te muestro', 'muestro mi', 'saco la pija', 'saco la verga', 'mira mi verga', 'mira mi pija'], tag: 'usuario_muestra_su_verga', peso: PESOS.VERBO },
  { palabras: ['agarra el culo', 'agarrame el culo', 'aprieta el culo', 'le agarro el culo', 'le agarra el culo', 'agarro el culo', 'agarrando el culo', 'le aprieto el culo', 'manoseo el culo', 'le manoseo'], tag: 'usuario_agarra_el_culo', peso: PESOS.VERBO },
  { palabras: ['agarro', 'agarrando', 'aprieto', 'manoseo'], tag: 'usuario_agarra_el_culo', peso: PESOS.VERBO },
  { palabras: ['nalguea', 'nalgueame', 'azote en el culo', 'cachetada en el culo'], tag: 'usuario_nalguea_el_culo', peso: PESOS.VERBO },
  // === CUM / FACIAL (frases exactas primero) ===
  { palabras: ['me corro en su cara', 'corro en su cara', 'me corro en la cara', 'corrida en la cara', 'corrida en su cara', 'semen en su cara', 'semen en la cara', 'leche en su cara', 'leche en la cara', 'facial', 'cum en su cara', 'cum en la cara', 'acabo en su cara', 'acabo en la cara'], tag: 'me_corro_en_su_cara', peso: PESOS.VERBO + 8 },
  { palabras: ['me corro en su boca', 'corro en su boca', 'me corro en la boca', 'corrida en la boca', 'corrida en su boca', 'semen en su boca', 'semen en la boca', 'leche en su boca', 'leche en la boca', 'cum en su boca', 'acabo en su boca', 'acabo en la boca', 'traga el semen', 'traga la leche'], tag: 'me_corro_en_su_boca', peso: PESOS.VERBO + 6 },
  { palabras: ['verga en su cara', 'pija en su cara', 'polla en su cara', 'pene en su cara', 'choco mi verga en su cara'], tag: 'verga_en_su_cara', peso: PESOS.VERBO + 4 }
];

const PATRONES_CONTINUAR = [
  /\bsigue así\b/i, /\bcontinu[aá]\b/i, /\bsegu[ií]\b/i, /\bno pares\b/i,
  /\botra vez\b/i, /\bm[aá]s\b/i, /\bdale\b/i, /\bvamos\b/i,
  /\bas[ií] me gusta\b/i, /\bquiero m[aá]s\b/i, /\bno cambies\b/i,
  /\bigual\b/i, /\bmismo\b/i, /\bmanten[eé]\b/i, /\bas[ií]\b/i
];

const PATRONES_CAMBIAR = [
  /\bahora\b/i, /\bcambi[aá]\b/i, /\bpar[aá]\b/i, /\bbasta\b/i,
  /\bsuficiente\b/i, /\bprobemos\b/i, /\bhagamos\b/i, /\bquiero que\b/i,
  /\botra cosa\b/i, /\bdistinto\b/i, /\bpasemos a\b/i, /\bdej[aá] eso\b/i,
  /\bcambiemos\b/i
];

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export function detectarAccionEnTexto(texto, { umbral = UMBRAL } = {}) {
  if (!texto || !String(texto).trim()) {
    return { tag: null, puntuacion: 0, coincidencias: [] };
  }
  const raw = String(texto);
  const lower = norm(raw);
  const scores = Object.create(null);
  const coincidencias = [];

  for (const { re, tag, peso } of PATRONES_ASTERISCO) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const pts = peso + PESOS.ASTERISCO;
      scores[tag] = (scores[tag] || 0) + pts;
      coincidencias.push({ tipo: 'asterisco', tag, texto: m[0].slice(0, 60), peso: pts });
    }
  }

  for (const { palabras, tag, peso } of PALABRAS_CLAVE) {
    for (const p of palabras) {
      if (lower.includes(norm(p))) {
        scores[tag] = (scores[tag] || 0) + peso;
        coincidencias.push({ tipo: 'palabra', tag, texto: p, peso });
      }
    }
  }

  const tieneOral = /chup|mam[ao]|oral|felaci|blowjob/.test(lower);
  const tienePene = /pene|verga|polla|pija|miembro/.test(lower);
  const tienePunta = /punta|cabeza|glande/.test(lower);
  const tieneMitad = /mitad/.test(lower);
  const tieneBolas = /bola|testicul|huevo/.test(lower);
  if (tieneOral && tienePunta) {
    scores['chupando_solo_la_punta_del_pene'] = (scores['chupando_solo_la_punta_del_pene'] || 0) + 8;
  } else if (tieneOral && tieneMitad) {
    scores['chupando_solo_la_mitad_del_pene'] = (scores['chupando_solo_la_mitad_del_pene'] || 0) + 8;
  } else if (tieneOral && tieneBolas) {
    scores['chupando_bolas'] = (scores['chupando_bolas'] || 0) + 8;
  } else if (tieneOral && tienePene) {
    scores['chupando_todo_el_pene'] = (scores['chupando_todo_el_pene'] || 0) + 5;
  }

  // Cum / facial: cara gana siempre sobre boca si ambas podrían aplicar
  const tieneCum = /me\s*corro|eyacul|corrida|semen|leche|esperma|\bcum\b|acabo|termin[oa]/.test(lower);
  const tieneCara = /\bcara\b|rostro|facial|face/.test(lower);
  const tieneBocaCum = /\bboca\b|labios|garganta|trag/.test(lower);
  if (tieneCum && tieneCara) {
    scores['me_corro_en_su_cara'] = (scores['me_corro_en_su_cara'] || 0) + 20;
    if (scores['me_corro_en_su_boca']) scores['me_corro_en_su_boca'] = Math.max(0, scores['me_corro_en_su_boca'] - 15);
  } else if (tieneCum && tieneBocaCum) {
    scores['me_corro_en_su_boca'] = (scores['me_corro_en_su_boca'] || 0) + 16;
  } else if (tieneCum && !tieneCara) {
    scores['me_corro_en_su_boca'] = (scores['me_corro_en_su_boca'] || 0) + 8;
  }
  if (/verga|pija|polla|pene/.test(lower) && tieneCara && /(en|contra|sobre|choc)/.test(lower) && !tieneCum) {
    scores['verga_en_su_cara'] = (scores['verga_en_su_cara'] || 0) + 12;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] < umbral) {
    return { tag: null, puntuacion: ranked[0]?.[1] || 0, coincidencias };
  }
  return { tag: ranked[0][0], puntuacion: ranked[0][1], coincidencias, candidatos: ranked.slice(0, 5) };
}

export function detectarIntencionContinuidad(mensaje, accionEnCurso = null) {
  if (!mensaje || !String(mensaje).trim()) {
    return { intencion: 'neutral', confianza: 0 };
  }
  let cont = 0, camb = 0;
  for (const p of PATRONES_CONTINUAR) if (p.test(mensaje)) cont++;
  for (const p of PATRONES_CAMBIAR) if (p.test(mensaje)) camb++;

  if (cont === 0 && camb === 0) {
    if (accionEnCurso && String(mensaje).trim().length < 12) {
      return { intencion: 'continuar', confianza: 0.35 };
    }
    return { intencion: 'neutral', confianza: 0.2 };
  }
  if (cont > camb) return { intencion: 'continuar', confianza: Math.min(cont / 2, 1) };
  if (camb > cont) return { intencion: 'cambiar', confianza: Math.min(camb / 2, 1) };
  return { intencion: 'neutral', confianza: 0.3 };
}

export function encontrarTagMasPertinente(tagSolicitado, tagsDisponibles) {
  if (!tagSolicitado || !tagsDisponibles?.length) return null;
  if (tagsDisponibles.includes(tagSolicitado)) return tagSolicitado;

  const base = tagSolicitado.replace(/_\d+$/, '').replace(/\d+$/, '');
  const variantes = tagsDisponibles.filter((t) => {
    const tb = t.replace(/_\d+$/, '').replace(/\d+$/, '');
    return tb === base;
  });
  if (variantes.length) return variantes[Math.floor(Math.random() * variantes.length)];

  const sol = tagSolicitado.toLowerCase().replace(/_/g, ' ');
  for (const t of tagsDisponibles) {
    const tn = t.toLowerCase().replace(/_/g, ' ');
    if (tn === sol) return t;
  }
  for (const t of tagsDisponibles) {
    const tn = t.toLowerCase().replace(/_/g, ' ');
    if (tn.includes(sol) || sol.includes(tn)) return t;
  }

  const tokensSol = sol.split(/\s+/).filter((x) => x.length > 2);
  let best = null, bestScore = 0;
  for (const t of tagsDisponibles) {
    const tokens = t.toLowerCase().replace(/_/g, ' ').split(/\s+/);
    const hit = tokensSol.filter((x) => tokens.some((y) => y.includes(x) || x.includes(y))).length;
    if (hit > bestScore) { bestScore = hit; best = t; }
  }
  if (bestScore >= 2) return best;
  return null;
}

function tagsDe(chica, soloNoSex) {
  const tags = soloNoSex ? listarTagsNoSex(chica) : listarTags(chica);
  return tags?.length ? tags : ['hablando'];
}

export function resolverTagEscena({
  chica,
  mensajeUsuario = '',
  textoBot = '',
  tagModelo = '',
  soloNoSex = true,
  accionAnterior = null
}) {
  const tags = tagsDe(chica, soloNoSex);
  const userDet = detectarAccionEnTexto(mensajeUsuario, { umbral: UMBRAL });
  const cont = detectarIntencionContinuidad(mensajeUsuario, accionAnterior);

  if (userDet.tag) {
    let hit = encontrarTagMasPertinente(userDet.tag, tags);
    if (!hit) hit = normalizarTag(chica, userDet.tag, soloNoSex);
    if (hit && hit !== 'hablando') {
      return {
        tag: hit,
        razon: `usuario:${userDet.tag}(${userDet.puntuacion})`,
        puntuacion: userDet.puntuacion,
        fuente: 'usuario'
      };
    }
  }

  if (cont.intencion === 'continuar' && accionAnterior && accionAnterior !== 'hablando') {
    const hit = encontrarTagMasPertinente(accionAnterior, tags) ||
      (tags.includes(accionAnterior) ? accionAnterior : null);
    if (hit) {
      return {
        tag: hit,
        razon: `continuidad:${cont.confianza.toFixed(2)}`,
        puntuacion: cont.confianza * 10,
        fuente: 'continuidad'
      };
    }
  }

  const userTieneAlgoSexual = userDet.puntuacion >= 6 || /chup|foll|mam[ao]|doggy|anal|paja|besame|desnud|verga|pija|polla|agarr|apriet|manose|nalgue|culo|corro|semen|leche|facial|cum|eyacul|corrida/.test(norm(mensajeUsuario));
  if (soloNoSex && !userTieneAlgoSexual && cont.intencion !== 'continuar') {
    if (tagModelo && tagModelo !== 'hablando') {
      const neutro = /^(hablando|selfie|ropa_|besando$|mostrando_sujetador|quitandose|moviendo_el_culo)/i.test(tagModelo);
      const sexish = esTagSex(tagModelo) || /chup|foll|doggy|anal|cowgirl|mision|handjob|paja|oral|bola|mostrando_culo|culo_tanga/i.test(tagModelo);
      if (neutro && !sexish) {
        const hit = normalizarTag(chica, tagModelo, true);
        return { tag: hit, razon: 'modelo_neutro', puntuacion: 0, fuente: 'modelo' };
      }
    }
    return { tag: 'hablando', razon: 'sin_accion_usuario→hablando', puntuacion: 0, fuente: 'default' };
  }

  if (textoBot && (!soloNoSex || userTieneAlgoSexual || cont.intencion === 'continuar')) {
    const botDet = detectarAccionEnTexto(textoBot, { umbral: soloNoSex ? 18 : 12 });
    if (botDet.tag) {
      let hit = encontrarTagMasPertinente(botDet.tag, tags);
      if (!hit) hit = normalizarTag(chica, botDet.tag, soloNoSex);
      if (hit && hit !== 'hablando') {
        if (!(soloNoSex && esTagSex(hit) && !/usuario_muestra|viendo_verga|agarra/.test(hit))) {
          return {
            tag: hit,
            razon: `bot:${botDet.tag}(${botDet.puntuacion})`,
            puntuacion: botDet.puntuacion,
            fuente: 'bot'
          };
        }
      }
    }
  }

  if (tagModelo && tagModelo !== 'hablando') {
    const hit = encontrarTagMasPertinente(tagModelo, tags) || normalizarTag(chica, tagModelo, soloNoSex);
    if (hit && !(soloNoSex && esTagSex(hit) && !/usuario_muestra|viendo_verga|agarra/.test(hit))) {
      return { tag: hit, razon: 'modelo', puntuacion: 0, fuente: 'modelo' };
    }
  }

  if (!soloNoSex && accionAnterior && accionAnterior !== 'hablando') {
    const hit = encontrarTagMasPertinente(accionAnterior, tags);
    if (hit) {
      return { tag: hit, razon: 'memoria_escena', puntuacion: 0, fuente: 'continuidad' };
    }
  }

  return { tag: 'hablando', razon: 'fallback', puntuacion: 0, fuente: 'default' };
}

export { UMBRAL, PESOS };
