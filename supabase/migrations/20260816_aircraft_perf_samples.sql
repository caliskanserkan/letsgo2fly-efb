-- ════════════════════════════════════════════════════════════════════════
-- UCAK PERFORMANS ORNEKLERI — istatistik icin kalici olcum kaydi
-- 16 Agustos 2026 · Serkan
--
-- "Bu yuklenenler bir istatistik icin tutuldugundan planin silinmesi veriyi
--  silmesin."
--
-- KOK MESELE: olcum `plans` satirinin ICINDE duruyordu (`climb_min` vb.).
-- Plan listeden dustugunde (soft delete) profil sorgusu onu artik saymiyor,
-- yani ucus gercekten olculmus olsa bile veri kayboluyordu.
--
-- AYRIM: `plans` bir BELGE kaydidir — silinebilir, iptal edilebilir, yeniden
-- yuklenebilir. Buradaki satir ise bir OLCUMDUR. Olcum yapildiktan sonra
-- kaynagindan bagimsiz durur; denetim izi mantiginin aynisi (Ilke 3).
-- Bu yuzden `plan_id` bir REFERANSTIR, FOREIGN KEY DEGILDIR: plan gitse de
-- ornek yerinde kalir, yalnizca "hangi plandan geldi" izi yetim kalir.
--
-- Cok kiracili sinir korunur: her ornek `customer_id`'ye baglidir ve her
-- sirket YALNIZ kendi tescillerinin verisinden kendi profilini cikarir
-- (Serkan: "her tescil kendi icinde degerlensin, o baska sirketin ucagi").
-- ════════════════════════════════════════════════════════════════════════

create table if not exists aircraft_perf_samples (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null,
  reg           text not null,
  -- Kaynak plan — SILINSE BILE bu satir kalir (FK YOK, bilerek).
  plan_id       uuid,
  dep           text,
  dest          text,
  flight_date   text,
  -- Olcumun kendisi
  ete_min       integer not null,          -- OFP trip suresi (dk)
  trip_fuel_lb  integer not null,          -- OFP trip yakiti (lb)
  cruise_fl     integer,                   -- seyir seviyesi (FL, sayi)
  climb_min     integer,                   -- tirmanmanin bittigi an (dk)
  desc_min      integer,                   -- alcalma suresi (dk)
  zfw_lb        integer,
  measured_at   timestamptz not null default now()
);

-- Ayni plan yeniden yuklenince olcum GUNCELLENIR, ikinci satir acilmaz.
-- (Plan silinip bastan yuklenirse yeni plan_id olusur; o zaman yeni bir
--  olcumdur ve ayri satir olmasi dogrudur.)
create unique index if not exists aircraft_perf_samples_plan_uidx
  on aircraft_perf_samples (plan_id) where plan_id is not null;

create index if not exists aircraft_perf_samples_reg_idx
  on aircraft_perf_samples (customer_id, reg);

alter table aircraft_perf_samples enable row level security;

-- Okuma/yazma yalniz kendi sirketi.
create policy aps_select on aircraft_perf_samples
  for select using (customer_id = my_customer_id() or is_super_admin());
create policy aps_insert on aircraft_perf_samples
  for insert with check (customer_id = my_customer_id());
create policy aps_update on aircraft_perf_samples
  for update using (customer_id = my_customer_id());

-- 🔑 DELETE POLICY YOK (Ilke 3). Olcum silinmez: profilin hangi veriden
-- ciktigi her zaman geriye dogru gosterilebilmelidir. Plan silinebilir,
-- olcum silinemez — zaten bu tablonun VAROLUS SEBEBI budur.
