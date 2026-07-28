// inputFormat.js — operasyonel giriş formatları, TEK KAYNAK (iOS karşılığı: TextFormat.swift).
//
// up: operasyonel serbest metin girişleri BÜYÜK HARF (Türkçe karakter ASCII'ye çevrilir).
//     Login ve admin hesap formları HARİÇ; select'lere UYGULANMAZ (değerleri UUID taşır).
//
// normTime: SAAT girişleri yazarken otomatik "2000" → "20:00" (23/59 kısıtlı).
//     SÜRE alanları (388:10 gibi 24h üstü değerler, FTL baseline) bu formatı KULLANMAZ.

const TR_MAP = { 'ç':'c', 'Ç':'C', 'ğ':'g', 'Ğ':'G', 'ı':'i', 'İ':'I', 'ö':'o', 'Ö':'O', 'ş':'s', 'Ş':'S', 'ü':'u', 'Ü':'U' };

export const up = (v) =>
  String(v ?? '').replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => TR_MAP[ch]).toUpperCase();

export const normTime = (v) => {
  const d = String(v ?? '').replace(/[^\d]/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  let hh = d.slice(0, 2), mm = d.slice(2);
  if (Number(hh) > 23) hh = '23';
  if (mm.length === 2 && Number(mm) > 59) mm = '59';
  return `${hh}:${mm}`;
};
