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

// normDuration: SÜRE girişleri (blok / uçuş süresi). Serkan (6 Ağu): "düz rakam
//     bile yazsam HH:MM üretmesi gerekirdi" — maskenin işi bu, kullanıcı iki
//     nokta aramamalı.
//     normTime'dan FARKI RAKAM YORUMU: normTime ilk iki haneyi SAAT sayar
//     (saat-of-day geleneği), o yüzden "308" → "23:8" gibi çöp üretir. Sürede
//     SON İKİ HANE DAKİKADIR: "308" → 3:08, "0308" → 3:08, "1230" → 12:30.
//     TAVAN 23:59 (Serkan, 6 Ağu: "bizim uçaklar zaten o kadar uçmuyor") —
//     tek bacağın blok süresi 24 saati aşmaz; aşan bir değer giriş hatasıdır.
export const normDuration = (v) => {
  const d = String(v ?? '').replace(/[^\d]/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  let hh = String(Number(d.slice(0, d.length - 2)));   // bastaki sifirlar atilir
  let mm = d.slice(-2);
  if (Number(hh) > 23) hh = '23';
  if (Number(mm) > 59) mm = '59';
  return `${hh}:${mm}`;
};
