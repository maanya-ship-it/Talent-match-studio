/* Production matcher layer. The raw roster remains the Sheet/resume source; recruiter notes are never used as candidate evidence. */
(function () {
  'use strict';

  const boot = () => {
    const dataEl = document.getElementById('students-data');
    const roleEl = document.getElementById('roleTitle');
    const jdEl = document.getElementById('jd');
    const minEl = document.getElementById('compMin');
    const maxEl = document.getElementById('compMax');
    const btn = document.getElementById('matchBtn');
    const results = document.getElementById('results');
    if (!dataEl || !roleEl || !btn || !results) return;

    let students;
    try { students = JSON.parse(dataEl.textContent || '[]'); }
    catch { students = []; }
    if (!students.length) return;

    const clean = v => String(v ?? '').trim();
    const norm = v => clean(v).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9₹%+./ -]/g, ' ').replace(/\s+/g, ' ').trim();
    const tokens = v => norm(v).split(/[^a-z0-9]+/).filter(x => x.length > 2);
    const esc = v => clean(v).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
    const list = v => clean(v).split(/\n|\||;/).map(x => x.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
    const aliases = {
      bangalore:['bangalore','bengaluru'], delhi:['delhi','new delhi','gurgaon','gurugram','noida'],
      mumbai:['mumbai','bombay'], hyderabad:['hyderabad','hyd'], pune:['pune'], chennai:['chennai','madras'],
      kolkata:['kolkata','calcutta'], remote:['remote','wfh','work from home']
    };

    const css = `.tm-context{margin-top:14px;padding:12px;background:#F8FAFC;border:1px solid var(--line);border-radius:6px}.tm-context label{display:block;margin:0 0 6px}.tm-input{width:100%;box-sizing:border-box;font:13px Inter,sans-serif;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:6px;padding:9px 10px;margin-bottom:8px}.tm-help{font-size:10.5px;color:var(--muted);line-height:1.45;margin:-2px 0 8px}.tm-mode{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:8px}.tm-mode button{border:1px solid var(--line);background:#fff;border-radius:5px;padding:7px 4px;font-size:10px;font-weight:600;cursor:pointer}.tm-mode button.active{background:var(--accent-soft);border-color:var(--accent);color:#174B82}.tm-output{margin-top:12px;background:#F8FBFE;border:1px solid #D7E6F5;border-left:3px solid var(--accent);border-radius:6px;padding:14px 16px}.tm-output h4{font-family:'IBM Plex Mono',monospace;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);margin:0 0 7px}.tm-output p{margin:0;font-size:13px;line-height:1.65;color:var(--ink);white-space:pre-line}.tm-output .tm-one{font-weight:600;line-height:1.5}.tm-actions{display:flex;gap:7px;margin-top:11px;flex-wrap:wrap}.tm-actions button{border:1px solid var(--line);background:#fff;border-radius:5px;padding:6px 9px;font-size:10.5px;font-weight:600;cursor:pointer}.tm-matchbox{margin-bottom:12px;padding:11px 13px;background:#F8FAFC;border:1px solid var(--line);border-radius:6px;font-size:11px;color:var(--ink-soft)}.tm-fit{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.tm-fit span{padding:4px 7px;border-radius:4px;font-size:10px;background:var(--sage-soft);color:#245541}.tm-fit span.no{background:#fff0f0;color:#9b3b3b}.tm-why{font-size:11px;color:var(--ink-soft);line-height:1.5;margin-top:8px}.tm-quality{font-size:10px;color:#245541;margin-top:8px}.tm-error{font-size:11px;color:#9b3b3b;background:#fff7f7;border:1px solid #eccaca;border-radius:6px;padding:8px;margin-top:8px}`;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

    if (!document.getElementById('tmHighlight')) {
      const ctx = document.createElement('div');
      ctx.className = 'tm-context';
      ctx.innerHTML = `<label for="tmHighlight">Experience / context to highlight</label><input class="tm-input" id="tmHighlight" placeholder="e.g. Investment, Strategy, GTM"><div class="tm-help">Role and highlight are independent. Use this to tell the tool which experience to foreground.</div><label for="tmLocation">Location constraint</label><input class="tm-input" id="tmLocation" placeholder="e.g. Bangalore, Mumbai or Remote"><div class="tm-help">Leave blank for any location. Separate multiple locations with commas.</div><label>Matching mode</label><div class="tm-mode" id="tmMode"><button type="button" data-mode="strict" class="active">Strict</button><button type="button" data-mode="balanced">Balanced</button><button type="button" data-mode="broad">Broad</button></div>`;
      const anchor = maxEl?.closest('.comp-section') || maxEl?.parentElement;
      if (anchor) anchor.insertAdjacentElement('afterend', ctx);
    }

    let mode = 'strict';
    document.querySelectorAll('#tmMode button').forEach(b => b.onclick = () => {
      mode = b.dataset.mode;
      document.querySelectorAll('#tmMode button').forEach(x => x.classList.toggle('active', x === b));
    });

    const roleParts = () => list(roleEl.value.replace(/,/g, '\n'));
    const requestedLocations = () => list(document.getElementById('tmLocation')?.value?.replace(/,/g, '\n')).map(norm);

    function locationFit(s, requested) {
      if (!requested.length) return { ok:true, reason:'Any location' };
      const raw = norm([s.locationPref, s.city, s.hardConstraints].join(' '));
      if (/any location|any city|open to all|anywhere/.test(raw)) return { ok:true, reason:'Open to location' };
      for (const req of requested) {
        const vals = aliases[req] || [req];
        if (vals.some(v => raw.includes(v))) return { ok:true, reason:req + ' aligned' };
      }
      return { ok:false, reason:'Location not aligned' };
    }

    function compFit(s, min, max) {
      const t = parseFloat(clean(s.targetComp).replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(t)) return { ok:true, reason:'Comp not recorded' };
      if (Number.isFinite(min) && t < min) return { ok:false, reason:`₹${t}L target below ₹${min}L floor` };
      if (Number.isFinite(max) && t > max) return { ok:false, reason:`₹${t}L target above ₹${max}L ceiling` };
      return { ok:true, reason:'Comp aligned' };
    }

    // Matching evidence is limited to candidate-facing fields. Recruiter notes/status are excluded.
    function matchingCorpus(s) {
      return norm([
        s.rolesToSource, s.domain, s.minor1, s.minor2, s.functionalRTW, s.sectoralRTW,
        s.experience, s.rolesHeld, s.companies, s.skills, s.projects, s.achievements,
        s.resumeText
      ].join(' '));
    }

    function relevance(s, roles, jd, highlight) {
      const corpus = matchingCorpus(s);
      const overlap = arr => arr.filter(t => corpus.includes(t)).length;
      const roleTokens = tokens(roles.join(' '));
      const jdTokens = tokens(jd);
      const hiTokens = tokens(highlight);
      const role = overlap(roleTokens), jdHits = overlap(jdTokens), hi = overlap(hiTokens);
      let score = role * 10 + Math.min(jdHits, 18) * 3 + hi * 12;
      if (roleTokens.length && role === roleTokens.length) score += 12;
      if (hiTokens.length && hi === 0 && mode === 'strict') score -= 15;
      if (!s.resumeText && !s.resume) score -= 3;
      return { score, role, jd:jdHits, hi };
    }

    function buildMatch() {
      const roles = roleParts();
      const jd = clean(jdEl?.value);
      const highlight = clean(document.getElementById('tmHighlight')?.value);
      const locations = requestedLocations();
      const min = parseFloat(minEl?.value || '');
      const max = parseFloat(maxEl?.value || '');
      const rows = [], excluded = [];
      students.forEach(s => {
        const cf = compFit(s, min, max), lf = locationFit(s, locations), rel = relevance(s, roles, jd, highlight);
        const hardOk = cf.ok && lf.ok;
        if (mode === 'strict' && !hardOk) { excluded.push({s, reason:[!cf.ok?cf.reason:'',!lf.ok?lf.reason:''].filter(Boolean).join(' · ')}); return; }
        let score = rel.score + (cf.ok ? 10 : -18) + (lf.ok ? 10 : -18);
        if (mode === 'broad' && !hardOk) score -= 12;
        rows.push({s, score, cf, lf, rel});
      });
      rows.sort((a,b) => b.score - a.score);
      return {rows:rows.slice(0,25), excluded, roles, jd, highlight, locations, min, max};
    }

    function evidenceFor(s) {
      const text = clean(s.resumeText);
      const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
      const strong = sentences.filter(x => /\d|₹|\$|%|revenue|growth|customers|clients|leads|deals|built|launched|owned|drove|increased|reduced/i.test(x));
      return (strong.length ? strong : sentences).slice(0,4).join(' ');
    }

    function candidatePayload(s) {
      return {
        name:s.name,
        domain:s.domain,
        roleFamily:s.roleFamily,
        experience:s.experience,
        rolesHeld:s.rolesHeld,
        companies:s.companies,
        skills:s.skills,
        projects:s.projects,
        achievements:s.achievements,
        responsibilities:s.responsibilities,
        metrics:s.metrics,
        resumeText:s.resumeText,
        verifiedSkills:s.verifiedSkills,
        verifiedProjects:s.verifiedProjects,
        verifiedAchievements:s.verifiedAchievements,
        verifiedMetrics:s.verifiedMetrics
      };
    }

    async function generate(s, d) {
      const prompt = `TARGET ROLE(S): ${d.roles.join(', ') || 'Not specified'}\nEXPERIENCE / CONTEXT TO HIGHLIGHT: ${d.highlight || 'Choose the strongest role-relevant evidence'}\nJOB DESCRIPTION:\n${d.jd || 'Not provided'}\n\nCANDIDATE DATA:\n${JSON.stringify(candidatePayload(s))}`;
      const r = await fetch('/api/blurb', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prompt})});
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error?.message || 'Generation failed');
      const text = body.text || '';
      const one = (text.match(/ONE-LINER:\s*([\s\S]*?)(?:\nBLURB:|$)/i) || [])[1]?.trim() || '';
      const blurb = (text.match(/BLURB:\s*([\s\S]*)/i) || [])[1]?.trim() || '';
      if (!one || !blurb) throw new Error('The generated response did not pass the required format check.');
      return {one, blurb, quality:body.quality};
    }

    function render(d) {
      const header = `<div class="tm-matchbox"><b>${d.rows.length} ranked candidates</b> · ${d.roles.length?esc(d.roles.join(' + ')):'role not specified'} · ${d.locations.length?esc(d.locations.join(', ')):'any location'}<div class="tm-fit"><span>Hard constraints first</span><span>Evidence-only ranking</span><span>Recruiter notes excluded</span><span>Metric validation on generation</span></div></div>`;
      const cards = d.rows.map((r,i) => {
        const s=r.s;
        return `<div class="card tm-card" data-index="${i}"><div style="display:flex;justify-content:space-between;gap:12px"><div><div class="rank">#${i+1}</div><div class="name-block"><h3>${esc(s.name)}</h3><div class="domain-line">${esc(s.domain||s.rolesToSource||'')}</div></div></div><div style="text-align:right"><div class="score-num">${Math.max(1,Math.min(100,Math.round(50+r.score)))}</div><div class="score-label">fit</div></div></div><div class="meta-grid"><div class="meta-item"><span>Comp</span><b>${esc(s.targetComp||'Not set')} LPA ${r.cf.ok?'✓':'✕'}</b></div><div class="meta-item"><span>Location</span><b>${esc(s.locationPref||s.city||'Not set')} ${r.lf.ok?'✓':'✕'}</b></div><div class="meta-item"><span>Role evidence</span><b>${r.rel.role?'✓ matched':'—'}</b></div><div class="meta-item"><span>Highlight</span><b>${r.rel.hi?'✓ matched':'—'}</b></div></div><div class="tm-why"><b>Why matched:</b> ${r.rel.role?'role evidence':''}${r.rel.role&&r.rel.hi?' + ':''}${r.rel.hi?'highlight evidence':''}${r.rel.jd?' + '+r.rel.jd+' JD signal(s)':''}</div><details class="profile-more"><summary>Verified resume evidence</summary><div class="more-body"><p>${esc(evidenceFor(s)||'No parsed resume evidence available.')}</p></div></details><div class="card-actions"><button class="btn btn-blurb tm-generate">Generate one-liner + blurb</button></div><div class="tm-output" style="display:none"><h4>One-liner</h4><p class="tm-one"></p><h4 style="margin-top:14px">Blurb</h4><p class="tm-blurb"></p><div class="tm-quality"></div><div class="tm-actions"><button class="tm-copy-one">Copy one-liner</button><button class="tm-copy-blurb">Copy blurb</button></div></div></div>`;
      }).join('');
      const excluded = d.excluded.length ? `<div class="tm-excluded"><h4>Excluded by hard constraints</h4>${d.excluded.slice(0,15).map(x=>`<div class="tm-excluded-item"><b>${esc(x.s.name)}</b> · ${esc(x.reason)}</div>`).join('')}</div>` : '';
      results.innerHTML = header + cards + excluded;
      results.querySelectorAll('.tm-card').forEach((card,i) => {
        const s=d.rows[i].s, generateBtn=card.querySelector('.tm-generate'), out=card.querySelector('.tm-output');
        generateBtn.onclick = async () => {
          generateBtn.disabled=true; generateBtn.textContent='Generating…'; out.style.display='block';
          try {
            const g=await generate(s,d);
            card.querySelector('.tm-one').textContent=g.one;
            card.querySelector('.tm-blurb').textContent=g.blurb;
            card.querySelector('.tm-quality').textContent=g.quality?.passed ? '✓ Evidence quality check passed' : '';
            card.querySelector('.tm-copy-one').onclick=()=>navigator.clipboard.writeText(g.one);
            card.querySelector('.tm-copy-blurb').onclick=()=>navigator.clipboard.writeText(g.blurb);
          } catch(e) {
            card.querySelector('.tm-one').textContent='';
            card.querySelector('.tm-blurb').innerHTML=`<span class="tm-error">${esc(e.message || 'Could not generate right now.')}</span>`;
          } finally { generateBtn.disabled=false; generateBtn.textContent='Regenerate one-liner + blurb'; }
        };
      });
    }

    btn.onclick = () => render(buildMatch());
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
