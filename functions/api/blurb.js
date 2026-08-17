// Cloudflare Pages Function.
// Uses Cloudflare's built-in Workers AI (an "AI" binding) to generate blurbs
// for free — 10,000 neurons/day included on every Cloudflare account, no
// credit card, no external API key, no billing setup of any kind.
//
// Setup (one time, in the Cloudflare dashboard):
//   Pages project -> Settings -> Functions -> AI bindings -> Add binding
//     Variable name: AI
//   Then redeploy. That's it — no key to paste anywhere.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Small, fast open model — keeps each blurb well within the free daily
// neuron budget. Swap for "@cf/meta/llama-3.1-8b-instruct" for higher
// quality at a higher neuron cost per call, if you have headroom.
const MODEL = "@cf/meta/llama-3.2-3b-instruct";

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.AI) {
    return new Response(
      JSON.stringify({
        error: {
          message:
            "This deployment has no AI binding. In Cloudflare dashboard: Pages project > Settings > Functions > AI bindings > Add binding (variable name 'AI'), then redeploy.",
        },
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: { message: "Invalid request body." } }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  const prompt = body?.prompt;
  if (!prompt || typeof prompt !== "string") {
    return new Response(
      JSON.stringify({ error: { message: "Missing 'prompt' in request body." } }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  try {
    const result = await env.AI.run(MODEL, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 0.35,
    });

    // Workers AI text-generation models return { response: "..." }.
    const text = (result && (result.response ?? result.text ?? "")) || "";

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { message: String(err?.message || err) } }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
}
