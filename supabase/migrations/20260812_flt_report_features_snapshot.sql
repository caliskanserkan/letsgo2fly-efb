-- 12 Agu 2026 — RAPOR, UCUSUN KENDI KONFIGURASYONUYLA URETILIR (build 43, madde 1)
--
-- SORUN: `archive-flight` bugune kadar `customers.features`i CANLI okuyordu.
--   (a) Ucus acikken bir anahtar kapatilirsa iPad dogru davraniyordu (aktivasyonda
--       donmus kopya) ama RAPOR yeni konfigurasyonu kullaniyordu — tablette
--       kaydedilen QNH/VREF satirlari rapora hic girmiyordu.
--   (b) REGEN REPORT eski bir ucusun raporunu BUGUNKU konfigurasyonla yeniden
--       uretiyordu; aradan gecen surede kapatilan modulun satirlari GECMIS
--       RAPORDAN dusuyordu.
-- Ikisi de TASARIM ILKESI 3 ihlali: "denetim izi silinemez / gecmis veri KALIR".
--
-- COZUM: ucus hangi konfigurasyonla yurutulduyse rapor da onunla uretilir.
-- iPad aktivasyonda dondurdugu kopyayi arsiv cagrisiyla gonderir; sunucu onu
-- BURAYA yazar ve rapor (ilk uretimde de, REGEN'de de) once bunu kullanir.
--
-- NEDEN `flt_report`: rapor PDF'i bu tablodan uretilir (tek kaynak, Ilke 2) ve
-- REGEN de bu satiri geri okur. `archived_flights` operasyonel arsiv kaydidir,
-- raporun konfigurasyonu degil.
--
-- Bu goc DAVRANIS DEGISTIRMEZ: kolonlar NULL gelir. Mevcut arsivlerde kayit
-- yoktur; REGEN'de kayit yoksa rapor HICBIR bolumu budamaz (Kural 8 —
-- belirsizlik = ACIK; budamak gecmis rapordan satir dusurmek olurdu).

BEGIN;

-- Ucusun donmus modul konfigurasyonu. iPad'in 10 `ui.*` anahtari acikca yazili
-- gelir (sapmalar degil, TAMAMI — kayit kendi kendine yetmeli: uygulama surumu
-- degisip katalog varsayilanlari kayarsa eski ucusun raporu kaymasin), sunucu
-- arsiv anindaki `admin.*` sapmalarini altina serer.
ALTER TABLE flt_report
  ADD COLUMN IF NOT EXISTS features_snapshot jsonb;

-- Konfigurasyonun KAYNAGI — raporun alt bilgisine basilir (Ilke 1: sistem neyi
-- neye gore uretttigini soyler).
--   'device' : ucusun kendi donmus kopyasi (iOS build 43+)
--   'server' : iPad kopya gondermedi (eski surum / donmamis plan) -> ARSIV
--              ANINDAKI canli konfigurasyon donduruldu
-- NULL      : bu goc oncesi arsivlenmis ucus, kayit yok.
ALTER TABLE flt_report
  ADD COLUMN IF NOT EXISTS features_source text
  CHECK (features_source IN ('device', 'server'));

COMMIT;
