// Deteccion facial / cum estilo Nakardas
export function resolverIntencionFacial(t) {
  if (!t) return null;
  if (/(me\s*)?corr[oa].{0,20}cara|cara.{0,20}(corr|semen|leche|cum|eyacul|facial)|facial|semen en (su |la )?cara|leche en (su |la )?cara|cum en (su |la )?cara|acabo en (su |la )?cara/.test(t)) {
    return { tagHint: ['me_corro_en_su_cara', 'corro_en_su_cara', 'facial', 'semen_cara'], label: 'cum_cara' };
  }
  if (/(me\s*)?corr[oa].{0,20}boca|boca.{0,20}(corr|semen|leche|cum|eyacul)|semen en (su |la )?boca|leche en (su |la )?boca|cum en (su |la )?boca|acabo en (su |la )?boca|traga (el |la )?(semen|leche|corrida)/.test(t)) {
    return { tagHint: ['me_corro_en_su_boca', 'corro_en_su_boca', 'semen_boca'], label: 'cum_boca' };
  }
  if (/(verga|pija|polla|pene).{0,15}(en|contra|sobre|choc).{0,10}cara|cara.{0,10}(con |contra )?(la )?(verga|pija|polla)/.test(t)) {
    return { tagHint: ['verga_en_su_cara', 'me_corro_en_su_cara'], label: 'verga_cara' };
  }
  return null;
}
