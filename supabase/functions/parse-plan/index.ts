// GO2 eFB — parse-plan Edge Function
// PDF'i sunucuda parse eder, plans + plan_versions tablolarina yazar.
// Tarayici pdf.js worker sorunu ortadan kalkar. Web ve iOS ortak kapisi.
//
// Girdi (POST JSON): { filename: string, pdf_base64: string }
// Cikti: { ok, results: [{dep,dest,status}], count }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocumentProxy } from "https://esm.sh/unpdf@0.11.0";
// Faaliyet tipi tespiti web ile TEK KAYNAK (FTLEngine'in bundle edilmesiyle
// ayni mimari karar) — deploy sirasinda esbuild bu dosyayi da paketler.
import { detectOperationType } from "../../../efb/src/components/planOps.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// ─── PDF text extraction (Y-koordinat mantigi, eski pdf.js formatiyla BIREBIR) ──
// unpdf sadece text extraction icin degil; getDocumentProxy ile pdf.js proxy'sine
// erisip, her item'in Y koordinatina gore newline ekleyerek gercek satir yapisini
// koruyoruz. Boylece NavLog/WX/koordinat parse'lari eski formatla ayni calisir.
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let pageText = "";
    for (const item of (content.items as any[])) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        pageText += "\n";
      }
      pageText += item.str;
      if (item.hasEOL) pageText += "\n";
      else pageText += " ";
      lastY = y;
    }
    text += pageText + "\n";
  }
  return text;
}

