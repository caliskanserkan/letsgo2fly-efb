import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAIP_KEY = "66ac62cad2142cb2ace71952b74e7722";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  
  const url = new URL(req.url);
  const z = url.searchParams.get("z");
  const x = url.searchParams.get("x");
  const y = url.searchParams.get("y");
  
  if (!z || !x || !y) return new Response("Missing z/x/y", { status: 400, headers: CORS });

  const tileUrl = `https://api.tiles.openaip.net/api/data/openaip/${z}/${x}/${y}.png?apiKey=${OPENAIP_KEY}`;
  
  const resp = await fetch(tileUrl, {
    headers: { "x-openaip-api-key": OPENAIP_KEY }
  });
  
  if (!resp.ok) return new Response("Tile not found", { status: resp.status, headers: CORS });
  
  const blob = await resp.arrayBuffer();
  return new Response(blob, {
    headers: {
      ...CORS,
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    }
  });
});
