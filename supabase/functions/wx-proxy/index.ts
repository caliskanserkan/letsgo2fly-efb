import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const { searchParams } = new URL(req.url);
  const ids  = searchParams.get("ids")  || "";
  const type = searchParams.get("type") || "metar"; // metar | taf

  const url = type === "taf"
    ? `https://aviationweather.gov/api/data/taf?ids=${ids}&format=raw`
    : `https://aviationweather.gov/api/data/metar?ids=${ids}&format=raw&hours=3&taf=false`;

  try {
    const resp = await fetch(url);
    const text = await resp.text();
    return new Response(text, {
      headers: { ...CORS, "Content-Type": "text/plain" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
