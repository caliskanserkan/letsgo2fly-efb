#!/bin/bash
# GO2EFB günlük yedek: Supabase DB + Storage + GitHub repoları -> S3
# Elle çalıştırma: ~/go2efb-backup/backup.sh
# Günlük otomatik: launchd (com.go2efb.backup) 04:00 + 12:00 (telafi) çağırır;
# aynı gün ikinci koşu .last_success işaretçisi sayesinde no-op olur.
# 29 Tem bulgusu: 04:00 koşusu Mac yarı-uyanıkken (DarkWake) başlayıp ağ gidince
# pg_dump'ta sonsuz asılı kaldı -> run_timeout bekçisi + caffeinate (plist'te).
set -euo pipefail
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/bin:/bin:$PATH"

# 10 Agu 2026 (ilk GitHub Actions kosusu): Debian'da /usr/bin/pg_dump bir
# SARMALAYICI ve surumu kendi seciyor -> 17 istemcisi kurulu olsa bile 16'ya
# cozup "server version mismatch" verdi (sunucu 17.6). Surumlu bin klasorleri
# PATH'in ONUNE alinir; glob artan sirali oldugu icin en yuksek surum en one
# gecer. macOS'ta bu klasorler yok, dongu bos gecer.
for _pgbin in /usr/lib/postgresql/*/bin; do
  if [[ -d "$_pgbin" ]]; then PATH="$_pgbin:$PATH"; fi
done
unset _pgbin

DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DIR/backup.env"

STAMP=$(date +%Y-%m-%d)
WORK=$(mktemp -d /tmp/go2efb-backup.XXXXXX)
LOG="$DIR/backup.log"
MARKER="$DIR/.last_success"
RUNMARK="$DIR/.last_run"      # "bugun KOSULDU" (basarili olsun olmasin)
trap 'rm -rf "$WORK"' EXIT

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

# IKI AYRI ISARET (2 Agu 2026):
#   .last_success = o gun TAM yedek alindi   -> dogruluk beyani
#   .last_run     = o gun kosuldu            -> mukerrer kosu engeli
# Ayri olmalari sart: eksik kosuda .last_success YAZILMAZ (yalan olurdu) ama
# .last_run yazilir, yoksa gunun ikinci tetigi (12:00) TUM yedegi bastan
# kosardi — DB dump + 150 MB Storage + S3, her gun iki kez.
if [[ -f "$RUNMARK" && "$(cat "$RUNMARK")" == "$STAMP" ]]; then
  if [[ -f "$MARKER" && "$(cat "$MARKER")" == "$STAMP" ]]; then
    log "Bugunun yedegi zaten TAM alinmis ($STAMP) — cikiliyor."
  else
    log "Bugun kosuldu ama yedek EKSIKTI ($STAMP) — tekrar kosulmuyor, logu incele."
  fi
  exit 0
fi
echo "$STAMP" > "$RUNMARK"

log "=== YEDEK BASLADI ($STAMP) ==="

# Komutu süre sınırıyla çalıştır (macOS'ta timeout yok): run_timeout <sn> <komut...>
# Uykuda sleep sayacı da durur; uyanınca kalan süre işler ve asılı süreç öldürülür.
run_timeout() {
  local secs="$1"; shift
  "$@" & local p=$!
  ( sleep "$secs"; kill -9 "$p" 2>/dev/null ) & local w=$!
  local rc=0; wait "$p" || rc=$?
  kill "$w" 2>/dev/null; wait "$w" 2>/dev/null || true
  return $rc
}

# Env dolduruldu mu?
if [[ "$SUPABASE_DB_URL" == *"BURAYA"* || "$SUPABASE_SERVICE_KEY" == *"BURAYA"* ]]; then
  log "HATA: backup.env doldurulmamis (SUPABASE_DB_URL / SUPABASE_SERVICE_KEY)."
  exit 1
fi

# AG BEKLEME (30 Tem bulgusu): Mac acilir acilmaz tetiklenince Wi-Fi henuz
# baglanmamis oluyor ve pg_dump ANINDA dusuyordu. 5 dk'ya kadar agi bekle.
NET_OK=0
for i in $(seq 1 30); do
  if curl -s --max-time 8 -o /dev/null "https://ojvqdsqodpxkvpxvwgrm.supabase.co/rest/v1/"; then
    NET_OK=1; break
  fi
  sleep 10
done
if [[ "$NET_OK" != "1" ]]; then
  log "HATA: 5 dk icinde ag gelmedi — koşu iptal, sonraki tetikte tekrar denenecek."
  exit 1
fi

# 1) Veritabanı dump (şema + veri, sıkıştırılmış) — 15 dk bekçili (asılı kalma fixi)
log "[1/3] DB dump..."
if ! run_timeout 900 pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges -Fc -f "$WORK/db.dump"; then
  log "HATA: pg_dump basarisiz (baglanti hatasi veya 900 sn asimi) — koşu iptal, sonraki tetikte tekrar denenecek."
  exit 1
fi
log "  db.dump: $(du -h "$WORK/db.dump" | cut -f1)"

# EKSIK YEDEK BASARILI SAYILMAZ (2 Agu 2026, Serkan).
# Eskiden storage_download.py atlanan dosyayi yalniz ekrana yaziyor, cikis kodu
# hep 0 oluyordu; betik bunu goremedigi icin eksik yedege "YEDEK TAMAM" deyip
# .last_success yaziyordu. Logda aylara yayilmis 47 atlama kaydi vardi, hicbiri
# fark edilmemisti. Yeni kural: eksikse yedek yine de S3'e YUKLENIR (yarim yedek
# yedeksizlikten iyidir) ama BASARI ISARETI YAZILMAZ, mail gider (SNS_TOPIC_ARN
# tanimliysa) ve betik hata koduyla biter.
INCOMPLETE=0
notify() {                      # SNS_TOPIC_ARN backup.env'de tanimliysa mail atar
  local subject="$1" body="$2"
  if [[ -n "${SNS_TOPIC_ARN:-}" ]]; then
    if aws sns publish --topic-arn "$SNS_TOPIC_ARN" --subject "$subject" \
         --message "$body" >/dev/null 2>&1; then
      log "  bildirim gonderildi (SNS)"
    else
      log "  UYARI: SNS bildirimi GONDERILEMEDI"
    fi
  else
    log "  (SNS_TOPIC_ARN tanimsiz — mail gonderilmedi)"
  fi
}

# 2) Storage bucket'ları
log "[2/3] Storage indiriliyor..."
for b in $STORAGE_BUCKETS; do
  if ! SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_KEY" \
       python3 "$DIR/storage_download.py" "$b" "$WORK/storage/$b" | tee -a "$LOG"; then
    INCOMPLETE=1
    log "  UYARI: '$b' kovasinda indirilemeyen dosya var (yukarida listelendi)."
  fi
done
tar -czf "$WORK/storage.tar.gz" -C "$WORK" storage
rm -rf "$WORK/storage"

# 3) GitHub repoları (tam geçmiş, tüm dallar)
log "[3/3] Git mirror..."
for url in $GIT_REPOS; do
  name=$(basename "$url" .git)
  git clone --quiet --mirror "$url" "$WORK/$name.git"
  tar -czf "$WORK/$name.tar.gz" -C "$WORK" "$name.git"
  rm -rf "$WORK/$name.git"
  log "  $name.tar.gz: $(du -h "$WORK/$name.tar.gz" | cut -f1)"
done

# S3'e yükle (tarih damgalı klasör)
log "S3'e yukleniyor: s3://$S3_BUCKET/daily/$STAMP/"
aws s3 cp "$WORK/" "s3://$S3_BUCKET/daily/$STAMP/" --recursive --only-show-errors
aws s3 ls "s3://$S3_BUCKET/daily/$STAMP/" | tee -a "$LOG"

if [[ "$INCOMPLETE" == "1" ]]; then
  # DIKKAT: .last_success YAZILMAZ. Isaret "o gun TAM yedek alindi" demektir;
  # eksik kosu icin yazilirsa bir daha denenmez ve eksiklik kalicilasir.
  log "=== YEDEK EKSIK — dosyalar S3'e yuklendi ama BASARILI SAYILMADI ==="
  log "    Ayrinti: $LOG (ATLANDI satirlari)"
  notify "GO2eFB YEDEK EKSIK — $STAMP" \
"GO2eFB gunluk yedegi EKSIK tamamlandi.

Tarih   : $STAMP
Konum   : s3://$S3_BUCKET/daily/$STAMP/
Durum   : Storage'dan indirilemeyen dosya(lar) var — yedek EKSIK.
Log     : $LOG  (ATLANDI satirlarina bak)

DB dump, git mirror'lari ve indirilebilen Storage dosyalari yuklendi.
Basari isareti (.last_success) YAZILMADI; sonraki tetikte tekrar denenecek."
  exit 1
fi

echo "$STAMP" > "$MARKER"
log "=== YEDEK TAMAM ==="
