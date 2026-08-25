# Talent Match & Blurb Studio — Production QA

Before deployment, validate these cases against the private C3 + MoF source files and real resume evidence.

## Source-of-truth rules
- Resume evidence is the primary source for achievements and metrics.
- Company Sheet fields control sourcing/matching constraints.
- MoF operational fields are never candidate achievements.
- Recruiter notes, sourcing history, status, compensation and location preferences are never blurb evidence.

## Matching
- [ ] Role matching uses candidate-facing experience, not recruiter notes.
- [ ] Multiple roles are treated independently.
- [ ] Highlight/context is independent from target role.
- [ ] Strict mode excludes hard-constraint failures before ranking.
- [ ] Balanced mode can retain borderline candidates without hiding constraint failures.
- [ ] Broad mode clearly labels candidates who miss hard constraints.
- [ ] Compensation boundaries are applied consistently.
- [ ] Location aliases handle Bangalore/Bengaluru, Delhi/NCR, Mumbai, Hyderabad, Pune, Chennai, Kolkata and Remote.
- [ ] Excluded candidates show the actual failed constraint.
- [ ] Ranking is deterministic for the same inputs.

## One-liner
- [ ] Exactly one sentence.
- [ ] Approximately 20–30 words.
- [ ] Professional identity is clear.
- [ ] 2–4 relevant areas are genuine.
- [ ] 1–2 strongest metrics are used when available.
- [ ] Metrics retain their meaning and context.
- [ ] No recruiter/process language.
- [ ] No generic AI filler.

## Blurb
- [ ] 3–5 sentences and approximately 80–130 words.
- [ ] Opens with professional identity + role relevance.
- [ ] Uses 2–4 strongest evidence points.
- [ ] Prioritizes projects, responsibilities and outcomes.
- [ ] Metrics are exact and complete.
- [ ] Tools/skills appear only when evidenced.
- [ ] No fabricated companies, titles, skills, projects or achievements.
- [ ] No recruiter notes, sourcing history, compensation, location or interview status.

## Metric integrity
- [ ] ₹32L stays ₹32L.
- [ ] 2.8L stays 2.8L.
- [ ] 20% stays 20%.
- [ ] Metric + noun/outcome stay together.
- [ ] Unsupported metrics trigger regeneration/rejection.

## Regression examples
Use Mayank-style profiles as the benchmark. A strong output should resemble:

> Product and growth operator with experience across analytics, AI, operations and D2C, driving ₹32L revenue and 20% occupancy growth.

The exact facts must always come from the current source data; this example is a quality benchmark, not a source of truth.
