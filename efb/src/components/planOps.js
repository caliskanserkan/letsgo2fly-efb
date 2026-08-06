// planOps.js — ATC uçuş planından FAALİYET TİPİ tespiti (SHT-FTL/HG Md.9)
//
// TEK KAYNAK. Bu dosyayı hem `parse-plan` Edge Function'ı (bundle ederek) hem
// de sınama koşumu kullanır. Mantık iki yerde ayrı ayrı DURMAZ: kopyalanmış
// bir kural, kopyalardan biri düzeltilince sessizce ayrışır ve uçuş yanlış
// limit setine düşer. (FTLEngine'in Edge Function'a bundle edilmesiyle aynı
// mimari karar.)
//
// Kaynak: ICAO FPL alan 18 RMK/ ve alan 8 (uçuş kuralları + uçuş tipi).
//   RMK/BUSINESS FLIGHT → hava taksi (ticari)   [SHT-FTL/HG Md.22]
//   RMK/PRIVATE FLIGHT  → genel havacılık        [Md.25]
//   RMK/TRAINING…       → eğitim                 [Md.27]
//   RMK/AERIAL WORK     → hava işi               [Md.26]

// ICAO Alan 8'in ikinci harfi (uçuş tipi):
//   N = tarifesiz ticari · G = genel havacılık · S = tarifeli · M/X = diğer
//
// ALAN 8 ÇELİŞKİ NOTU — KAPSAM KARARI (6 Ağu 2026, Serkan):
// Bu işleticinin FPL şablonunda alan 8 HER uçuşta "N" — private uçuşlar dahil;
// uçuşlar YALNIZ remark ile ayrışıyor. Yani "PRIVATE + N" bir anomali değil
// SABİT KALIP. Her private uçuşa çelişki notu düşmek gürültü üretir, notların
// okunmamasına alışkanlık yaratır ve GERÇEK bir anomali geldiğinde kimse
// bakmaz. Bu yüzden:
//   N ve S → zayıf sinyal (catch-all): SESSİZ geçer, not düşülmez.
//   G      → güçlü sinyal ("bu uçuş genel havacılık" POZİTİF iddiası):
//            RMK ticari derse ÇELİŞKİ NOTU düşülür — o gerçek anomalidir.
// VERİ ATILMIYOR: ham alan 8 değeri ve ham remark kolonlarda AYNEN duruyor.
export function isFlightTypeInformative(f8) {
  return f8 === "G";
}

/** Ham FPL bloğundan faaliyet tipini çıkarır.
 *  fplText: "(FPL-TCXXX-IN ... RMK/BUSINESS FLIGHT ...)" — sektörün kendi bloğu.
 *  Dönen: { rmk, flightType, operationType, source, spellingVariant, disagrees } */
export function detectOperationType(fplText) {
  const text = fplText || "";
  const rmk = text.match(/RMK\/([\s\S]*?)(?=\s+[A-Z]{1,3}\/|\n\s*-|\)\s*$)/)?.[1]
    ?.replace(/\s+/g, " ").trim().toUpperCase() || null;
  const f8 = text.match(/\(FPL-[A-Z0-9]+-([IVYZ])([SNGMX])/)?.[2] || null;

  // YAZIM TOLERANSI (6 Ağu 2026, gerçek veride bulundu): dispatcher
  // "RMK/BUSSINESS FLIGHT" yazmış (çift S). Katı eşleşme bunu kaçırır ve uçuş
  // yanlış limit setine düşerdi. Harf dışı karakterler atılıp TOLERANSLI
  // desenle eşleştirilir; HAM REMARK aynen saklanır ki insan her zaman neyle
  // eşleştiğimizi görebilsin. Eşleşme yoksa TAHMİN YOK.
  const norm = rmk ? rmk.replace(/[^A-Z]/g, "") : null;
  const fromRmk = !norm ? null
    : /^BUS+I?N+ES+/.test(norm) ? "air_taxi"
    : /^PRIVAT/.test(norm) ? "general_aviation"
    : /^(TRAINING|TRG)/.test(norm) ? "training"
    : /^AERIALWORK/.test(norm) ? "aerial_work" : null;

  // "Yazım varyantı" = beklenen token ile BAŞLAMIYOR demektir (BUSSINESS gibi).
  // Token'la başlayıp devamında ek metin olması (slot kodları vb.) varyant
  // DEĞİLDİR — gerçek veride "BUSINESS FLIGHT ASLLTFEDGN4602000" görüldü.
  const exactToken = { air_taxi: "BUSINESSFLIGHT", general_aviation: "PRIVATEFLIGHT",
                       training: "TRAININGFLIGHT", aerial_work: "AERIALWORK" }[fromRmk || ""];
  const spellingVariant = !!(fromRmk && exactToken && !norm.startsWith(exactToken));
  const fromF8 = f8 === "G" ? "general_aviation" : (f8 === "N" || f8 === "S") ? "air_taxi" : null;
  const informative = isFlightTypeInformative(f8);
  const disagrees = !!(fromRmk && informative && fromF8 && fromF8 !== fromRmk);

  let operationType = null, source = null;
  if (fromRmk) {
    operationType = fromRmk;
    const notes = [];
    if (spellingVariant) notes.push("spelling variant");
    if (disagrees) notes.push(`ICAO field 8 = ${f8} disagrees`);
    source = `FPL RMK/${rmk}${notes.length ? ` (${notes.join("; ")})` : ""}`;
  } else if (fromF8) {
    operationType = fromF8;
    // RMK yoksa alan 8'e düşeriz. N/S ayırt edici olmadığı için bu bir
    // VARSAYIMDIR ve öyle yazılır — hava taksi limitleri Md.25'ten SIKI,
    // yani varsayım emniyetli yönde. Tahmin olduğu gizlenmez.
    source = informative
      ? `ICAO field 8 = ${f8} (no usable RMK)`
      : `ICAO field 8 = ${f8}, no RMK — ASSUMED AIR TAXI (stricter limits)`;
  } else {
    source = rmk ? `FPL RMK/${rmk} (not recognised)` : null;
  }

  return { rmk, flightType: f8, operationType, source, spellingVariant, disagrees };
}
