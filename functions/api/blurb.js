// Cloudflare Pages Function — evidence-first candidate blurb generation.
// AI writes prose; this endpoint also performs a lightweight factual gate before
// returning recruiter-facing copy. The client must provide VERIFIED CANDIDATE EVIDENCE.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

function numbers(text) {
  return String(text || "").match(/(?:₹|rs\.?|\$|€|£)?\s*\d+(?:\.\d+)?\s*(?:lakh|lakhs|lac|l|cr|crore|crores|k|m|mn|million|b|bn|%|x|rooms?|deals?|months?|years?)?/gi) || [];
}

function normalizeNumberToken(x) {
  return String(x).toLowerCase().replace(/\s+/g, "").replace(/rs\.?/g, "₹");
}

function extractCandidateData(prompt) {
  const marker = "CANDIDATE DATA:";
  const start = String(prompt).indexOf(marker);
  if (start < 0) return null;
  const raw = String(prompt).slice(start + marker.length).trim();
  try { return JSON.parse(raw); } catch { return null; }
}

function qualityGate(text, prompt) {
  const candidate = extractCandidateData(prompt);
  if (!candidate) return { ok: true, warnings: ["Candidate data could not be parsed by the gate; system evidence rules still apply."] };

  const sourceNums = new Set(numbers(JSON.stringify(candidate)).map(normalizeNumberToken));
  const unsupportedNumbers = numbers(text).map(normalizeNumberToken).filter(n => !sourceNums.has(n));
  const lower = String(text).toLowerCase();
  const leakedProcessPhrases = [
    "needs money", "need money", "yet to land", "success track", "sourcing",
    "recruiter note", "recruiter context", "collateral", "hard constraint",
  ].filter(p => lower.includes(p));

  const warnings = [];
  if (unsupportedNumbers.length) warnings.push(`Unsupported metric(s): ${unsupportedNumbers.join(", ")}`);
  if (leakedProcessPhrases.length) warnings.push(`Process/context language leaked: ${leakedProcessPhrases.join(", ")}`);
  return { ok: unsupportedNumbers.length === 0 && leakedProcessPhrases.length === 0, warnings };
}

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.AI) return response({ error: { message: "AI binding is not configured." } }, 500);

  let body;
  try { body = await request.json(); }
  catch { return response({ error: { message: "Invalid request body." } }, 400); }

  const prompt = body?.prompt;
  if (!prompt || typeof prompt !== "string") return response({ error: { message: "Missing 'prompt' in request body." } }, 400);

  const system = `You are an exceptionally careful executive recruiter and candidate-positioning writer. You are a rewriting engine, not a fact generator.

SOURCE-OF-TRUTH RULES:
1. Every company, title, skill, sector, project, responsibility and metric must be explicitly present in VERIFIED CANDIDATE EVIDENCE in the user prompt.
2. Never invent, infer, round, shorten, combine or reinterpret numbers. Preserve the complete metric and its outcome/context. If the evidence says "₹32L revenue", never write "₹32L" without what it measures.
3. Recruiter notes, sourcing history, process status, compensation, location preferences, rejection feedback, success-track labels and next steps are not candidate achievements.
4. Never turn a recruiter/process action such as making collateral, sourcing or coordinating into candidate experience.
5. Do not mention compensation, location or internal recruiter context unless the requested format explicitly asks for matching context.
6. Prefer 2–4 highly relevant, concrete evidence points over generic skill lists.
7. A metric is useful only when the noun/outcome it measures is clear.
8. Do not use generic filler such as "results-driven", "dynamic professional", "proven track record", "passionate", "leveraging expertise", or "well-suited".
9. One-liner: approximately 20–30 words; identify the professional identity, 2–4 genuine areas, and 1–2 strongest quantified outcomes when available.
10. Blurb: 3–5 crisp sentences. Start with the candidate's professional identity and role relevance. Use specific responsibilities/projects and 2–4 complete metrics when available. End with relevant tools/skills only when evidenced.
11. If evidence is insufficient, say only what is supported. Never fill gaps.
12. Return exactly ONE-LINER: and BLURB: sections and no commentary.`;

  const run = async (userPrompt, temperature) => {
    const result = await env.AI.run(MODEL, {
      messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }],
      max_tokens: 550,
      temperature,
    });
    return (result && (result.response ?? result.text ?? "")) || "";
  };

  try {
    let text = await run(prompt, 0.12);
    let gate = qualityGate(text, prompt);

    if (!gate.ok) {
      text = await run(`${prompt}\n\nQUALITY GATE FAILURE: ${gate.warnings.join(" | ")}\nRegenerate from VERIFIED CANDIDATE EVIDENCE only. Remove every unsupported number and every recruiter/process phrase. Keep every metric together with its outcome/context.`, 0.05);
      gate = qualityGate(text, prompt);
    }

    if (!gate.ok) {
      return response({ error: { message: "Generated copy failed the evidence-quality check. Please regenerate or review the candidate evidence." }, qualityWarnings: gate.warnings }, 422);
    }

    return response({ text, quality: { passed: true, warnings: gate.warnings } });
  } catch (err) {
    return response({ error: { message: String(err?.message || err) } }, 500);
  }
}
