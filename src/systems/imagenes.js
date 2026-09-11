// ============================================================
//  Imágenes - stub v2
//  Puedes reemplazar las URLs por las de tu pack original
// ============================================================

// Placeholder por chica (selector / default)
const DEFAULTS = {
  Ichika: 'https://via.placeholder.com/400x500/8B5CF6/ffffff?text=Ichika',
  Nino: 'https://via.placeholder.com/400x500/EC4899/ffffff?text=Nino',
  Miku: 'https://via.placeholder.com/400x500/3B82F6/ffffff?text=Miku',
  Yotsuba: 'https://via.placeholder.com/400x500/22C55E/ffffff?text=Yotsuba',
  Itsuki: 'https://via.placeholder.com/400x500/EF4444/ffffff?text=Itsuki',
  Emilia: 'https://via.placeholder.com/400x500/A78BFA/ffffff?text=Emilia'
};

// Mapa opcional tag -> url por chica (extiende cuando quieras)
const TAGS = {
  // Ejemplo:
  // Ichika: { hablando: 'url', besando: 'url', ... }
};

export function resolverImagen(chica, tag = 'hablando') {
  const porTag = TAGS[chica]?.[tag];
  if (porTag) return porTag;
  return DEFAULTS[chica] || DEFAULTS.Ichika;
}

export function getImagenSelector(chica) {
  return DEFAULTS[chica] || DEFAULTS.Ichika;
}
