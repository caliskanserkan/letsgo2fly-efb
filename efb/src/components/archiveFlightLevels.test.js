// archiveFlightLevels.test.js — SEVIYE / IRTIFA AYRIMI (sunucu tarafi)
//
// 🔴 20 AGU 2026 SAHA (Serkan, EGLF-LTAC): "alcalmada FMS rota girdim foto
//    ile, irtifalari FL algiliyor" · "FMS FL'i sadece seviyelere koyuyor,
//    bizim decoder uydurdu."
//
// Uretimden cikan kayit (flt_report id=75):
//    NAMAN  fl:"FL392"  fl_actual:"FL450"
//    TOVNA  fl:"4700"   fl_actual:"FL450"   <- ucak 4700 ft'te alcaliyordu
//
// KOK NEDEN: `flLevel` HER ciplak sayiyi seviye sayiyordu. Iki sonucu vardi:
//   ① ekranda `FL4700` / `FL3200` diye OLMAYAN ucus seviyeleri cizildi
//   ② `flActual`in "CLB/DSC/kot -> dokunma" korumasi acildi ve alcalma
//      noktasina SEYIR SEVIYESI damgalandi
//
// Bu test sunucunun KENDI fonksiyonunu kaynaktan cikarip kosturur — benim
// yeniden yazdigim bir kopyayi degil. iOS'taki ikizi CruiseLevelTests'te.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../../supabase/functions/archive-flight/index.ts');

/** Kaynaktan tek bir ok-fonksiyonu cikarip TS tiplerinden arindirarak calistirir. */
function sunucuFonksiyonu(ad) {
  const src = fs.readFileSync(SRC, 'utf8');
  const i = src.indexOf(`const ${ad} = (`);
  if (i < 0) throw new Error(`${ad} kaynakta bulunamadi — isim degistiyse test guncellenmeli`);
  // Fonksiyon govdesinin sonu: ilk "\n    };"
  const j = src.indexOf('\n    };', i);
  if (j < 0) throw new Error(`${ad} govdesi cikarilamadi`);
  const kod = src.slice(i, j + '\n    };'.length)
    .replace(/:\s*(unknown|string \| null|boolean|number \| null|number)\s*(?==>)/g, '')
    .replace(/\(s:\s*unknown\)/g, '(s)')
    .replace(/\(i:\s*number\)/g, '(i)');
  // eslint-disable-next-line no-new-func
  return new Function(`${kod} return ${ad};`)();
}

describe('flLevel — dort hane seviye DEGIL, feet irtifadir', () => {
  const flLevel = sunucuFonksiyonu('flLevel');

  test('cikarma calisti (sessiz gecmesin)', () => {
    expect(typeof flLevel).toBe('function');
  });

  test('4700 / 3200 IRTIFADIR — FL4700 uretilmez', () => {
    expect(flLevel('4700')).toBeNull();
    expect(flLevel('3200')).toBeNull();
    expect(flLevel('12800')).toBeNull();
  });

  test('uc haneye kadar seviyedir (OFP seyri "410" diye yazar)', () => {
    expect(flLevel('410')).toBe('FL410');
    expect(flLevel('FL392')).toBe('FL392');
    expect(flLevel('FL083')).toBe('FL083');
  });

  test('safha isareti ve kot seviye degildir', () => {
    expect(flLevel('CLB')).toBeNull();
    expect(flLevel('DSC')).toBeNull();
    expect(flLevel('3158ft')).toBeNull();
    expect(flLevel('')).toBeNull();
    expect(flLevel(null)).toBeNull();
  });
});

describe('flActual — alcalmada seyir seviyesi DAMGALANMAZ', () => {
  const src = fs.readFileSync(SRC, 'utf8');

  // Govde `entries`/`wpts` kapanislarina bagli oldugu icin calistirilamiyor;
  // burada kusurun geri gelmesini engelleyen YAPISAL sartlar denetlenir.
  test('alcalma basladiysa tasima yapilmaz', () => {
    expect(src).toMatch(/if \(dscIdx != null && i >= dscIdx\) return null;/);
  });

  test('pilotun USE DSC girisi kayda DSC olarak gecer', () => {
    expect(src).toMatch(/if \(isDSC\(ownEntry\)\) return DSC;/);
  });

  test('DSC geriye dogru da tasinir (15 Agu kurali)', () => {
    expect(src).toMatch(/if \(isDSC\(e\)\) return DSC;/);
  });

  test('kot kisiti alcalma baslangici sayilmaz', () => {
    expect(src).toMatch(/if \(isAltitudeFeet\(t\)\) continue;/);
  });
});
