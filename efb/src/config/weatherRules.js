// ─── RENK TANIMLARI ───────────────────────────────────────────
export const COLORS = {
  red:    '#e02020',
  orange: '#e8731a',
  yellow: '#f0c040',
  green:  '#2d9e5f',
  white:  '#e8e8e8',
  dim:    '#999999',
};

// ─── GÖRÜŞ MESAFESİ (Visibility) ──────────────────────────────
export function getVisibilityColor(meters) {
  if (meters === 9999)    return COLORS.green;
  if (meters >= 2000)     return COLORS.white;
  if (meters >= 1000)     return COLORS.yellow;
  if (meters >= 800)      return COLORS.orange;
  return COLORS.red;
}

// ─── VERTİKAL VİSİBİLİTY (VV) ────────────────────────────────
export function getVVColor(feet) {
  if (feet > 400)         return COLORS.white;
  if (feet >= 200)        return COLORS.yellow;
  if (feet >= 100)        return COLORS.orange;
  return COLORS.red;
}

// ─── TAVAN (Ceiling - BKN/OVC) ────────────────────────────────
export function getCeilingColor(feet) {
  if (feet >= 3000)       return COLORS.white;
  if (feet >= 1500)       return COLORS.yellow;
  if (feet >= 500)        return COLORS.orange;
  return COLORS.red;
}

// ─── HAVA FENOMENLERİ ─────────────────────────────────────────
export const PHENOMENA_RULES = [
  // Kırmızı - Kritik
  { pattern: /\bTS\b|\bTSRA\b|\bTSGR\b|\bTSPE\b/g,     color: COLORS.red    },
  { pattern: /\bFG\b|\bFZFG\b/g,                         color: COLORS.red    },
  { pattern: /\bFZRA\b|\bFZDZ\b|\bFZSN\b/g,             color: COLORS.red    },
  { pattern: /\bSQ\b|\bFC\b|\bSS\b|\bDS\b/g,            color: COLORS.red    },
  // Turuncu - Dikkat
  { pattern: /\bRA\b|\bSN\b|\bPL\b|\bGR\b/g,            color: COLORS.orange },
  { pattern: /\-SHRA\b|\-RASN\b|\-SHSN\b/g,             color: COLORS.orange },
  { pattern: /\bBR\b/g,                                   color: COLORS.orange },
  // Sarı - Bilgi
  { pattern: /\bSCT\b/g,                                  color: COLORS.yellow },
  { pattern: /\bBECMG\b|\bTEMPO\b/g,                     color: COLORS.yellow },
  // Yeşil - Normal
  { pattern: /\bCAVOK\b|\bNOSIG\b/g,                     color: COLORS.green  },
];

// ─── NOTAM ANAHTAR KELİMELER ──────────────────────────────────
export const NOTAM_RULES = [
  // Kırmızı
  { keywords: ['CLSD', 'CLOSED', 'U/S', 'UNSERVICEABLE', 'PROHIBITED'], color: COLORS.red    },
  // Turuncu
  { keywords: ['INOP', 'LIMITED', 'RESTRICTED', 'SUSPEND', 'NOT AVBL'], color: COLORS.orange },
  // Sarı
  { keywords: ['WORK IN PROGRESS', 'WIP', 'CONSTRUCTION', 'CONST'],      color: COLORS.yellow },
];

// ─── METAR/TAF METNİNİ PARSE ET ───────────────────────────────
export function parseWeatherText(text) {
  // Her token'ı kontrol et ve renklendir
  const tokens = text.split(/(\s+)/);
  return tokens.map((token, i) => {
    const trimmed = token.trim();
    if (!trimmed) return { text: token, color: null };

    // Visibility kontrolü (4 haneli sayı veya 9999)
    const visMatch = trimmed.match(/^(\d{4})$/);
    if (visMatch) {
      const meters = parseInt(visMatch[1]);
      if (meters <= 9999) {
        return { text: token, color: getVisibilityColor(meters) };
      }
    }

    // VV kontrolü (VV010 gibi)
    const vvMatch = trimmed.match(/^VV(\d{3})$/);
    if (vvMatch) {
      const feet = parseInt(vvMatch[1]) * 100;
      return { text: token, color: getVVColor(feet) };
    }

    // BKN/OVC kontrolü (BKN030 gibi)
    const ceilMatch = trimmed.match(/^(BKN|OVC)(\d{3})$/);
    if (ceilMatch) {
      const feet = parseInt(ceilMatch[2]) * 100;
      return { text: token, color: getCeilingColor(feet) };
    }

    // Fenomen kontrolü
    for (const rule of PHENOMENA_RULES) {
      if (rule.pattern.test(trimmed)) {
        rule.pattern.lastIndex = 0;
        return { text: token, color: rule.color };
      }
    }

    return { text: token, color: null };
  });
}

// ─── NOTAM METNİNİ PARSE ET ───────────────────────────────────
export function parseNotamText(text) {
  let result = text;
  let highestColor = null;

  for (const rule of NOTAM_RULES) {
    for (const kw of rule.keywords) {
      if (text.toUpperCase().includes(kw)) {
        if (!highestColor) highestColor = rule.color;
      }
    }
  }

  return { text: result, highlightColor: highestColor };
}

// ─── NOTAM BADGE RENGİ ────────────────────────────────────────
export function getNotamBadgeColor(text) {
  const upper = text.toUpperCase();
  for (const rule of NOTAM_RULES) {
    for (const kw of rule.keywords) {
      if (upper.includes(kw)) return rule.color;
    }
  }
  return COLORS.dim;
}