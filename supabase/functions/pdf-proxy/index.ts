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
