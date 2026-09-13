// ============================================================
//  EMOCIONES — QuintiAmigas v2
//  Módulo extra para emociones (aparte de los tags de acción)
//  Ejemplo: Nino tiene "enojada".
//  Más adelante se puede vincular a imágenes específicas.
// ============================================================

/**
 * Emociones disponibles por chica.
 * Clave = nombre de la chica
 * Valor = array de strings (ids de emoción)
 *
 * Podés agregar más emociones y después asociarlas a tags/imágenes.
 */
export const EMOCIONES_POR_CHICA = {
  Ichika: ['neutral', 'sonriendo', 'coqueta', 'excitada', 'sorprendida', 'celosa'],
  Nino: ['neutral', 'enojada', 'tsundere', 'celosa', 'sonrojada', 'excitada', 'poseida'],
  Miku: ['neutral', 'timida', 'sonrojada', 'excitada', 'concentrada', 'sorprendida'],
  Yotsuba: ['neutral', 'alegre', 'riendo', 'excitada', 'sorprendida', 'cansada'],
  Itsuki: ['neutral', 'seria', 'tsundere', 'sonrojada', 'enojada', 'excitada'],
  Emilia: ['neutral', 'dulce', 'sonrojada', 'nerviosa', 'excitada', 'feliz']
};

/** Emociones genéricas (fallback) */
export const EMOCIONES_GENERICAS = [
  'neutral', 'feliz', 'triste', 'enojada', 'sorprendida',
  'sonrojada', 'excitada', 'timida', 'seria', 'alegre'
];

export function listarEmociones(chica) {
  if (chica && EMOCIONES_POR_CHICA[chica]) {
    return [...EMOCIONES_POR_CHICA[chica]];
  }
  return [...EMOCIONES_GENERICAS];
}

export function tieneEmocion(chica, emocion) {
  const lista = listarEmociones(chica);
  return lista.some((e) => e.toLowerCase() === String(emocion || '').toLowerCase());
}

/** Detecta emoción simple en texto del bot o usuario (heurística básica) */
export function detectarEmocionEnTexto(texto, chica = null) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const candidatos = listarEmociones(chica);

  const reglas = [
    { re: /enojad|molesta|furiosa|puta madre|idiota|carajo|qué te pasa/, emo: 'enojada' },
    { re: /sonroj|roja|avergonz|que verguenza|qué vergüenza/, emo: 'sonrojada' },
    { re: /excitad|caliente|mojada|empapad|quiero que|foll/, emo: 'excitada' },
    { re: /timid|avergonz|mir[oa] al costado|no se|no sé/, emo: 'timida' },
    { re: /riend|jajaja|jaja|me rio|me río/, emo: 'riendo' },
    { re: /alegr|feliz|contento|genial|qué bien/, emo: 'alegre' },
    { re: /trist|llor|nostalg/, emo: 'triste' },
    { re: /sorprend|qué|como|cómo|en serio/, emo: 'sorprendida' },
    { re: /celos|mía|es mío|no mires a/, emo: 'celosa' },
    { re: /tsundere|n-no es que|no es por vos/, emo: 'tsundere' }
  ];

  for (const { re, emo } of reglas) {
    if (re.test(t) && (candidatos.includes(emo) || !chica)) {
      return emo;
    }
  }
  return 'neutral';
}

export function getEmocionesTodas() {
  return { ...EMOCIONES_POR_CHICA };
}
