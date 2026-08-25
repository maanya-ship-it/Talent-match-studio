// Cloudflare Pages Function — evidence-first candidate blurb generation.
// The browser sends the candidate evidence and role context; this endpoint
// only generates prose and never has access to recruiter credentials or sheets.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Higher-quality model for recruiter-facing copy. The frontend also has a
// deterministic fallback, so generation remains usable if AI is unavailable.
const MODEL = "@cf/meta/llama-3.1-8b-instruct";

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.AI) {
    return new Response(
      JSON.stringify({ error: { message: "AI binding is not configured." } }),
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

  const system = `You are an exceptionally careful executive recruiter. You are a rewriting engine, not a fact generator.

SOURCE-OF-TRUTH RULES:
1. Every company, title, skill, sector, project, responsibility and metric must be explicitly present in VERIFIED CANDIDATE EVIDENCE in the user prompt.
2. Never invent, infer, round, shorten, combine or reinterpret numbers. Preserve complete metric + outcome phrases. For example, never output "₹6" when the evidence says "₹6L revenue".
3. Recruiter notes, sourcing history, process status, compensation, location, rejection feedback and next steps are not achievement evidence.
4. Do not use a metric unless its outcome/context is also stated.
5. Do not turn a recruiter/process action such as making collateral into a candidate achievement.
6. If evidence is insufficient, be conservative rather than filling gaps.
7. Return exactly the requested format and no commentary.`;

  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: 550,
      temperature: 0.15,
    });

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
