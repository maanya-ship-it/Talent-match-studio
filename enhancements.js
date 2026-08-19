(function(){
  const students = JSON.parse(document.getElementById('students-data')?.textContent || '[]');
  const jdEl = document.getElementById('jd');
  const roleEl = document.getElementById('roleTitle');
  const compMinEl = document.getElementById('compMin');
  const compMaxEl = document.getElementById('compMax');
  const matchBtn = document.getElementById('matchBtn');
  const resultsEl = document.getElementById('results');
  if(!students.length || !matchBtn || !resultsEl) return;

  const css = `
    .tm-context{margin-top:14px;padding:12px;background:#F8FAFC;border:1px solid var(--line);border-radius:6px}
    .tm-context label{margin:0 0 6px}
    .tm-input{width:100%;font-family:Inter,sans-serif;font-size:13px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:6px;padding:9px 10px;margin-bottom:8px}
    .tm-input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
    .tm-help{font-size:10.5px;color:var(--muted);line-height:1.45;margin:-2px 0 8px}
    .tm-mode{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:8px}
    .tm-mode button{border:1px solid var(--line);background:#fff;border-radius:5px;padding:7px 4px;font-size:10px;font-weight:600;color:var(--ink-soft);cursor:pointer}
    .tm-mode button.active{background:var(--accent-soft);border-color:var(--accent);color:#174B82}
    .tm-matchbox{margin-bottom:12px;padding:11px 13px;background:#F8FAFC;border:1px solid var(--line);border-radius:6px;font-size:11px;color:var(--ink-soft)}
    .tm-matchbox b{color:var(--ink)}
    .tm-fit{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
    .tm-fit span{padding:4px 7px;border-radius:4px;font-size:10px;background:var(--sage-soft);color:#245541}
    .tm-fit span.no{background:var(--p0-soft);color:var(--p0)}
    .tm-output{margin-top:12px;background:#F8FBFE;border:1px solid #D7E6F5;border-left:3px solid var(--accent);border-radius:6px;padding:12px 14px}
    .tm-output h4{font-family:'IBM Plex Mono',monospace;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);margin:0 0 6px}
    .tm-output p{margin:0;font-size:12.5px;line-height:1.55;color:var(--ink);white-space:pre-line}
    .tm-output .tm-one{font-weight:600}
    .tm-actions{display:flex;gap:7px;margin-top:10px;flex-wrap:wrap}
    .tm-actions button{border:1px solid var(--line);background:#fff;border-radius:5px;padding:6px 9px;font-size:10.5px;font-weight:600;color:var(--ink-soft);cursor:pointer}
    .tm-actions button:hover{border-color:var(--accent);color:var(--accent)}
    .tm-excluded{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}
    .tm-excluded h4{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 7px}
    .tm-excluded-item{font-size:11px;color:var(--ink-soft);padding:6px 0;border-bottom:1px solid #eef1f4}
  `;
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);

  const ctx=document.createElement('div');
  ctx.className='tm-context';
  ctx.innerHTML=`
    <label for="tmHighlight">Experience / context to highlight</label>
    <input class="tm-input" id="tmHighlight" placeholder="e.g. Investment, Strategy, GTM">
    <div class="tm-help">Add one or more experiences. The target role and highlighted experience are treated separately.</div>
    <label for="tmLocation">Location constraint</label>
    <input class="tm-input" id="tmLocation" placeholder="e.g. Bangalore, Mumbai or Remote">
    <div class="tm-help">Leave blank for any location. Multiple locations can be comma-separated.</div>
    <label>Matching mode</label>
    <div class="tm-mode" id="tmMode">
      <button type="button" data-mode="strict" class="active">Strict</button>
      <button type="button" data-mode="balanced">Balanced</button>
      <button type="button" data-mode="broad">Broad</button>
    </div>`;
  const comp=compMaxEl?.closest('.comp-section');
  if(comp) comp.insertAdjacentElement('afterend',ctx);

  const modeWrap=document.getElementById('tmMode'); let mode='strict';
  modeWrap.querySelectorAll('button').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;modeWrap.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));});
  if(roleEl){roleEl.placeholder='e.g. Generalist, Investment';const h=document.createElement('div');h.className='tm-help';h.textContent='You can enter multiple target roles separated by commas.';roleEl.insertAdjacentElement('afterend',h);}

  const norm=s=>String(s||'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9₹%+./ -]/g,' ').replace(/\s+/g,' ').trim();
  const tokens=s=>norm(s).split(/[^a-z0-9]+/).filter(x=>x.length>2);
  const aliases={bangalore:['bangalore','bengaluru','bengalure'],delhi:['delhi','delhi ncr','new delhi','gurgaon','gurugram','noida'],mumbai:['mumbai','bombay'],hyderabad:['hyderabad','hyd'],pune:['pune'],chennai:['chennai','madras'],kolkata:['kolkata','calcutta'],remote:['remote','work from home','wfh']};
  function locMatch(student,requested){
    if(!requested.length)return{ok:true,reason:'Any location'};
    const raw=norm((student.locationPref||'')+' '+(student.city||'')+' '+(student.ffNotes||'')+' '+(student.hardConstraints||''));
    if(/any location|any city|open to all|anywhere|all location/.test(raw))return{ok:true,reason:'Open to location'};
    for(const req of requested){const key=Object.keys(aliases).find(k=>aliases[k].includes(req)||req===k);const vals=key?aliases[key]:[req];const positive=vals.some(v=>raw.includes(v));const negative=vals.some(v=>new RegExp(`(?:not|no|except|exclude|avoid)\\s+(?:${v.replace(/ /g,'\\s+')})`).test(raw));if(positive&&!negative)return{ok:true,reason:req+' aligned'};}
    return{ok:false,reason:'Location not aligned'};
  }
  function compFit(s,min,max){const t=parseFloat(String(s.targetComp||'').replace(/[^0-9.]/g,''));if(Number.isFinite(max)&&Number.isFinite(t)&&t>max)return{ok:false,reason:`₹${t}L target exceeds ₹${max}L ceiling`};if(Number.isFinite(min)&&Number.isFinite(t)&&t<min)return{ok:false,reason:`₹${t}L target is below ₹${min}L floor`};return{ok:true,reason:'Comp aligned'};}
  function relevance(s,roleText,jdText,highlights){const corpus=norm([s.rolesToSource,s.domain,s.minor1,s.minor2,s.functionalRTW,s.sectoralRTW,s.successTrack,s.resumeText,s.ffNotes,s.remarks].join(' '));const roleT=tokens(roleText),jdT=tokens(jdText),hiT=tokens(highlights);const overlap=arr=>arr.filter(t=>corpus.includes(t)).length;const role=overlap(roleT),jd=overlap(jdT),hi=overlap(hiT);let score=role*8+Math.min(jd,14)*3+hi*10;if(norm(s.rolesToSource).includes(norm(roleText)))score+=18;if(hiT.length&&hi===0&&mode==='strict')score-=12;if(!s.hasResume&&!s.resumeText)score-=3;return{score,role,jd,hi};}
  function matchAll(){const roles=(roleEl.value||'').split(',').map(x=>x.trim()).filter(Boolean);const roleText=roles.join(' ');const jd=(jdEl.value||'').trim();const highlights=(document.getElementById('tmHighlight').value||'').trim();const requested=(document.getElementById('tmLocation').value||'').split(',').map(x=>norm(x)).filter(Boolean);const min=parseFloat(compMinEl?.value||'');const max=parseFloat(compMaxEl?.value||'');const rows=[],excluded=[];for(const s of students){const cf=compFit(s,min,max),lf=locMatch(s,requested),rel=relevance(s,roleText,jd,highlights);const hardOk=cf.ok&&lf.ok;if(!hardOk&&mode!=='broad'){excluded.push({s,reason:[!cf.ok?cf.reason:'',!lf.ok?lf.reason:''].filter(Boolean).join(' · ')});continue;}let score=rel.score+(cf.ok?8:-20)+(lf.ok?8:-20)+(s.priority==='P0'?3:s.priority==='P1'?2:0);if(mode==='broad'&&!hardOk)score-=15;rows.push({s,score,cf,lf,rel});}rows.sort((a,b)=>b.score-a.score);return{rows:rows.slice(0,25),excluded,roles,roleText,jd,highlights,requested,min,max};}
  function esc(x){return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function evidence(s){const text=s.resumeText||'';const sentences=text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);const nums=sentences.filter(x=>/\d|₹|\$|%|Cr|Lakh|MRR|ARR|AUM|revenue|clients|customers|team|leads/i.test(x));return(nums.length?nums:sentences).slice(0,3).join(' ');}
  async function generate(student,data){const prompt=`You are a senior recruiter writing a candidate pitch.\n\nTARGET ROLE(S): ${data.roles.join(', ')||'Not specified'}\nEXPERIENCE/CONTEXT TO HIGHLIGHT: ${data.highlights||'Use the strongest role-relevant experience'}\nJOB DESCRIPTION:\n${data.jd||'Not provided'}\n\nCANDIDATE PROFILE:\n${JSON.stringify({name:student.name,rolesToSource:student.rolesToSource,domain:student.domain,experience:student.experience,locationPref:student.locationPref,targetComp:student.targetComp,successTrack:student.successTrack,resumeText:student.resumeText,ffNotes:student.ffNotes,remarks:student.remarks})}\n\nRULES:\n- Position the candidate for the TARGET ROLE, not merely their previous role.\n- Use the HIGHLIGHT EXPERIENCE as the key supporting context.\n- Use concrete metrics from the resume wherever available, in BOTH outputs.\n- Never invent, estimate, or alter a metric. If no reliable metric exists, use a concrete qualitative fact.\n- Do not claim experience that is not in the profile.\n- Make the pitch recruiter-facing, specific, concise and evidence-led.\n- Return exactly two sections with these markers:\nONE-LINER:\n<one sentence, ideally metric-backed>\nBLURB:\n<2-4 sentences, metric-backed where possible>\n- No markdown bullets, no quotation marks, no em dashes.`;const r=await fetch('/api/blurb',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})});if(!r.ok)throw new Error('Generation failed');const j=await r.json();const text=j.text||'';const one=(text.match(/ONE-LINER:\s*([\s\S]*?)(?:\nBLURB:|$)/i)||[])[1]?.trim()||'';const blurb=(text.match(/BLURB:\s*([\s\S]*)/i)||[])[1]?.trim()||text.trim();return{one,blurb};}
  function render(data){const maxScore=Math.max(1,...data.rows.map(x=>x.score));const header=`<div class="tm-matchbox"><b>${data.rows.length} ranked candidates</b> · ${data.roles.length?esc(data.roles.join(' + ')):'role not specified'} · ${data.requested.length?esc(data.requested.join(', ')):'any location'} · ${Number.isFinite(data.min)||Number.isFinite(data.max)?`₹${Number.isFinite(data.min)?data.min:'—'}L–₹${Number.isFinite(data.max)?data.max:'—'}L`:'any comp'}<div class="tm-fit"><span>Hard filters applied before ranking</span><span>Resume metrics prioritized</span><span>Role + context separated</span></div></div>`;const cards=data.rows.map((r,i)=>{const s=r.s,pct=Math.max(1,Math.min(100,Math.round(100*r.score/maxScore))),ev=evidence(s);return`<div class="card tm-card" data-name="${esc(s.name)}"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><div class="rank">#${i+1}</div><div class="name-block"><h3>${esc(s.name)}</h3><div class="domain-line">${esc(s.domain||s.rolesToSource||'')}</div></div></div><div style="text-align:right"><div class="score-num">${pct}</div><div class="score-label">fit</div></div></div><div class="meta-grid"><div class="meta-item"><span>Comp</span><b>${esc(s.targetComp||'Not set')} LPA ${r.cf.ok?'✓':'✕'}</b></div><div class="meta-item"><span>Location</span><b>${esc(s.locationPref||s.city||'Not set')} ${r.lf.ok?'✓':'✕'}</b></div><div class="meta-item"><span>Role/context</span><b>${r.rel.role?'✓ Role':'—'} ${r.rel.hi?'· ✓ Highlight':''}</b></div><div class="meta-item"><span>Priority</span><b>${esc(s.priority||'')}</b></div></div><div class="tm-fit"><span>${r.rel.role?'Role evidence matched':'Adjacent role fit'}</span><span>${r.rel.hi?'Highlighted context matched':'Context not found'}</span><span>Resume ${s.hasResume?'available':'limited'}</span></div><details class="profile-more" open><summary>Why matched</summary><div class="more-body"><p><b>Evidence</b>${esc(ev)}</p></div></details><div class="card-actions"><button class="btn btn-blurb tm-generate">Generate one-liner + blurb</button></div><div class="tm-output" style="display:none"><h4>One-liner</h4><p class="tm-one"></p><h4 style="margin-top:12px">Blurb</h4><p class="tm-blurb"></p><div class="tm-actions"><button class="tm-copy-one">Copy one-liner</button><button class="tm-copy-blurb">Copy blurb</button></div></div></div>`;}).join('');const excluded=data.excluded.slice(0,10).map(x=>`<div class="tm-excluded-item"><b>${esc(x.s.name)}</b> · ${esc(x.reason)}</div>`).join('');resultsEl.innerHTML=header+cards+(excluded?`<div class="tm-excluded"><h4>Excluded by hard constraints</h4>${excluded}</div>`:'');resultsEl.querySelectorAll('.tm-card').forEach(card=>{const name=card.dataset.name,s=students.find(x=>x.name===name),btn=card.querySelector('.tm-generate'),out=card.querySelector('.tm-output');btn.onclick=async()=>{btn.disabled=true;btn.textContent='Generating…';out.style.display='block';card.querySelector('.tm-one').textContent='Drafting…';card.querySelector('.tm-blurb').textContent='';try{const g=await generate(s,data);card.querySelector('.tm-one').textContent=g.one;card.querySelector('.tm-blurb').textContent=g.blurb;card.querySelector('.tm-copy-one').onclick=()=>navigator.clipboard.writeText(g.one);card.querySelector('.tm-copy-blurb').onclick=()=>navigator.clipboard.writeText(g.blurb);}catch(e){card.querySelector('.tm-one').textContent='Could not generate right now.';}finally{btn.disabled=false;btn.textContent='Regenerate one-liner + blurb';}};});}
  matchBtn.addEventListener('click',()=>setTimeout(()=>render(matchAll()),0));
})();
