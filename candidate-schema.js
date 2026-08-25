/* Canonical candidate data contract.
 *
 * This file deliberately contains NO student/company data. It defines how the
 * private Sheet + resume pipeline should be normalized before matching or AI
 * generation. Recruiter/process context is kept separate from evidence.
 */
(function (root) {
  const clean = (v) => {
    if (v == null) return '';
    return String(v).replace(/\r/g, '').trim();
  };

  const list = (v) => clean(v)
    .split(/\n|\||;/)
    .map(x => x.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);

  const evidenceSentence = (v) => clean(v)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(x => x.trim())
    .filter(Boolean);

  // Only fields below may be sent to the blurb generator.
  function buildEvidence(raw) {
    const r = raw || {};
    return {
      identity: { name: clean(r.name) },
      professionalIdentity: list(r.professionalIdentity || r.domain || r.roleFamily),
      roles: list(r.experienceRoles || r.rolesHeld || r.experience),
      companies: list(r.experienceCompanies || r.companies),
      projects: list(r.projects || r.verifiedProjects),
      responsibilities: list(r.responsibilities || r.verifiedResponsibilities),
      achievements: list(r.achievements || r.verifiedAchievements),
      metrics: list(r.metrics || r.verifiedMetrics),
      skills: list(r.skills || r.verifiedSkills),
      resumeEvidence: evidenceSentence(r.resumeText || r.resumeEvidence),
      evidenceSource: clean(r.evidenceSource || 'resume/profile evidence')
    };
  }

  // Matching fields are intentionally separate from blurb evidence.
  function buildMatching(raw) {
    const r = raw || {};
    return {
      rolesToSource: list(r.rolesToSource || r.targetRoles),
      compensation: {
        target: clean(r.targetComp || r.ctc),
        min: clean(r.compMin),
        max: clean(r.compMax)
      },
      locations: list(r.locationPref || r.location),
      hardConstraints: list(r.hardConstraints || r.hardConstraintsText),
      sectors: list(r.sectors || r.sector),
      functions: list(r.functions || r.domain || r.roleFamily)
    };
  }

  // Operational information must never be passed to the blurb model as evidence.
  function buildRecruiterContext(raw) {
    const r = raw || {};
    return {
      status: clean(r.status),
      priority: clean(r.priority),
      source: clean(r.source),
      sourcingHistory: list(r.sourcingHistory),
      applications: r.applications || null,
      interviews: r.interviews || null,
      rejections: r.rejections || null,
      notes: list(r.recruiterNotes || r.ffNotes || r.mofNotes || r.remarks)
    };
  }

  function normalize(raw) {
    const r = raw || {};
    return {
      id: clean(r.id || r.studentId || r.email || r.linkedin || r.name).toLowerCase(),
      identity: {
        name: clean(r.name),
        email: clean(r.email),
        linkedin: clean(r.linkedin),
        city: clean(r.city)
      },
      matching: buildMatching(r),
      evidence: buildEvidence(r),
      recruiterContext: buildRecruiterContext(r),
      resume: {
        available: Boolean(clean(r.resume || r.resumeUrl || r.resumeText || r.resumeEvidence)),
        source: clean(r.resume || r.resumeUrl),
        parsed: Boolean(clean(r.resumeText || r.resumeEvidence))
      }
    };
  }

  root.TalentMatchSchema = { normalize, buildEvidence, buildMatching, buildRecruiterContext };
})(window);