// ─── Parse helpers (App.js'ten birebir port) ──────────────────────────────────
// ── PERFORMANS ORNEGI (16 Agu 2026, Serkan) ──────────────────────────────
// "Bu yuklenenler bir istatistik icin tutuldugundan planin silinmesi veriyi
//  silmesin."  ·  "Demo sureci bitince butun planlari silecegim (hard delete),
//  ama bu sayisal veriler demo surecinde de GERCEK ucus verileri — uydurulmus
//  planlar degil; bizim icin bir veri havuzu olustu, uzerine yazarak devam
//  etmemiz lazim."
//
// Bu yuzden olcum `plans` satirindan AYRI bir tabloda da tutulur. Plan
// silinse (hard delete dahil) ornek yerinde kalir — `plan_id` yalnizca bir
// referanstir, FOREIGN KEY DEGILDIR.
//
// Havuza YALNIZ olculmus ucus girer: sure veya yakit okunamadiysa satir
// yazilmaz. Eksik ornek, ortalamayi sessizce bozmaktan iyidir (Ilke 1).
async function savePerfSample(admin: any, s: any, planId: string, customerId: string): Promise<string | null> {
  const hhmmToMin = (v: string | null | undefined) => {
    const m = String(v ?? '').match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const digits = (v: unknown) => {
    const n = Number(String(v ?? '').replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const eteMin = hhmmToMin(s.ete);
  const tripFuel = digits(s.trip_fuel);
  if (!eteMin || !tripFuel) return null;             // olculmemis ucus havuza girmez

  // Seviye: `cruise_fl` bos gelebiliyor (CRUISE: satiri olmayan OFP'ler);
  // o zaman FPL'in `level_speed` alanindan okunur ("FL300 / 482 TAS").
  const flNum = digits(s.cruise_fl) ?? digits(String(s.level_speed ?? '').match(/FL\s*(\d{2,3})/)?.[1]);

  // 🔴 HATA SESSIZ KALMAZ (16 Agu 2026 dersi). Ilk surumde `catch` hatayi
  // yutuyordu ve tablo BOS kaldi; sebebi ancak elle arayinca bulundu:
  // `on_conflict` hedefi KISMI unique index'ti (`WHERE plan_id IS NOT NULL`)
  // ve PostgREST onu kabul etmiyor. Supabase istemcisi hatayi FIRLATMAZ,
  // `{ error }` olarak DONER — `try/catch` bu yuzden hicbir sey yakalamadi.
  // Artik hata cagirana bildirilir; plan yuklemesi yine durmaz (istatistik
  // ikincil bir istir) ama sessizce kaybolmaz da (Ilke 1).
  const { error } = await admin.from("aircraft_perf_samples").upsert({
    customer_id: customerId, reg: s.reg, plan_id: planId,
    dep: s.dep, dest: s.dest, flight_date: s.date || null,
    ete_min: eteMin, trip_fuel_lb: tripFuel, cruise_fl: flNum,
    climb_min: s.climb_min ?? null, desc_min: s.desc_min ?? null,
    zfw_lb: digits(s.zfw),
  }, { onConflict: "plan_id" });
  if (error) {
    console.error("[parse-plan] perf sample FAILED:", error.message);
    return error.message;
  }
  return null;
}

function parseDispatchNo(text: string): string | null {
  const match = text.match(/\[#(DISP\d+)#\]/);
  return match ? match[1] : null;
}

function parseAllSectors(text: string): any[] {
  const sectors: any[] = [];

  const tableRows = [...text.matchAll(
    /TC-([A-Z]{3})\s+(\d{1,2}\s+\w{3}\s+\d{4})\s+([A-Z]{4})\s+(\d{2}:\d{2})\s+\d{2}:\d{2}\s+(\d{1,2}\s+\w{3}\s+\d{4})\s+([A-Z]{4})\s+(\d{2}:\d{2})\s+\d{2}:\d{2}\s+(\d{2}:\d{2})\s+(\d+)/g
  )];
  for (const row of tableRows) {
    sectors.push({ reg: `TC-${row[1]}`, date: row[2], dep: row[3], std: row[4], dest: row[6], eta: row[7], ete: row[8], pax: row[9] });
  }

  if (sectors.length === 0) {
    const fplMatches = [...text.matchAll(
      /\(FPL-([A-Z0-9]+)-[A-Z]{2}[\s\S]*?-([A-Z]{4})(\d{4})[\s\S]*?-([A-Z]{4})(\d{4})/g
    )];
    for (const m of fplMatches) {
      const stdRaw = m[3], eteRaw = m[5];
      const regRaw = text.match(/REG\/([A-Z0-9]{4,6})/)?.[1] || '';
      const reg = regRaw ? `TC-${regRaw.slice(2)}` : '';
      sectors.push({ callsign: m[1], dep: m[2], std: `${stdRaw.slice(0,2)}:${stdRaw.slice(2)}`, dest: m[4], ete: `${eteRaw.slice(0,2)}:${eteRaw.slice(2)}`, reg, date: '', pax: '', eta: '' });
    }
  }

  const ofpBlocks = [...text.matchAll(
    /FMS\s+IDENT=(\S+)\s+Log\s+Nr\.?:?\s*\d+\s+Page\s+1\s+([A-Z]{4}-[A-Z]{4})\s+([A-Z0-9]+)([\s\S]*?)(?=FMS\s+IDENT=|$)/g
  )];
  const blockMap: Record<string,string> = {};
  const fmsMap: Record<string,string> = {};
  for (const b of ofpBlocks) { blockMap[b[2]] = b[4]; fmsMap[b[2]] = b[1]; }

  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dof = text.match(/DOF\/(\d{2})(\d{2})(\d{2})/);
  let globalDate = '';
  if (dof) {
    const dofDay = dof[3], dofMon = parseInt(dof[2]) - 1, dofYearFull = `20${dof[1]}`;
    globalDate = `${dofDay} ${months[dofMon]} ${dofYearFull}`;
    const hdr = text.match(/STD\s+(\d{2})-([A-Z]{3})-(\d{2,4})/);
    if (hdr) {
      const hMonIdx = months.indexOf(hdr[2].toUpperCase());
      const hYearFull = hdr[3].length === 2 ? `20${hdr[3]}` : hdr[3];
      const dofKey = `${dofDay.padStart(2,'0')}-${dofMon}-${dofYearFull}`;
      const hdrKey = `${hdr[1].padStart(2,'0')}-${hMonIdx}-${hYearFull}`;
      if (hMonIdx === -1) console.warn(`[OFP DATE] Baslik ay parse edilemedi: ${hdr[2]}`);
      else if (dofKey !== hdrKey) console.warn(`[OFP DATE] UYUSMAZLIK! DOF=${globalDate} baslik=${hdr[1]} ${hdr[2]} ${hYearFull}`);
    } else console.warn(`[OFP DATE] Baslikta STD tarihi yok, sadece DOF (${globalDate})`);
  }

  const globalOperator = text.match(/OPR\/([A-Z][A-Z\s]+?)(?:\s+RMK|\s+SEL|\s+PBN|\n)/)?.[1]?.trim() || '';
  const globalAcType   = text.match(/GLF4|GLF5|GIV|GIV-SP|GV|CL60|CL35|GL5T|GL6T|GLEX|C550|C560|C680|F900|FA7X|FA8X/)?.[0] || '';
  const globalReg = (() => {
    const raw = text.match(/REG\/([A-Z0-9]{4,6})/)?.[1] || text.match(/REGISTRATION:\s*TC-([A-Z]{3})/)?.[1] || '';
    if (!raw) return '';
    return raw.startsWith('TC') ? raw : `TC-${raw.slice(2)}`;
  })();
  const globalCallsign = text.match(/\(FPL-([A-Z0-9]+)-/)?.[1] || '';

  for (const sector of sectors) {
    const routeKey = `${sector.dep}-${sector.dest}`;
    const block = blockMap[routeKey] || '';
    sector.trip_fuel      = block.match(/\bTRIP\s+([\d]+)/)?.[1] || '';
    sector.alternate_fuel = block.match(/\bALTERNATE\s+([\d]+)/)?.[1] || '';
    sector.reserve_fuel   = block.match(/\bFINAL\s+RESERVE\s+([\d]+)/)?.[1] || '';
    sector.total_fob      = block.match(/\bTOTAL\s+FOB\s+([\d]+)/)?.[1] || '';
    sector.fob            = sector.total_fob ? `${parseInt(sector.total_fob).toLocaleString()} lb` : '';
    sector.tow            = block.match(/\bTOW\s+([\d]+)\s*Lbs/i)?.[1] || '';
    sector.zfw            = block.match(/\bZFW\s+([\d]+)\s*Lbs/i)?.[1] || '';

    // 🔴 SESSIZ DUSUS YOK (18 Agu 2026 saha bulgusu — Serkan):
    // Cikarici etiketlerin arasina fazladan bosluk koydu ("FMS   IDENT="),
    // blockMap kalibi tutmadi, blok BOS kaldi ve yukaridaki YEDI alan birden
    // sessizce '' oldu. Plan "basariyla yuklendi" dedi; eksiklik UCUSTAN SONRA
    // raporda goruldu (FOB Plan / vs OFP Plan bos). Ilke 2: sessiz basarisizlik
    // yok. Artik ne olduguna dair BIR SATIR yaziliyor ve admin panelde gorunuyor.
    // Ayrim onemli: blok hic bulunamadi mi (kalip/cikarici sorunu), yoksa blok
    // var ama yakit satiri mi yok (belge farkli basilmis)?
    sector.fuel_parse = !block            ? 'no_block'
                      : !sector.total_fob ? 'no_total_fob'
                      : !sector.trip_fuel ? 'no_trip'
                      :                     'ok';
    // FPL (ICAO Field 15) — bu sector'e AIT FPL blogundan rota + seviye/hiz cek.
    // 🔴 3 Agu saha bulgusu (FF'e onceki bacagin noktasi push edildi — LEIB
    // kalkisinda IMR/Izmir): eski dep/dest kontrolleri YON KORUYDU. ICAO FPL'de
    // kalkis satiri (Field 13, "-LTFE1200") ile varis satiri (Field 16,
    // "-LEIB0315") ayni bicimdedir (4 harf + rakam). A→B ve B→A ayni pakette
    // olunca HER blok iki sektorun de dep/dest testinden geciyordu; ilk blok
    // kazaniyor, donus bacagina GIDISIN rotasi (+atc_fpl) yaziliyordu.
    // Duzeltme: alan SIRASI zorunlu — kalkis satiri → hiz/seviye+rota → varis
    // satiri TEK desende aranir; yon kendiliginden dogrulanir, ters bacak blogu
    // desene giremez.
    let fplRoute = '';
    let fplLevelSpeed = '';
    const fplBlocks = [...text.matchAll(/\(FPL-[\s\S]*?(?=\(FPL-|$)/g)];
    for (const fb of fplBlocks) {
      const fbText = fb[0];
      const legRe = new RegExp(
        `^-${sector.dep}\\d{3,4}\\s+-([NKM]\\d{3,4})(F\\d{3}|S\\d{4}|A\\d{3}|M\\d{4})\\s+([\\s\\S]*?)\\n\\s*-${sector.dest}\\d{3,4}`, 'm');
      // Desen bu blokta yoksa blok BASKA bacagindir — atc_fpl de yazilmaz
      // (eski kod yanlis bloktan atc_fpl yaziyordu, ayni kusurun parcasi).
      const rmatch = fbText.match(legRe);
      if (!rmatch) continue;
      const spd = rmatch[1];   // N0485
      const lvl = rmatch[2];   // F330
      fplRoute = rmatch[3].replace(/\s+/g, ' ').trim();
      // Seviye: F330 -> FL330
      let lvlStr = '';
      if (lvl.startsWith('F')) lvlStr = 'FL' + lvl.slice(1);
      else lvlStr = lvl;
      // Hiz: N0485 -> 485 TAS
      let spdStr = '';
      if (spd.startsWith('N')) spdStr = parseInt(spd.slice(1)) + ' TAS';
      else if (spd.startsWith('M')) spdStr = 'M.' + spd.slice(2);
      else if (spd.startsWith('K')) spdStr = parseInt(spd.slice(1)) + ' KMH';
      fplLevelSpeed = `${lvlStr} / ${spdStr}`;
      // Tam ATC FPL blogu (oldugu gibi, parantezden parantize)
      const fplFull = fbText.match(/\(FPL-[\s\S]*?\)/);
      sector.atc_fpl = fplFull ? fplFull[0].trim() : fbText.trim();

      // TESCIL — ATC FPL'in REG/ alanindan, OLDUGU GIBI (11 Agu 2026, Serkan:
      // "tescili ATC FPL'den okuyalim cunku o resmi bir paragraf").
      // REG/ ICAO ucus planinin 18. alanidir, bicimi standarttir; OFP tablosunun
      // duzeni ise dispatcher'a gore degisir. Ayrica burada TC- UYDURULMAZ —
      // tablo yolundaki `TC-${...}` kalibi yabanci tescilli musteride yanlis
      // tescil ureten bir tuzaktir (ayri madde, bkz. CLAUDE.md).
      const regFpl = fbText.match(/REG\/([A-Z0-9-]{3,10})/)?.[1] || '';
      if (regFpl) sector.fpl_reg = regFpl.trim();

      // ── FAALIYET TIPI PLANDAN (6 Agu 2026, Serkan): ucusun niteligi ATC
      // FPL'inde zaten yazili — elle secime bagli kalmayalim.
      // MANTIK BURADA DEGIL: `efb/src/components/planOps.js` TEK KAYNAK; sinama
      // koşumu da onu import eder. Kural iki yerde ayri ayri durmaz.
      const op = detectOperationType(fbText);
      sector.fpl_remark = op.rmk;
      sector.fpl_flight_type = op.flightType;
      sector.operation_type = op.operationType;
      sector.operation_type_source = op.source;
      break;
    }
    // FIR'lar — iç hat dahil her bacakta bilinmeli (CZIB kontrolü için).
    // Öncelik: (1) navlog FIR kolonu (sektöre özel, KALKIŞ FIR'ı dahil — EET/ onu yazmaz),
    //          (2) paket SIGMET FIR listesi (sektör bazlı değil ama muhafazakâr üst küme:
    //              fazladan FIR kontrolü yalnız fazladan uyarı üretir, atlama üretmez).
    // DİKKAT: blockMap yalnız 1. sayfayı taşır; navlog satırları 2. sayfadan itibaren gelir.
    // Bu yüzden FIR taraması sektörün TÜM sayfalarında yapılır.
    // Navlog satır deseni: "IVGU1B DE23 LTBB 308029 311 190 ..." -> 3. kolon FIR,
    // 4. kolon 6 haneli rüzgar, ardından TAS+MH kolonları GELMEK ZORUNDA.
    // (SIGMET başlığı "WS TU31 LTAC 110435" rüzgardan sonra bittiği için elenir.)
    const navFirs = new Set<string>();
    for (const pb of text.matchAll(/FMS\s+IDENT=\S+\s+Log\s+Nr\.?:?\s*\d+\s+Page\s+\d+\s+([A-Z]{4}-[A-Z]{4})\s+[A-Z0-9]+([\s\S]*?)(?=FMS\s+IDENT=|$)/g)) {
      if (pb[1] !== routeKey) continue;
      for (const fm of pb[2].matchAll(/^\s*\S+\s+\S+\s+([A-Z]{4})\s+\d{6}\s+\d{2,3}\s+\d/gm)) navFirs.add(fm[1]);
    }
    if (navFirs.size === 0) {
      const sig = text.match(/SIGMET\s+reports\s+are\s+searched\s+for\s+following\s+FIR\s+ICAO\s+list:\s*([A-Z\s]+?)\./);
      if (sig) for (const f of sig[1].matchAll(/\b[A-Z]{4}\b/g)) navFirs.add(f[0]);
    }
    sector.route_firs = [...navFirs].sort();
    // Rota: FPL varsa onu kullan (temiz noktalar), yoksa ROUTE: fallback
    sector.route          = fplRoute || (block.match(/ROUTE:\s*([\s\S]*?)(?=\n\s*FUEL\s+TIME|\n\s*1\s*ST\s+ALT|\n\s*Take\s+Off|\n\s*\n|$)/)?.[1]?.replace(/\s+/g, ' ').trim() || '');
    sector.level_speed    = fplLevelSpeed;
    sector.fms_ident      = fmsMap[routeKey] || '';
    const alt1 = block.match(/1\s*ST\s+ALT\s+([A-Z]{4})/)?.[1];
    const alt2 = text.match(new RegExp(`-${sector.dest}\\s*\\d{4}\\s+([A-Z]{4})`))?.[1];
    const alt3 = text.match(new RegExp(`${sector.dep}\\s*\\d{4}\\s+([A-Z]{4})`))?.[1];
    sector.alternate = alt1 || alt2 || alt3 || '';
    const flMatch = block.match(/CRUISE:[^\d]*(\d{3})/);
    sector.cruise_fl = flMatch ? `FL${flMatch[1]}` : '';
    const logMatch = text.match(new RegExp(`Log Nr\\.?:?\\s*(\\d+)\\s+Page\\s+1\\s+${sector.dep}-${sector.dest}`));
    sector.log_nr = logMatch?.[1] || '';
    sector.ac_type  = sector.ac_type  || globalAcType;
    sector.reg      = sector.reg      || globalReg;
    sector.date     = sector.date     || globalDate;
    sector.operator = sector.operator || globalOperator;
    sector.callsign = sector.callsign || globalCallsign;
    if (!sector.eta && sector.std && sector.ete) {
      const [sh, sm] = sector.std.split(':').map(Number);
      const [eh, em] = sector.ete.split(':').map(Number);
      const total = sh*60 + sm + eh*60 + em;
      sector.eta = `${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
    }

    // ── SAFHA SURELERI (16 Agu 2026, Serkan) ────────────────────────────
    // "Tirmanma ve alcalma sureleri de planda var, oradan da ortalama bir
    //  tirmanis/alcalis suresi cikaralim; bizim sabit degerler anlamsiz olur
    //  cunku elimizde veri var."  ·  "Veriyi bizim navlogdan oku, orda bacak
    //  bacak ayri CLB ve DSC belli."
    //
    // Navlog satirinin FL kolonunda `CLB` / `DSC` yazar ve satir KUMULATIF
    // sureyi tasir:  "23  CLB  406  306  VAR  0  9  0:01"
    //   tirmanmanin bittigi an  = SON  CLB satirinin dakikasi
    //   alcalmanin basladigi an = ILK  DSC satirinin dakikasi
    //   alcalma suresi          = trip suresi - alcalma baslangici
    //
    // Ayni sayfa dongusu FIR taramasinda da kullaniliyor: `blockMap` yalniz
    // 1. sayfayi tasir, navlog satirlari 2. sayfadan itibaren gelir.
    // OLCULEMEYEN PLAN SESSIZ KALMAZ — sebebi `phase_parse`'a yazilir (Ilke 1).
    {
      // 🔑 IKI YAPISAL KURAL — ikisi de OLCULDU, esik UYDURULMADI:
      //
      // ① Safha isareti navlog satirinin 2. KOLONUNDA olmali (`MORA CLB ...`).
      //    Ayni sayfada baska tablolar da var ve onlarin satirlarinda `CLB`
      //    uctuncu kolonda gecebiliyor:
      //        "52  CLB  348 186 VAR 0 1 0:00"        <- navlog (dogru)
      //        "76  389.00  CLB  248 286 VAR 0 329 0:51" <- BASKA TABLO
      //    Ikincisi 51 dakikalik kumulatif suresiyle olcumu bozuyordu.
      //
      // ② Tirmanma, ALCALMA BASLAMADAN once biter. Alcalma baslangicindan
      //    sonra gelen bir `CLB` satiri tanim geregi baska bir tabloya aittir
      //    (ornegin alternatif meydan rotasi: 354 NM / 0:57).
      //
      // Bu iki kuralla elimizdeki 5 OFP'nin 9 bacaginin 9'u okunuyor —
      // TC-TSS (yeni lehce) dahil. Once yalnizca 4'u okunabiliyordu.
      const CLB_ROW = /^\s*\d+\s+CLB\b/, DSC_ROW = /^\s*\d+\s+DSC\b/;
      const clbAll: number[] = [], dsc: number[] = [];
      for (const pb of text.matchAll(/FMS\s+IDENT=\S+\s+Log\s+Nr\.?:?\s*\d+\s+Page\s+\d+\s+([A-Z]{4}-[A-Z]{4})\s+[A-Z0-9]+([\s\S]*?)(?=FMS\s+IDENT=|$)/g)) {
        if (pb[1] !== routeKey) continue;
        for (const line of pb[2].split('\n')) {
          const tm = line.match(/\b(\d{1,2}):(\d{2})\b/);
          if (!tm) continue;
          const mins = Number(tm[1]) * 60 + Number(tm[2]);
          if (CLB_ROW.test(line)) clbAll.push(mins);
          if (DSC_ROW.test(line)) dsc.push(mins);
        }
      }
      const descStart0 = dsc.length ? Math.min(...dsc) : null;
      const clb = descStart0 == null ? clbAll : clbAll.filter(v => v < descStart0);
      const tripMin = sector.ete
        ? (Number(sector.ete.split(':')[0]) * 60 + Number(sector.ete.split(':')[1]))
        : null;

      if (!clb.length || !dsc.length) {
        sector.phase_parse = 'no_phase_rows';
      } else if (tripMin == null) {
        sector.phase_parse = 'no_trip_time';
      } else {
        const climbEnd = Math.max(...clb);
        const descStart = Math.min(...dsc);
        // SIRA KONTROLU: alcalma tirmanmadan SONRA baslamali ve varistan ONCE
        // bitmeli. Cok bacakli OFP'de bir bacagin tirmanisi otekinin alcalisiyla
        // eslesirse burasi yakalar ve deger YAZILMAZ (uydurma sayi girmez).
        if (descStart > climbEnd && descStart < tripMin && climbEnd > 0) {
          sector.climb_min  = climbEnd;
          sector.desc_min   = tripMin - descStart;
          sector.phase_parse = 'ok';
        } else {
          sector.phase_parse = 'inconsistent';
        }
      }
    }
  }
  // HAYALET SEKTOR FIX (1 Agu 2026): FPL- blogu PDF'te iki kez gecince fallback
  // regex AYNI bacagi iki sektor uretiyordu -> tek bacakli ucusta sahte "-S1"
  // dispatch eki + mukerrer plan_versions satiri. (dep+dest+std) ile tekillestir.
  const seenSector = new Set<string>();
  return sectors.filter((s) => {
    const k = `${s.dep}|${s.dest}|${s.std}`;
    if (seenSector.has(k)) return false;
    seenSector.add(k);
    return true;
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // 1) Caller kimligi
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) return json({ error: "Missing Authorization token" }, 401);

    const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: userData, error: userErr } = await asCaller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);
    const callerId = userData.user.id;

    // 2) Caller'in customer_id'si (service-role ile RLS'siz oku)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: prof } = await admin.from("profiles").select("customer_id").eq("id", callerId).single();
    const callerCustomerId = prof?.customer_id ?? null;
    if (!callerCustomerId) return json({ error: "Caller has no customer_id" }, 403);

    // 3) PDF'i al
    const body = await req.json();
    const { filename, pdf_base64 } = body;
    if (!pdf_base64) return json({ error: "pdf_base64 required" }, 400);

    const bytes = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0));

    // 4) Parse
    const pdfText = await extractPdfText(bytes);
    const sectors = parseAllSectors(pdfText);
    if (sectors.length === 0) return json({ error: "No flight sectors found in PDF." }, 422);

    // 4b) TESCIL ↔ SIRKET KAPISI (11 Agu 2026, Serkan: "buyuk kusur")
    //
    // SORUN: plan kime ait sorusunun cevabi YALNIZCA yukleyenin profilinden
    // geliyordu; OFP'deki tescil hic kontrol edilmiyordu. Serkan'in senaryosu:
    // "herkese hizmet veren bir dispatch yanlislikla REC planini AAA veya XXX
    // sirketine verir ve pilotlar fark etmez." Sessiz cok-kiracili bulasma.
    //
    // KURAL (Serkan): SIRKET + UCAK + PILOT eslesirse kacak olmaz.
    //   - pilot ayagi zaten var (callerCustomerId yoksa yukarida reddediliyor)
    //   - eklenen ayak: tescil, YUKLEYENIN filosunda kayitli olmali
    //   - eslesme TESCIL uzerinden yapilir, UCAK TIPI uzerinden DEGIL
    //   - eslesme yoksa plan HIC OLUSMAZ, yani pilot onu hicbir zaman gormez
    //
    // KARSILASTIRMA NORMALLESTIRILMIS: "TCREC" ile "TC-REC" ayni sayilir.
    // Yazim farki yuzunden DOGRU planin reddedilmesi en kotu sonuc olurdu.
    const normReg = (v: string) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

    // TUM filo tek seferde okunur (uygulama olcegi kucuk) — hem yukleyenin
    // ucaklari hem de "bu tescil kimin?" sorusunun cevabi buradan cikar.
    const { data: allAc, error: fleetErr } = await admin
      .from("aircraft").select("registration, customer_id, customers(company_name)");
    if (fleetErr) return json({ error: `Fleet lookup failed: ${fleetErr.message}` }, 500);
    const fleetSet = new Set(
      (allAc ?? []).filter((a: any) => a.customer_id === callerCustomerId).map((a: any) => normReg(a.registration))
    );
    const ownerOf = (k: string) => (allAc ?? []).find((a: any) => normReg(a.registration) === k) as any;

    for (const s of sectors) {
      // Once ATC FPL'deki REG/ (resmi alan), yoksa tablodan cikan tescil.
      const planReg = s.fpl_reg || s.reg || "";
      const key = normReg(planReg);

      // Tescil hic okunamadiysa sahiplik DOGRULANAMAZ -> gecirmeyiz (Ilke 1).
      if (!key) {
        return json({ error: "Registration could not be read from the flight plan (ATC FPL REG/ missing). The plan was not uploaded." }, 422);
      }
      if (!fleetSet.has(key)) {
        // Baska sirkete mi ait, hic kayitli mi degil — sebebi AYRI AYRI yazilir.
        // "Bulunamadi" ile "baskasinin" ayni sey degildir; ikincisi kacak,
        // birincisi eksik kurulum.
        const owner = ownerOf(key);
        if (owner) {
          return json({
            error: `This flight plan belongs to another operator. ${planReg} is registered to ${owner.customers?.company_name ?? "another company"}, not to your company. The plan was not uploaded.`,
          }, 403);
        }
        return json({
          error: `${planReg} is not in your company's fleet. Add the aircraft under AIRCRAFTS first, then upload the plan again.`,
        }, 422);
      }
    }

    // 5) Her sektoru yaz (multi-leg)
    const results: any[] = [];
    for (let i = 0; i < sectors.length; i++) {
      const s = sectors[i];
      const baseDispatch = parseDispatchNo(pdfText) || parseDispatchNo(filename || '') || `${s.reg || 'MANUAL'}-${(s.date || '').replace(/\s/g, '')}`;
      const dispatchNo = sectors.length > 1 ? `${baseDispatch}-S${i + 1}` : baseDispatch;

      // Ayni sektor (dep+dest+std+date) + ayni sirket var mi?
      //
      // ZOMBI PLAN FIX (1 Agu 2026, saha: "ayni OFP'yi tekrar tekrar yukluyoruz"):
      // Eslesme YALNIZ CANLI planlarda aranir (available/active).
      //  - status='deleted' (admin silmis) eslesirse eskiden else daline dusuluyor,
      //    yalniz plan_versions ekleniyor, status 'deleted' KALIYORDU -> plan hicbir
      //    listede gorunmuyor ama UI "updated vN" diye BASARILI diyordu; pilot tekrar
      //    tekrar yukluyordu. Artik eslesmez -> TEMIZ yeni 'available' plan acilir.
      //  - status='archived' KUTSALDIR (denetim izi): ayni rota tekrar ucularsa
      //    arsivlenmis kaydin surum gecmisi DEGISMEZ, yeni plan acilir.
      // maybeSingle() yerine order+limit(1): birden fazla eslesmede eskiden PGRST116
      // hatasi SESSIZCE yutulup mukerrer INSERT'e donusuyordu (kontrolsuz cogalma).
      const { data: existingRows, error: exErr } = await admin.from("plans").select("id")
        .eq("dep", s.dep).eq("dest", s.dest).eq("std", s.std).eq("date", s.date)
        .eq("customer_id", callerCustomerId)
        .in("status", ["available", "active"])
        .order("created_at", { ascending: false }).limit(1);
      if (exErr) return json({ error: `Plan lookup failed: ${exErr.message}` }, 500);
      const existing = existingRows?.[0] ?? null;

      if (!existing) {
        const { data: plan, error: insErr } = await admin.from("plans").insert({
          dispatch_no: dispatchNo, subject: filename, dep: s.dep, dest: s.dest, date: s.date,
          std: s.std, eta: s.eta, ete: s.ete, fob: s.fob, ac_type: s.ac_type, reg: s.reg,
          route: s.route, fms_ident: s.fms_ident, level_speed: s.level_speed, atc_fpl: s.atc_fpl, route_firs: s.route_firs, operator: s.operator, callsign: s.callsign, alternate: s.alternate,
          fpl_remark: s.fpl_remark, fpl_flight_type: s.fpl_flight_type,
          operation_type: s.operation_type, operation_type_source: s.operation_type_source,
          trip_fuel: s.trip_fuel, alternate_fuel: s.alternate_fuel, reserve_fuel: s.reserve_fuel,
          fuel_parse: s.fuel_parse ?? null,
          tow: s.tow, zfw: s.zfw, pax: s.pax, cruise_fl: s.cruise_fl, log_nr: s.log_nr,
          // OFP'den olculen safha sureleri (OPS CALCULATOR yakit profili).
          climb_min: s.climb_min ?? null, desc_min: s.desc_min ?? null,
          phase_parse: s.phase_parse ?? null,
          status: "available", customer_id: callerCustomerId,
        }).select().single();
        if (insErr) return json({ error: `Insert failed: ${insErr.message}` }, 400);

        await admin.from("plan_versions").insert({ plan_id: plan.id, dispatch_no: dispatchNo, version_no: 1, raw_text: pdfText });
        const sampleErr = await savePerfSample(admin, s, plan.id, callerCustomerId);
        // PDF'i Storage'a yukle (OFP viewer icin)
        try {
          await admin.storage.from("ofp-pdfs").upload(`active/${plan.id}.pdf`, bytes, { upsert: true, contentType: "application/pdf" });
        } catch (e) { console.warn("PDF storage upload failed:", e); }
        results.push({ dep: s.dep, dest: s.dest, status: "created", ...(sampleErr ? { perf_sample: sampleErr } : {}) });
      } else {
        const { count } = await admin.from("plan_versions").select("*", { count: "exact", head: true }).eq("plan_id", existing.id);
        await admin.from("plan_versions").insert({ plan_id: existing.id, dispatch_no: dispatchNo, version_no: (count || 0) + 1, raw_text: pdfText });
        // Parser türevi alanlar yeniden yüklemede tazelenir (elle düzenlenen alanlara dokunulmaz)
        await admin.from("plans").update({ atc_fpl: s.atc_fpl, route_firs: s.route_firs,
          fpl_remark: s.fpl_remark, fpl_flight_type: s.fpl_flight_type,
          operation_type: s.operation_type, operation_type_source: s.operation_type_source,
          // Safha olcumu de parser turevidir: yeniden yuklemede tazelenir.
          // Ayrica GECMIS planlarin backfill'i bu yoldan yapilir (ayni OFP
          // tekrar yuklenince olcum girer) — ayri bir tarama isine gerek yok.
          climb_min: s.climb_min ?? null, desc_min: s.desc_min ?? null,
          phase_parse: s.phase_parse ?? null,
          fuel_parse: s.fuel_parse ?? null }).eq("id", existing.id);
        const sampleErr2 = await savePerfSample(admin, s, existing.id, callerCustomerId);
        results.push({ dep: s.dep, dest: s.dest, status: `updated v${(count || 0) + 1}`, ...(sampleErr2 ? { perf_sample: sampleErr2 } : {}) });
      }
    }

    return json({ ok: true, results, count: results.length });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
