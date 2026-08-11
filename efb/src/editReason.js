// SUPER ADMIN EDIT GEREKCESI — istemci tarafi boru hatti (11 Agu 2026)
// Mimari kural: CLAUDE.md TASARIM ILKELERI md.6
//
// Serkan: "Her yerde yazabilir, ne yazarsa yazsin, ama editini RAPOR ILE
// gerceklestirebilir — aksi halde olmaz. Yaptigi edit ilgili sirketin log
// kayitlarinda tutulur."
//
// NASIL CALISIR: gerekce, yazma ISTEGININ BASLIGIYLA gider (x-edit-reason).
// Veritabanindaki tetikleyici onu okur; yoksa yazmayi REDDEDER ve iz de yazmaz.
// Yani kural ekranin iyi niyetine degil, veritabanina baglidir.
//
// NEDEN AYRI ISTEMCI: supabase-js tek tek cagrilara baslik eklemeye izin
// vermiyor; gerekceyi tasiyan kisa omurlu bir istemci uretip onunla yaziyoruz.
//
// UNUTULAN KAPI SESSIZ KALMAZ: gerekcesiz yazan bir yol kalirsa veritabani
// 42501 ile reddeder, kullanici hatayi GORUR. 10 Agu'daki yarim silmenin
// (catch {} ile yutulan hata) tam tersi.

import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

const URL = process.env.REACT_APP_SUPABASE_URL;
const ANON = process.env.REACT_APP_SUPABASE_ANON_KEY;

/**
 * Gerekceyi tasiyan gecici istemci dondurur.
 * @param {string} reason  Zorunlu. Bos/kisa ise cagri yapilmadan hata verilir.
 */
export async function withReason(reason) {
  const r = String(reason || '').trim();
  if (r.length < 3) throw new Error('A written reason is required for this change.');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expired, please log in again.');

  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'x-edit-reason': r,
      },
    },
  });
}

/**
 * Gerekceyi SORAR ve yazmaya hazir istemciyi dondurur; iptal edilirse null.
 * Cagri sekli:  const sb = await askReason(); if (!sb) return;
 * Sonra o handler icindeki YAZMA cagrilarinda `supabase` yerine `sb` kullanilir.
 * (Okumalar normal `supabase` ile kalir — kural yalnizca yazmayi ilgilendirir.)
 */
export async function askReason(what = 'this change') {
  const r = window.prompt(`Reason for ${what} (required — it is stored in the customer's log):`, '');
  if (r === null) return null;
  try {
    return await withReason(r);
  } catch (e) {
    alert(e.message);
    return null;
  }
}

/** Veritabanindan gelen gerekce hatasini insan diline cevirir. */
export function isReasonError(error) {
  const m = String(error?.message || '');
  return m.includes('written reason is required') || error?.code === '42501';
}
