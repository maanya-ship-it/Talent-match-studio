// Cloudflare Pages Function — production-grade candidate positioning endpoint.
// The model is only allowed to write from sanitized candidate evidence.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

export function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

const clean = (v) => String(v ?? "").replace(/\r/g, "").trim();
const asList = (v) => clean(v).split(/\n|\||;/).map(x => x.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
const unique = (xs) => [...new Set((xs || []).map(clean).filter(Boolean))];

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function parseCandidateData(prompt) {
  const marker = "CANDIDATE DATA:";
  const start = String(prompt).indexOf(marker);
  if (start < 0) return null;
  const raw = String(prompt).slice(start + marker.length).trim();
  try { return JSON.parse(raw); } catch { return null; }
}

function sentences(text) {
  return clean(text).split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(Boolean);
}

// This is deliberately conservative. Raw Sheet/recruiter fields are not allowed
// into the evidence payload even when the client sends them.
function sanitizeEvidence(raw) {
  const r = raw || {};
  const resume = sentences(r.resumeText || r.resumeEvidence || "");
  const profile = sentences(r.experience || "");
  const projects = asList(r.projects || r.verifiedProjects);
  const achievements = asList(r.achievements || r.verifiedAchievements);
  const responsibilities = asList(r.responsibilities || r.verifiedResponsibilities);
  const metrics = asList(r.metrics || r.verifiedMetrics);

  return {
    name: clean(r.name),
    professionalIdentity: unique([
      ...asList(r.professionalIdentity),
      ...asList(r.domain),
      ...asList(r.roleFamily),
      ...asList(r.functionalRTW),
      ...asList(r.sectoralRTW),
    ]),
    roles: unique([...asList(r.experienceRoles), ...asList(r.rolesHeld), ...profile]),
    companies: unique([...asList(r.experienceCompanies), ...asList(r.companies)]),
    projects: unique(projects),
    responsibilities: unique(responsibilities),
    achievements: unique(achievements),
    metrics: unique(metrics),
    skills: unique([...asList(r.skills), ...asList(r.verifiedSkills)]),
    resumeEvidence: resume,
  };
}

function metricTokens(text) {
  return clean(text).match(/(?:₹|rs\.?|\$|€|£)?\s*\d+(?:\.\d+)?\s*(?:lakh|lakhs|lac|l|cr|crore|crores|k|m|mn|million|b|bn|%|x|rooms?|deals?|months?|years?)?/gi) || [];
}

function normalizeMetric(x) {
  return clean(x).toLowerCase().replace(/\s+/g, "").replace(/rs\.?/g, "₹");
}

function qualityGate(text, evidence) {
  const output = clean(text);
  const source = JSON.stringify(evidence);
  const sourceMetrics = new Set(metricTokens(source).map(normalizeMetric));
  const outputMetrics = metricTokens(output).map(normalizeMetric);
  const unsupportedMetrics = outputMetrics.filter(x => !sourceMetrics.has(x));

  const lower = output.toLowerCase();
  const forbidden = [
    "needs money", "need money", "yet to land", "success track", "profiles shared",
    "sourcing", "recruiter note", "recruiter context", "collateral", "hard constraint",
    "compensation", "target ctc", "location preference", "rejection feedback"
  ].filter(x => lower.includes(x));

  const oneMatch = output.match(/ONE-LINER:\s*([\s\S]*?)(?:\nBLURB:|$)/i);
  const blurbMatch = output.match(/BLURB:\s*([\s\S]*)/i);
  const one = clean(oneMatch?.[1]);
  const blurb = clean(blurbMatch?.[1]);
  const oneSentenceCount = one ? (one.match(/[.!?](?:\s|$)/g) || []).length : 0;

  const warnings = [];
  if (!one || !blurb) warnings.push("Missing required ONE-LINER or BLURB section.");
  if (oneSentenceCount > 1) warnings.push("One-liner contains multiple sentences.");
  if (unsupportedMetrics.length) warnings.push(`Unsupported metric(s): ${unsupportedMetrics.join(", ")}`);
  if (forbidden.length) warnings.push(`Forbidden recruiter/process language: ${forbidden.join(", ")}`);

  return { ok: warnings.length === 0, warnings };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.AI) return response({ error: { message: "AI binding is not configured." } }, 500);

  let body;
  try { body = await request.json(); }
  catch { return response({ error: { message: "Invalid request body." } }, 400); }

  const prompt = body?.prompt;
  if (!prompt || typeof prompt !== "string") return response({ error: { message: "Missing 'prompt' in request body." } }, 400);

  const rawCandidate = parseCandidateData(prompt);
  if (!rawCandidate) return response({ error: { message: "Candidate evidence payload is missing or invalid." } }, 400);

  const evidence = sanitizeEvidence(rawCandidate);
  if (!evidence.name) return response({ error: { message: "Candidate name is missing." } }, 400);

  const roleSection = clean(prompt.match(/TARGET ROLE\(S\):\s*([^\n]+)/i)?.[1]);
  const highlightSection = clean(prompt.match(/EXPERIENCE\s*\/\s*CONTEXT TO HIGHLIGHT:\s*([^\n]+)/i)?.[1]);
  const jdMatch = prompt.match(/JOB DESCRIPTION:\s*([\s\S]*?)(?:\n\s*CANDIDATE DATA:|$)/i);
  const jd = clean(jdMatch?.[1]);

  const system = `You are a senior executive recruiter writing candidate positioning for a hiring manager.

You are an evidence-grounded rewriting engine, NOT a fact generator.

SOURCE OF TRUTH:
- Use ONLY the VERIFIED CANDIDATE EVIDENCE JSON supplied below.
- Every company, role, project, responsibility, skill and metric must be traceable to that evidence.
- Never infer a metric, company, title, skill or achievement.
- Never round, shorten, merge or reinterpret numbers.
- A metric must retain its complete meaning: metric + what it measures + relevant outcome/context.
- Never use compensation, location preference, recruiter notes, sourcing history, application/interview status, rejection feedback, success-track labels or operational process information as candidate achievements.
- Never convert recruiter work (sourcing, making collateral, coordinating, sharing profiles) into candidate experience.

WRITING STANDARD:
- Sound like an excellent human recruiter, not an AI or resume parser.
- Lead with a clear professional identity and the candidate's strongest relevance to the target role.
- Select the 2–4 strongest proof points; do not dump the resume.
- Prefer concrete outcomes and metrics over generic skill lists.
- Use company/project names when they establish credibility.
- Avoid chronology unless it adds meaningful context.
- Never use filler such as "results-driven", "dynamic professional", "proven track record", "passionate", "leveraging expertise", "well-suited", "strong background", or "multifaceted professional".

ONE-LINER:
- Exactly one sentence.
- Aim for 20–30 words.
- Professional identity + 2–4 relevant areas + 1–2 strongest quantified outcomes when available.
- If there is no reliable metric, use the strongest concrete qualitative evidence.

BLURB:
- 3–5 sentences, approximately 80–130 words.
- Sentence 1: who the candidate is and why their profile is relevant.
- Sentences 2–4: strongest role-relevant projects/responsibilities and complete quantified outcomes.
- Final sentence: relevant tools/skills only when evidenced.
- Do not repeat the same metric unnecessarily.

Return ONLY:
ONE-LINER:
<one sentence>
BLURB:
<3–5 sentences>`;

  const user = `TARGET ROLE(S): ${roleSection || "Not specified"}
EXPERIENCE / CONTEXT TO HIGHLIGHT: ${highlightSection || "Choose the strongest role-relevant evidence"}
JOB DESCRIPTION:
${jd || "Not provided"}

VERIFIED CANDIDATE EVIDENCE:
${JSON.stringify(evidence, null, 2)}`;

  const run = async (temperature, extra = "") => {
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user + extra },
      ],
      max_tokens: 650,
      temperature,
    });
    return (result && (result.response ?? result.text ?? "")) || "";
  };

  try {
    let text = await run(0.08);
    let gate = qualityGate(text, evidence);

    if (!gate.ok) {
      text = await run(0.02, `\n\nQUALITY GATE FAILED: ${gate.warnings.join(" | ")}\nRegenerate from VERIFIED CANDIDATE EVIDENCE only. Preserve every metric's complete meaning and return exactly the required sections.`);
      gate = qualityGate(text, evidence);
    }

    if (!gate.ok) {
      return response({
        error: { message: "Generated copy failed the evidence-quality check." },
        qualityWarnings: gate.warnings,
      }, 422);
    }

    return response({
      text,
      quality: { passed: true, warnings: [], evidenceSource: "sanitized candidate evidence" },
    });
  } catch (err) {
    return response({ error: { message: String(err?.message || err) } }, 500);
  }
}
