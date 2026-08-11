// GO2 eFB — manage-user Edge Function
// Kullanici olusturma/silme islemlerini SUNUCU tarafinda, yetki kontrolu ile yapar.
// Service key SADECE burada (sunucuda) kullanilir; tarayiciya asla gitmez.
//
// Yetki kurali:
//   - super_admin  -> her sirkete kullanici ekleyebilir/silebilir (target_customer_id serbest)
//   - company_admin-> YALNIZCA kendi customer_id'sine (target_customer_id kendi sirketi olmali)
//   - digerleri    -> 403 reddedilir
//
// Girdi (POST JSON):
//   { action:"create", email, password, full_name, code, role, target_customer_id }
//   { action:"delete", target_user_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // 1) Cagiranin JWT'sini al
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) return json({ error: "Missing Authorization token" }, 401);

    // 2) JWT'den cagiranin kimligini dogrula (anon client + kullanici jwt'si)
    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await asCaller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);
    const callerId = userData.user.id;

    // 3) Admin client (service key) — cagiranin profilini RLS'siz oku
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: callerProfile, error: profErr } = await admin
      .from("profiles")
      .select("id, role, customer_id, is_super_admin")
      .eq("id", callerId)
      .single();
    if (profErr || !callerProfile) return json({ error: "Caller profile not found" }, 403);

    const isSuper = callerProfile.is_super_admin === true;
    const isCompanyAdmin =
      ["admin", "admin_pilot"].includes(callerProfile.role) && !!callerProfile.customer_id;

    if (!isSuper && !isCompanyAdmin) {
      return json({ error: "Not authorized to manage users" }, 403);
    }

    const body = await req.json();
    const action = body.action;

    // ───────── CREATE ─────────
    if (action === "create") {
      const { email, password, full_name, code, role } = body;
      let target_customer_id = body.target_customer_id ?? null;

      if (!email || !password || !full_name || !code) {
        return json({ error: "email, password, full_name, code required" }, 400);
      }

      // Yetki: company_admin yalnizca KENDI sirketine
      if (isSuper) {
        if (!target_customer_id) {
          return json({ error: "Super-admin must specify target_customer_id" }, 400);
        }
      } else {
        // company_admin -> hedef otomatik kendi sirketi; farkli sirket denerse reddet
        if (target_customer_id && target_customer_id !== callerProfile.customer_id) {
          return json({ error: "Company admin cannot add users to another company" }, 403);
        }
        target_customer_id = callerProfile.customer_id;
      }

      // 1) Auth kullanicisi olustur
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, code },
      });
      if (createErr || !created?.user) {
        return json({ error: createErr?.message ?? "Auth user creation failed" }, 400);
      }

      // 2) profiles kaydi (DOGRU customer_id ile)
      const { error: upErr } = await admin.from("profiles").upsert(
        {
          id: created.user.id,
          full_name,
          code: String(code).toUpperCase(),
          email,
          role: role ?? "pilot",
          customer_id: target_customer_id,
          is_super_admin: false,
        },
        { onConflict: "id" },
      );
      if (upErr) {
        // profil yazilamadiysa auth kullanicisini geri al (temizlik)
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: `Profile error: ${upErr.message}` }, 400);
      }

      return json({ ok: true, user_id: created.user.id, customer_id: target_customer_id });
    }

    // ───────── DELETE ─────────
    if (action === "delete") {
      const target_user_id = body.target_user_id;
      if (!target_user_id) return json({ error: "target_user_id required" }, 400);

      // Hedef kullanicinin profilini oku (hangi sirkette?)
      const { data: targetProfile } = await admin
        .from("profiles")
        .select("id, customer_id, is_super_admin")
        .eq("id", target_user_id)
        .single();

      if (targetProfile) {
        // super-admin silinemez (koruma)
        if (targetProfile.is_super_admin) {
          return json({ error: "Cannot delete a super-admin" }, 403);
        }
        // company_admin yalnizca kendi sirketinden silebilir
        if (!isSuper && targetProfile.customer_id !== callerProfile.customer_id) {
          return json({ error: "Company admin cannot delete users from another company" }, 403);
        }
      }

      // 1) crew_qualifications temizle
      await admin.from("crew_qualifications").delete().eq("pilot_id", target_user_id);
      // 2) profiles sil
      await admin.from("profiles").delete().eq("id", target_user_id);
      // 3) auth kullanicisini sil
      const { error: delErr } = await admin.auth.admin.deleteUser(target_user_id);
      if (delErr) return json({ error: delErr.message }, 400);

      return json({ ok: true, deleted: target_user_id });
    }

    // ───────── SET PASSWORD ─────────
    // 10 Agu 2026 (saha): eskiden panel "RESET PWD" ile Supabase'in SIFIRLAMA
    // MAILI yolunu kullaniyordu. Teslim edilemeyen adresi olan hesaplarda
    // ("email address invalid") calismiyordu — demo pilotlarda oldugu gibi.
    // Bu yalniz demoya ozgu degil: adresi olmayan/yanlis olan her musteride
    // ayni duvara carpilir. Sifre artik DOGRUDAN atanir, mail devrede degil.
    //
    // YETKI: create/delete ile AYNI kurallar — company_admin yalnizca kendi
    // sirketinden, super-admin her sirketten. Super-admin'in sifresi ise
    // hicbir sekilde buradan degistirilemez (kendi hesabi dahil).
    if (action === "set_password") {
      const target_user_id = body.target_user_id;
      const password = body.password;
      const reason = String(body.reason ?? "").trim();
      if (!target_user_id || !password) {
        return json({ error: "target_user_id and password required" }, 400);
      }
      if (String(password).length < 8) {
        return json({ error: "Password must be at least 8 characters" }, 400);
      }
      // GEREKCE ZORUNLU (Serkan kurali): "bir degisiklik yapacaksa rapor
      // yazmadan kapatamaz." Kapi FONKSIYONDA, arayuzde degil — baska bir
      // istemci gerekcesiz cagirirsa da reddedilir.
      if (reason.length < 3) {
        return json({ error: "A reason is required for setting a password" }, 400);
      }

      const { data: targetProfile } = await admin
        .from("profiles")
        .select("id, customer_id, is_super_admin")
        .eq("id", target_user_id)
        .single();
      if (!targetProfile) return json({ error: "Target user not found" }, 404);

      // Super-admin hesabinin sifresi bu yoldan degistirilemez.
      if (targetProfile.is_super_admin) {
        return json({ error: "Cannot set the password of a super-admin" }, 403);
      }
      if (!isSuper && targetProfile.customer_id !== callerProfile.customer_id) {
        return json({ error: "Company admin cannot change users of another company" }, 403);
      }

      const { error: pwErr } = await admin.auth.admin.updateUserById(target_user_id, { password });
      if (pwErr) return json({ error: pwErr.message }, 400);

      // IZ: sifrenin KENDISI hicbir yere yazilmaz, yalnizca olayin oldugu.
      // Super-admin yaptiysa superadmin_log'a duser (Ilke 3: iz silinemez).
      if (isSuper) {
        await admin.from("superadmin_log").insert({
          actor_id: callerId,
          customer_id: targetProfile.customer_id,
          type: "password_reset",
          field: target_user_id,
          reason,
        });
      }

      return json({ ok: true, updated: target_user_id });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});