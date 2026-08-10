#!/usr/bin/env python3
# Supabase Storage bucket'ını yerel klasöre indirir (service_role key ile).
# Kullanım: storage_download.py <bucket> <hedef_klasör>
# Ortam: SUPABASE_URL, SUPABASE_SERVICE_KEY
import json, os, sys, urllib.request, pathlib
from urllib.parse import quote

BASE = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_KEY"]
HDRS = {"Authorization": f"Bearer {KEY}", "apikey": KEY}

def api(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers={**HDRS, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

def list_all(bucket, prefix=""):
    # Klasörleri özyinelemeli gez; dosyaların tam yolunu döndür.
    files = []
    offset = 0
    while True:
        rows = api(f"/storage/v1/object/list/{bucket}",
                   {"prefix": prefix, "limit": 100, "offset": offset,
                    "sortBy": {"column": "name", "order": "asc"}})
        if not rows:
            break
        for row in rows:
            name = (prefix + "/" if prefix else "") + row["name"]
            if row.get("id") is None:   # klasör
                files += list_all(bucket, name)
            else:
                files.append(name)
        if len(rows) < 100:
            break
        offset += 100
    return files

def download(bucket, path, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(f"{BASE}/storage/v1/object/{bucket}/{quote(path)}", headers=HDRS)
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)

if __name__ == "__main__":
    import time
    bucket, target = sys.argv[1], pathlib.Path(sys.argv[2])
    files = list_all(bucket)
    print(f"[storage] {bucket}: {len(files)} dosya")
    # HARF BIRLESMESI (4 Agu 2026, kok KESIN bulundu): Storage list API'si
    # harf-DUYARSIZ — ayni plan-id'nin buyuk ve kucuk harfli iki klasoru kok
    # listede TEK girdiye iner (test edildi: 33823cfd tek gorunuyor, iki prefix
    # de AYNI birlesik icerigi donduruyor). Obje GET ise harf-DUYARLI. Sonuc:
    # gezici hangi harfle indiyse o yolu kurar; dosya fiziken OBUR harfli
    # klasordeyse 400/404 alir ve o dosya yedege HIC girmezdi (eski 'hayalet'
    # teshisi de biz de yanilmisiz — kayit degil, listeleme birlesmesi).
    # COZUM: 400/404'te ilk dizinin harf-varyantiyla indirmeyi DENE; olursa
    # GERCEK yolun altina kaydet ve basarili say (loglanir). O da olmazsa
    # gercek EKSIK'tir, yedek basarisiz cikar.
    def _case_variants(path):
        seg = path.split("/", 1)
        if len(seg) != 2:
            return []
        head, rest = seg
        outs = []
        for h in (head.upper(), head.lower()):
            alt = h + "/" + rest
            if alt != path:
                outs.append(alt)
        return outs
    skipped = []
    case_fixed = []
    for p in files:
        # 3 deneme: gecici ag hatasi (timeout vb.) tum yedegi COLDURMESIN.
        # (28 Tem 21:00 kosusu tek TimeoutError ile dusmustu — HTTPError disi
        # hatalar yakalanmiyordu.) Kalici hata -> atla, sonda raporla.
        for attempt in range(3):
            try:
                download(bucket, p, target / p)
                break
            except Exception as e:
                if attempt < 2:
                    print(f"[storage] {bucket}: deneme {attempt+1} basarisiz ({type(e).__name__}) {p} — tekrar...")
                    time.sleep(3 * (attempt + 1))
                else:
                    fixed = False
                    if isinstance(e, urllib.error.HTTPError) and e.code in (400, 404):
                        for alt in _case_variants(p):
                            try:
                                download(bucket, alt, target / alt)
                                case_fixed.append((p, alt))
                                print(f"[storage] {bucket}: HARF-DUZELTME — listede '{p}' gorundu, gercek '{alt}' yolundan indirildi")
                                fixed = True
                                break
                            except Exception:
                                continue
                    if not fixed:
                        skipped.append(p)
                        print(f"[storage] {bucket}: ATLANDI ({type(e).__name__}: {e}) {p}")
    if case_fixed:
        print(f"[storage] {bucket}: {len(case_fixed)} dosya harf-duzeltmeyle gercek yolundan indirildi")
    print(f"[storage] {bucket}: tamam ({len(files)-len(skipped)}/{len(files)})")
    # ATLANAN VARSA BASARISIZ CIK (2 Agu 2026).
    # Onceden yalniz ekrana yaziyordu ve cikis kodu HER ZAMAN 0'di; backup.sh
    # bunu goremiyor, eksik yedege "YEDEK TAMAM" deyip .last_success yaziyordu.
    # Kural: eksik yedek BASARILI SAYILMAZ.
    if skipped:
        print(f"[storage] {bucket}: UYARI — {len(skipped)} kayit indirilemedi:")
        for p in skipped:
            print(f"[storage] {bucket}:   - {p}")
        sys.exit(2)
