import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const planId = url.searchParams.get("plan_id");
  if (!planId) return new Response("Missing plan_id", { status: 400, headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ÇOK KİRACILI SINIR (1 Agu 2026 uyum denetimi — KRITIK BULGU):
  // Bu fonksiyon service_role ile calisir (RLS bypass) ve eskiden HICBIR kimlik
  // dogrulamasi yoktu: plan UUID'sini bilen herkes BASKA SIRKETIN OFP'sini
  // indirebiliyordu (Ilke 5 ihlali). Artik czib-check/archive-flight ile AYNI
  // desen: kullanici JWT'si dogrulanir + planin kullanicinin sirketine ait
  // oldugu kontrol edilir. Eslesmezse 403 — dosya yolu bile uretilmez.
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!jwt) return new Response("Missing Authorization token", { status: 401, headers: CORS });

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return new Response("Invalid token", { status: 401, headers: CORS });
  }
  const { data: prof } = await supabase.from("profiles")
    .select("customer_id").eq("id", userData.user.id).single();
  const { data: plan } = await supabase.from("plans")
    .select("customer_id").eq("id", planId).single();
  if (!prof?.customer_id || !plan || plan.customer_id !== prof.customer_id) {
    return new Response("Forbidden", { status: 403, headers: CORS });
  }

  // Try active first, then archived
  for (const folder of ["active", "archived"]) {
    const path = `${folder}/${planId}.pdf`;
    const { data, error } = await supabase.storage
      .from("ofp-pdfs")
      .createSignedUrl(path, 3600);

    if (!error && data?.signedUrl) {
      return new Response(JSON.stringify({ url: data.signedUrl }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("PDF not found", { status: 404, headers: CORS });
});
