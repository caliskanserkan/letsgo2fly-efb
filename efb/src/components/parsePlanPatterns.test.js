// parsePlanPatterns.test.js — KUSUR SINIFI BEKCISI
//
// 18 Agu 2026 saha bulgusu (Serkan, LTFE-LSGG): OFP yuklendi, "basarili"
// dendi, ama plans satirinda fob/trip_fuel/alternate_fuel/reserve_fuel/
// tow/zfw ve fms_ident BOS kaldi. Eksiklik UCUSTAN SONRA raporda goruldu.
//
// KOK NEDEN: sunucunun PDF metin cikaricisi etiket kelimelerinin arasina
// FAZLADAN BOSLUK koyuyor. Ayni belgede:
//     cikarici : "FMS   IDENT=S1498 Log Nr.: 5751 Page   1   LTFE-LSGG"
//                "TOTAL   FOB   21000"
//     kalip    : /FMS IDENT=.../        /\bTOTAL FOB\s+/
// Tek bosluklu literal tutmadi -> blockMap bos -> ondan beslenen YEDI alan
// birden sessizce '' oldu. `\s+` kullanan kaliplar (TRIP gibi) hayatta kaldi.
//
// Bu test o siniftan bir daha kalip girmesini engeller: parse-plan icindeki
// HICBIR regex literalinde duz bosluk olmayacak. Yeni bir etiket eklenirse
// (ornegin "MAX FUEL") ve duz bosluk kullanilirsa, saha degil BU TEST yakalar.
//
// Duzeltme yolu: etiketin icindeki bosluklari \s+ yap.
//     /\bTOTAL FOB\s+(\d+)/   ->   /\bTOTAL\s+FOB\s+(\d+)/
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../../supabase/functions/parse-plan/index.ts');

// Regex literalleri kaba ama yeterli bir tarayiciyla cikarilir.
const RX_LITERAL = /\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g;

const kodSatirlari = () =>
  fs.readFileSync(SRC, 'utf8').split('\n')
    .map((ln, i) => ({ no: i + 1, ln }))
    .filter(({ ln }) => {
      const s = ln.trim();
      return !(s.startsWith('//') || s.startsWith('*') || s.startsWith('/*'));
    });

test('parse-plan kaynagi bulunuyor', () => {
  expect(fs.existsSync(SRC)).toBe(true);
});

test('hicbir regex literalinde DUZ BOSLUK yok — cikarici bosluk sayisini degistiriyor', () => {
  const suclu = [];
  for (const { no, ln } of kodSatirlari()) {
    if (ln.includes('contentType')) continue;           // template string, regex degil
    for (const lit of ln.match(RX_LITERAL) || []) {
      if (lit.length > 8 && lit.includes(' ')) suclu.push(`  satir ${no}: ${lit}`);
    }
  }
  expect(suclu.join('\n')).toBe('');
});

// Bugun patlayan iki etiket ADIYLA kilitleniyor — yanlislikla geri alinmasin.
test('kritik etiketler bosluga toleransli yazilmis', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  for (const beklenen of [
    'FMS\\s+IDENT=',        // blockMap — bugun bunun yuzunden 7 alan bosaldi
    'TOTAL\\s+FOB',
    'FINAL\\s+RESERVE',
    'Log\\s+Nr',
  ]) {
    expect(src).toContain(beklenen);
  }
});
