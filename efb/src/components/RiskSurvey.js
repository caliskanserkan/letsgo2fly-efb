import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const APPR_RANK = {
  'CAT III':7,'CAT II':6,'ILS':5,'RNP AR':4,'GNSS':3,'RNP':2,
  'Non-Precision':1,'Circling':0,'--':0
};
const isPrecision = (apr) => APPR_RANK[apr] >= 2;

// IOSA Weighted Scoring — Phase 1 (10 block mapping)
const WEIGHTS = {
  // Block 1: Aerodrome Class — CRITICAL factors
  cat_c: 3,               // CAT C auto-override
  sp_approval: 2,         // Special approval
  
  // Block 2-3: Runway Infrastructure — CRITICAL
  rwy_length_marginal: 3, // Runway length <100% TODA
  rwy_width_narrow: 2,    // <30m
  rwy_width_medium: 1,    // 30-44m
  
  // Block 2-3: Approach Complexity — HIGH
  precision_approach: 2,  // Precision vs non-precision
  approach_angle_steep: 3, // ≥4.5°
  approach_angle_elev: 2,  // 3.5-4.5°
  high_da: 1,             // Terrain-limited minima
  
  // Block 4: Departure — HIGH
  oei_sid: 3,             // Special OEI SID
  oei_gradient: 2,        // Demanding gradient
  perf_limited: 1,        // Performance-limited
  
  // Block 5: Weather — MEDIUM
  lvp_frequent: 2,        // Frequent LVP/fog
  lvp_sometimes: 1,       // Occasional
  xwind_shear: 2,         // Crosswind/windshear
  msa_high: 2,            // MSA ≥8000 ft
  msa_moderate: 1,        // MSA 5000-8000 ft
  
  // Block 6: ATC — MEDIUM
  atc_significant: 2,     // Significant complexity
  atc_moderate: 1,        // Moderate
  mil_traffic: 2,         // Military/mixed
  gnss_active: 4,         // ACTIVE JAMMING (critical!)
  gnss_notam: 2,          // NOTAM interference
  
  // Block 7: Security & State — CRITICAL
  pol_risk_high: 3,       // High political/terror risk (AUTO OVERRIDE)
  pol_risk_caution: 2,    // Caution advisories
  arpt_sec_poor: 3,       // Poor security/handling
  arpt_sec_uncertain: 2,  // Uncertain standards
  
  // Block 8: Alternate, Fuel, Crew — CRITICAL
  fuel_quality_poor: 3,   // Poor fuel quality
  fuel_quality_uncertain: 1,
  alt_none: 3,            // No adequate alternate
  alt_limited: 1,         // Limited alternates
  crew_recent: 1,         // No recent experience
  
  // Base modifiers
  sp_crew: 1,             // Special crew qualification
  sp_desig: 1,            // Special designation
  curfew: 1,              // Curfew restrictions
  nadp_required: 1,       // NADP procedures
};

function calcWeightedScore(points, weight) {
  return (points || 0) * (weight || 1);
}

function scoreToMatrix(score) {
  if (!score || score <= 0) return { s:1, l:1 };
  const clamped = Math.min(Math.max(Math.round(score), 1), 25);
  let best = { s:1, l:1 }, bestDiff = Infinity;
  for (let s = 1; s <= 5; s++) {
    for (let l = 1; l <= 5; l++) {
      const diff = Math.abs(s * l - clamped);
      if (diff < bestDiff || (diff === bestDiff && s >= l)) { bestDiff = diff; best = { s, l }; }
    }
  }
  return best;
}

function getScopeMultiplier(scope, precisionCount) {
  if (!precisionCount || precisionCount === 0) return 1.0;
  switch(scope) {
    case 'all':      return 1.0;
    case 'majority': return 0.75;
    case 'minority': return 0.50;
    case 'single':   return Math.max(1 / precisionCount, 0.25);
    default:         return 1.0;
  }
}

function RwyScope({ scopeVal, onScope, rwysVal, onRwys, precisionCount, show, availableRwys }) {
  if (!show) return null;
  const singleMult = precisionCount ? Math.max(1 / precisionCount, 0.25) : 1;
  const scopeOptions = [
    { id:'all',      label:'All RWY',    mult:1.0,        color:'#ef4444' },
    { id:'majority', label:'>50% RWY',   mult:0.75,       color:'#f97316' },
    { id:'minority', label:'<50% RWY',   mult:0.50,       color:'#f0c040' },
    { id:'single',   label:'Single RWY', mult:singleMult, color:'#4ade80' },
  ];
  const filteredScope = precisionCount ? scopeOptions : [scopeOptions[0]];
  const toggleRwy = (rwyId) => {
    const current = rwysVal || [];
    onRwys(current.includes(rwyId) ? current.filter(r => r !== rwyId) : [...current, rwyId]);
  };
  return (
    <div style={{ marginTop:6, padding:'8px 10px', background:'#111', borderRadius:4, borderLeft:'2px solid #1e293b' }}>
      {precisionCount > 0 && (
        <div style={{ marginBottom:6 }}>
          <span style={{ fontSize:9, color:'#475569', marginRight:6 }}>SCOPE:</span>
          <div style={{ display:'inline-flex', gap:4, flexWrap:'wrap' }}>
            {filteredScope.map(o => (
              <button key={o.id} onClick={() => onScope(o.id)}
                style={{ fontSize:9, padding:'2px 7px', borderRadius:3, cursor:'pointer', fontFamily:"'Courier New',monospace", fontWeight:700,
                  background: scopeVal===o.id ? `${o.color}20` : '#1e293b',
                  border: `1px solid ${scopeVal===o.id ? o.color : '#334155'}`,
                  color: scopeVal===o.id ? o.color : '#555' }}>
                {o.label} ×{o.mult.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
      )}
      {availableRwys && availableRwys.length > 0 && (
        <div>
          <span style={{ fontSize:9, color:'#475569', marginRight:6 }}>RUNWAY(S):</span>
          <div style={{ display:'inline-flex', gap:4, flexWrap:'wrap', marginTop:2 }}>
            {availableRwys.map(rwy => {
              const selected = (rwysVal || []).includes(rwy.des);
              return (
                <button key={rwy.des} onClick={() => toggleRwy(rwy.des)}
                  style={{ fontSize:9, padding:'2px 8px', borderRadius:3, cursor:'pointer', fontFamily:"'Courier New',monospace", fontWeight:700,
                    background: selected ? 'rgba(56,189,248,0.2)' : '#1e293b',
                    border: `1px solid ${selected ? '#38bdf8' : '#334155'}`,
                    color: selected ? '#38bdf8' : '#555' }}>
                  {rwy.des} <span style={{ opacity:0.6, fontSize:8 }}>({rwy.apr})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function calcRisk(s) {
  let score = 0, overrideHigh = false, overrideMedium = false;
  let overrideReasons = [], drivers = [], actions = [];
  const pc = s.precisionCount || 0;
  const sm = (scope) => getScopeMultiplier(scope, pc);
  
  // Weighted add: (points, weight, driver, action, scopeMult)
  const add = (pts, weight, d, a, mult=1) => { 
    const weighted = (pts || 0) * (weight || 1) * mult;
    score += weighted; 
    if(d) drivers.push(d); 
    if(a) actions.push(a); 
  };

  // ─── AUTO OVERRIDES ───
  if(s.cat==='C'){overrideHigh=true;overrideReasons.push('CAT C aerodrome (auto override)');}
  if(s.pol_risk==='high'){overrideHigh=true;overrideReasons.push('High security / political threat (weight ×3)');}
  if(s.gnss_risk==='active'){overrideHigh=true;overrideReasons.push('ACTIVE GNSS JAMMING/SPOOFING');}
  if(!s.prec&&s.angle==='steep'&&s.oei_sid&&s.angle_scope==='all'&&s.oei_sid_scope==='all'){overrideHigh=true;overrideReasons.push('No precision + steep approach + OEI SID (all runways)');}
  if(s.sp_approval){overrideMedium=true;overrideReasons.push('Special operator approval required');}
  if(s.lvp==='frequent'&&s.alt==='no'){overrideMedium=true;overrideReasons.push('Frequent LVP + no adequate alternate');}

  // ─── SPECIAL DESIGNATIONS ───
  if(s.sp_desig) add(2, WEIGHTS.sp_desig, 'Special aerodrome designation','Verify operator-specific procedures');
  if(s.sp_crew)  add(2, WEIGHTS.sp_crew, 'Special crew qualification required','Verify crew qualification');
  if(s.sp_approval) add(2, WEIGHTS.sp_approval, 'Special operator approval required','Obtain approval documentation');
  if(!s.prec) add(2, WEIGHTS.precision_approach, 'No precision approach available','Confirm crew currency on non-precision approach');

  // ─── APPROACH COMPLEXITY ───
  if(s.angle==='slight')        add(1, WEIGHTS.approach_angle_elev, 'Slightly elevated approach (3.0–3.49°)',null,sm(s.angle_scope));
  else if(s.angle==='moderate_low') add(2, WEIGHTS.approach_angle_elev, 'Non-standard approach (3.5–3.89°)','Brief glide path technique',sm(s.angle_scope));
  else if(s.angle==='moderate') add(2, WEIGHTS.approach_angle_elev, 'Elevated approach (3.9–4.49°)','Enhanced briefing required',sm(s.angle_scope));
  else if(s.angle==='steep')    add(3, WEIGHTS.approach_angle_steep, 'Steep approach (>=4.5°)','Dedicated crew briefing mandatory',sm(s.angle_scope));

  if(s.high_da)      add(1, WEIGHTS.high_da, 'Terrain-limited minima DA/DH >= 400 ft',null,sm(s.high_da_scope));
  if(s.gnss_risk==='active') add(4, WEIGHTS.gnss_active, 'ACTIVE GNSS JAMMING/SPOOFING','Do NOT rely on GNSS; revert to raw data');
  else if(s.gnss_risk==='notam') add(2, WEIGHTS.gnss_notam, 'GNSS reliability concern (NOTAM)','Cross-check raw data');
  if(s.offset)       add(1, 1, 'Offset localizer / offset approach',null,sm(s.offset_scope));
  if(s.madem)        add(2, 1, 'Demanding missed approach / gradient','Brief missed approach in detail',sm(s.madem_scope));
  if(s.oei_ma_brief) add(2, 1, 'Engine-out go-around dedicated briefing required',null,sm(s.oei_ma_scope));

  // ─── RUNWAY INFRASTRUCTURE ───
  if(s.rwy_w==='narrow') add(3, WEIGHTS.rwy_width_narrow, 'Narrow runway (<30m)','Confirm crosswind limits',sm(s.rwy_w_scope));
  else if(s.rwy_w==='medium') add(1, WEIGHTS.rwy_width_medium, 'Reduced runway width (30–44m)',null,sm(s.rwy_w_scope));
  if(s.rwy_marg)  add(2, WEIGHTS.rwy_length_marginal, 'Marginal runway length','Compute performance with actual conditions',sm(s.rwy_marg_scope));
  if(s.phys_comp) add(2, 1, 'Physical runway complexity',null,sm(s.phys_comp_scope));

  // ─── DEPARTURE ───
  if(s.oei_sid)  add(3, WEIGHTS.oei_sid, 'Special OEI SID required','Complete OEI SID analysis; brief engine failure',sm(s.oei_sid_scope));
  if(s.oei_grad) add(2, WEIGHTS.oei_gradient, 'Demanding OEI climb gradient','Review obstacle clearance margins',sm(s.oei_grad_scope));
  if(s.perf_lim) add(1, WEIGHTS.perf_limited, 'Performance-limited departure','Review WAT/CLG limits',sm(s.perf_lim_scope));

  // ─── WEATHER & TERRAIN ───
  if(s.lvp==='sometimes') add(1, WEIGHTS.lvp_sometimes, 'Occasional LVP / low ceiling');
  if(s.lvp==='frequent')  add(2, WEIGHTS.lvp_frequent, 'Frequent LVP / fog / low visibility','Monitor forecast; verify LVP procedures');
  if(s.xw_risk) add(2, WEIGHTS.xwind_shear, 'Crosswind / windshear / contamination','Review limits; brief windshear escape');
  const msa=parseInt(s.msa_ft)||0;
  if(msa>=12000) add(3, WEIGHTS.msa_high, 'High terrain MSA '+msa+' ft','Review terrain escape; enhanced GPWS/TAWS awareness');
  else if(msa>=8000) add(2, WEIGHTS.msa_high, 'Elevated terrain MSA '+msa+' ft','Verify terrain awareness; confirm missed approach clearance');
  else if(msa>=5000) add(1, WEIGHTS.msa_moderate, 'Moderate terrain MSA '+msa+' ft');
  if(msa>=8000&&!s.prec) add(1, WEIGHTS.precision_approach, 'High MSA + non-precision approach','Increase terrain-focused briefing');
  if(msa>=8000&&(s.angle==='moderate'||s.angle==='steep')) add(1, 1, 'High MSA + elevated/steep approach');
  if(s.terr_hh) add(2, 1, 'Significant terrain / mountain wave / hot-high','Compute hot-high performance; enhanced TAWS awareness');

  // ─── ATC & TRAFFIC ───
  if(s.atc==='moderate') add(1, WEIGHTS.atc_moderate, 'Moderate ATC / taxi complexity');
  if(s.atc==='significant') add(2, WEIGHTS.atc_significant, 'Significant ATC / sequencing complexity','Allow extra margins; pre-brief complex taxi');
  if(s.mil_traff) add(2, WEIGHTS.mil_traffic, 'Military / mixed traffic / unusual phraseology','Review local ATC procedures');

  // ─── SECURITY & STATE OVERSIGHT ───
  if(s.pol_risk==='caution') add(3, 2, 'Political / security caution advisories','Obtain security briefing; review emergency protocols');
  if(s.arpt_sec==='uncertain') add(3, WEIGHTS.arpt_sec_uncertain, 'Airport security / handling uncertain','Coordinate with handler for enhanced measures');
  if(s.arpt_sec==='poor') add(4, WEIGHTS.arpt_sec_poor, 'Poor airport security / handling','Consult security team; consider enhanced measures');
  if(s.st_oversight==='partial') add(2, 1, 'Partial state safety oversight');
  if(s.st_oversight==='no') add(4, 2, 'Inadequate state safety oversight','Verify OM requirements; obtain safety bulletins');

  // ─── ALTERNATE, FUEL, CREW ───
  if(s.alt==='limited') add(2, WEIGHTS.alt_limited, 'Limited alternate options','Identify extended-range alternates; plan contingency fuel');
  if(s.alt==='no') add(3, WEIGHTS.alt_none, 'No adequate alternate','Reassess dispatch; carry contingency fuel; notify OCC');
  if(s.fuel==='uncertain') add(1, WEIGHTS.fuel_quality_uncertain, 'Fuel / ground handling uncertain','Confirm availability 48h before departure');
  if(s.fuel==='poor') add(2, WEIGHTS.fuel_quality_poor, 'Poor fuel / ground handling','Arrange alternative source; coordinate with handler');
  if(!s.crew_rec) add(1, WEIGHTS.crew_recent, 'No recent crew experience (<12 months)','Brief aerodrome-specific material; consider refresher');
  if(s.curfew){ const t=s.curfew_open&&s.curfew_close?' ('+s.curfew_open+'–'+s.curfew_close+' UTC)':''; add(1, WEIGHTS.curfew, 'Curfew in effect'+t,'Plan within curfew window'); }
  if(s.nadp){ const t=s.nadp_types&&s.nadp_types.length?' — '+s.nadp_types.join(', '):''; add(1, WEIGHTS.nadp_required, 'NADP required'+t,'Brief NADP; ensure crew familiar with thrust reduction'); }

  score = Math.round(score * 10) / 10;
  const uniqueDrivers=[...new Set(drivers.filter(Boolean))];
  const uniqueActions=[...new Set(actions.filter(Boolean))];
  
  let risk, basis, approval;
  if(overrideHigh){
    risk='HIGH';
    basis=overrideReasons;
    approval='OPS_MANAGER_APPROVAL_REQUIRED';
  }
  else if(score>=161){
    risk='HIGH';
    basis=['Weighted risk score: '+score+' (threshold >= 161)',...overrideReasons];
    approval='OPS_MANAGER_APPROVAL_REQUIRED';
  }
  else if(score>=111){
    risk='MEDIUM';
    basis=overrideMedium?[...overrideReasons,...(score?['Score: '+score]:[])]:[`Weighted risk score: ${score} (threshold >= 111)`];
    approval='CHIEF_PILOT_REVIEW';
  }
  else{
    risk='LOW';
    basis=['Weighted risk score: '+score+' (threshold < 111)'];
    approval='DISPATCH_OK';
  }
  
  return {risk,score,basis,drivers:uniqueDrivers,actions:uniqueActions,approval};
}

function rwyLabel(rwys) {
  if (!rwys || rwys.length === 0) return '';
  return ' — RWY ' + rwys.join(', RWY ');
}

function generatePpsBriefing(f, result, prec, bestRwy, rwyData) {
  const lines1=[],lines2=[],lines3=[];
  const sl=(scope,rwys)=>{
    const rwyPart = rwys && rwys.length ? rwyLabel(rwys) : '';
    if(!f.precisionCount) return rwyPart;
    const scopePart = scope==='all'?' (all RWY)':scope==='majority'?' (>50% RWY)':scope==='minority'?' (<50% RWY)':' (single RWY)';
    return rwyPart || scopePart;
  };

  if(rwyData.length) lines1.push(`RUNWAYS: ${rwyData.map(r=>`RWY ${r.des} (${r.apr})`).join(', ')}`);
  if(bestRwy) lines1.push(`BEST APPROACH: ${bestRwy.apr} — RWY ${bestRwy.des}${prec?' (PRECISION)':' (NON-PRECISION — confirm crew currency)'}`);

  const angleMap={normal:null,slight:`APPROACH ANGLE: Slightly elevated (3.0–3.49°)${sl(f.angle_scope,f.angle_rwys)} — crew awareness required`,moderate_low:`APPROACH ANGLE: Non-standard (3.5–3.89°)${sl(f.angle_scope,f.angle_rwys)} — brief glide path technique`,moderate:`APPROACH ANGLE: Elevated (3.9–4.49°)${sl(f.angle_scope,f.angle_rwys)} — enhanced briefing required`,steep:`APPROACH ANGLE: STEEP (≥4.5°)${sl(f.angle_scope,f.angle_rwys)} — mandatory dedicated crew briefing`};
  if(angleMap[f.angle]) lines1.push(angleMap[f.angle]);
  if(f.high_da)       lines1.push(`MINIMA: DA/DH ≥ 400 ft terrain-limited${sl(f.high_da_scope,f.high_da_rwys)} — review published minima`);
  if(f.offset)        lines1.push(`LOCALIZER: Offset approach${sl(f.offset_scope,f.offset_rwys)} — brief technique and go-around`);
  if(f.madem)         lines1.push(`MISSED APPROACH: Above-standard gradient${sl(f.madem_scope,f.madem_rwys)} — brief in detail`);
  if(f.oei_ma_brief)  lines1.push(`OEI GO-AROUND: Dedicated briefing required${sl(f.oei_ma_scope,f.oei_ma_rwys)}`);
  const rwm={wide:null,medium:`RWY WIDTH: Reduced (30–44m)${sl(f.rwy_w_scope,f.rwy_w_rwys)} — crosswind awareness`,narrow:`RWY WIDTH: Narrow (<30m)${sl(f.rwy_w_scope,f.rwy_w_rwys)} — confirm crosswind limits`};
  if(rwm[f.rwy_w]) lines1.push(rwm[f.rwy_w]);
  if(f.rwy_marg)  lines1.push(`RWY LENGTH: Marginal${sl(f.rwy_marg_scope,f.rwy_marg_rwys)} — compute with actual conditions`);
  if(f.phys_comp) lines1.push(`PHYSICAL: Slope/displaced threshold/offset LOC${sl(f.phys_comp_scope,f.phys_comp_rwys)} — enhanced approach briefing`);
  if(f.oei_sid)   lines1.push(`DEPARTURE: Special OEI SID${sl(f.oei_sid_scope,f.oei_sid_rwys)} — complete obstacle clearance analysis`);
  if(f.oei_grad)  lines1.push(`DEPARTURE: Demanding OEI gradient${sl(f.oei_grad_scope,f.oei_grad_rwys)} — verify clearance margins`);
  if(f.perf_lim)  lines1.push(`DEPARTURE: Performance-limited${sl(f.perf_lim_scope,f.perf_lim_rwys)} — review WAT/CLG limits`);
  const atcm={no:null,moderate:'ATC: Moderate complexity — allow extra margins; plan taxi route',significant:'ATC: Significant sequencing — coordinate slot; brief full taxi in detail'};
  if(atcm[f.atc]) lines1.push(atcm[f.atc]);
  if(f.mil_traff) lines1.push('ATC: Military/mixed traffic — unusual phraseology; review local procedures');
  if(f.curfew){ const w=f.curfew_open&&f.curfew_close?` (${f.curfew_open}–${f.curfew_close} UTC)`:''; lines1.push(`CURFEW: In effect${w} — plan arrival/departure within window`); }
  if(f.nadp){ const t=[f.nadp_n1?'NADP 1':null,f.nadp_n2?'NADP 2':null,f.nadp_pA?'Proc A':null,f.nadp_pB?'Proc B':null].filter(Boolean); lines1.push(`NADP: Required${t.length?' — '+t.join(', '):''}  — brief thrust reduction schedule`); }
  if(!lines1.length) lines1.push('RWY/ATC/DEP: No significant complexity identified');

  const lvpm={no:null,sometimes:'LVP: Occasional low visibility — monitor TAF; verify LVP procedures current',frequent:'LVP: Frequent LVP/fog — procedures mandatory; alternate selection essential'};
  if(lvpm[f.lvp]) lines2.push(lvpm[f.lvp]);
  if(f.xw_risk) lines2.push('WIND: Crosswind / windshear / contamination — review aircraft limits; brief escape manoeuvre');
  if(f.terr_hh) lines2.push('TERRAIN: Significant terrain / mountain wave / hot-high — compute hot-high performance');
  const msa=parseInt(f.msa_ft)||0;
  if(msa>=12000) lines2.push(`MSA: HIGH — ${msa} ft (${f.msa_sector}) — mandatory terrain escape review; enhanced TAWS awareness`);
  else if(msa>=8000) lines2.push(`MSA: ELEVATED — ${msa} ft (${f.msa_sector}) — verify terrain awareness; confirm missed approach clearance`);
  else if(msa>=5000) lines2.push(`MSA: MODERATE — ${msa} ft (${f.msa_sector}) — verify terrain situational awareness`);
  else if(msa>0) lines2.push(`MSA: ${msa} ft (${f.msa_sector})`);
  if(msa>=8000&&!prec) lines2.push('HIGH MSA + NON-PRECISION: Increased terrain-focused approach briefing required');
  if(!lines2.length) lines2.push('WEATHER/TERRAIN: No significant constraints identified');

  const gm={no:null,notam:`GNSS: NOTAM'd interference — cross-check raw data; do not rely solely on GNSS`,active:'GNSS: ACTIVE JAMMING/SPOOFING — do NOT use GNSS navigation; revert to raw ILS/VOR/DME'};
  if(gm[f.gnss_risk]) lines3.push(gm[f.gnss_risk]);
  const pm={no:null,caution:'SECURITY: Caution advisories in effect — obtain pre-flight security briefing; review diversion protocols',high:'SECURITY: HIGH RISK — mandatory security briefing; contingency plan filed with OCC'};
  if(pm[f.pol_risk]) lines3.push(pm[f.pol_risk]);
  const sm2={good:null,uncertain:'HANDLING: Standards uncertain — coordinate directly with handler; verify fuel quality on arrival',poor:'HANDLING: Poor / inadequate — arrange alternative handler; consult company security team'};
  if(sm2[f.arpt_sec]) lines3.push(sm2[f.arpt_sec]);
  const om={yes:null,partial:'STATE OVERSIGHT: Partial compliance — verify OM requirements; enhanced crew vigilance',no:'STATE OVERSIGHT: Inadequate / unrecognised — obtain current safety bulletins; strict OM adherence'};
  if(om[f.st_oversight]) lines3.push(om[f.st_oversight]);
  const am={yes:null,limited:'ALTERNATE: Limited options — identify extended-range alternates; carry contingency fuel',no:'ALTERNATE: None available — reassess dispatch criteria; maximum contingency fuel; notify OCC before departure'};
  if(am[f.alt]) lines3.push(am[f.alt]);
  const fm={reliable:null,uncertain:'FUEL: Availability uncertain — confirm quantities and quality 48h before departure',poor:'FUEL: Poor / known concerns — arrange alternative fuel source; coordinate with local handler'};
  if(fm[f.fuel]) lines3.push(fm[f.fuel]);
  if(!f.crew_rec) lines3.push('CREW RECENCY: No operation at this aerodrome in last 12 months — conduct aerodrome-specific briefing');
  if(f.sp_desig) lines3.push('DESIGNATION: Special aerodrome designation applies — verify all operator-specific procedures are current');
  if(f.sp_crew)  lines3.push('QUALIFICATION: Special crew qualification required — confirm both crew members hold required endorsement');
  if(f.sp_approval) lines3.push('APPROVAL: Special operator approval required — obtain and carry approval documentation');
  if(f.free_text&&f.free_text.trim()) lines3.push(`ADDITIONAL REMARKS: ${f.free_text.trim()}`);
  if(!lines3.length) lines3.push('SECURITY / HANDLING / NAV: No significant concerns identified');

  return{section1:lines1.join('\n'),section2:lines2.join('\n'),section3:lines3.join('\n')};
}

const IS={
  sel:{width:'100%',background:'#1e293b',border:'1px solid #334155',color:'#e8e8e8',fontSize:12,padding:'8px 10px',borderRadius:4,fontFamily:"'Courier New',monospace"},
  inp:{width:'100%',background:'#1e293b',border:'1px solid #334155',color:'#e8e8e8',fontSize:12,padding:'8px 10px',borderRadius:4,fontFamily:"'Courier New',monospace",boxSizing:'border-box'},
  lbl:{fontSize:10,color:'#777',marginBottom:5,textTransform:'uppercase',letterSpacing:.8,display:'block'},
  r2:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12},
};

function CB({label,checked,onChange,children}){
  return(
    <div style={{padding:'5px 0'}}>
      <div onClick={()=>onChange(!checked)} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:12,color:'#aaa'}}>
        <div style={{width:16,height:16,border:'2px solid '+(checked?'#38bdf8':'#444'),background:checked?'#38bdf8':'transparent',borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          {checked&&<span style={{color:'#fff',fontSize:10}}>✓</span>}
        </div>
        {label}
      </div>
      {checked&&children}
    </div>
  );
}

function Blk({title,open,onToggle,children}){
  return(
    <div style={{marginBottom:12,background:'#161616',border:'1px solid #1e293b',borderRadius:6,overflow:'hidden'}}>
      <div style={{padding:'10px 14px',background:'#0f172a',borderBottom:'1px solid #1e293b',fontSize:11,fontWeight:700,color:'#38bdf8',letterSpacing:1,textTransform:'uppercase',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}} onClick={onToggle}>
        <span>{title}</span><span>{open?'▲':'▼'}</span>
      </div>
      {open&&<div style={{padding:'12px 14px'}}>{children}</div>}
    </div>
  );
}

const RC={'LOW':{bg:'rgba(74,222,128,0.12)',border:'#4ade80',text:'#4ade80'},'MEDIUM':{bg:'rgba(232,163,32,0.12)',border:'#e8a320',text:'#e8a320'},'HIGH':{bg:'rgba(224,32,32,0.12)',border:'#ef4444',text:'#ef4444'}};

const DEFAULT_STATE = {
  assessed_by:'', cat:'B', sp_desig:false, sp_crew:false, sp_approval:false,
  rwy_data: Array(8).fill(null).map(()=>({des:'',apr:'--'})),
  angle:'normal', angle_scope:'all', angle_rwys:[],
  high_da:false, high_da_scope:'all', high_da_rwys:[],
  offset:false, offset_scope:'all', offset_rwys:[],
  madem:false, madem_scope:'all', madem_rwys:[],
  oei_ma_brief:false, oei_ma_scope:'all', oei_ma_rwys:[],
  rwy_w:'wide', rwy_w_scope:'all', rwy_w_rwys:[],
  rwy_marg:false, rwy_marg_scope:'all', rwy_marg_rwys:[],
  phys_comp:false, phys_comp_scope:'all', phys_comp_rwys:[],
  oei_sid:false, oei_sid_scope:'all', oei_sid_rwys:[],
  oei_grad:false, oei_grad_scope:'all', oei_grad_rwys:[],
  perf_lim:false, perf_lim_scope:'all', perf_lim_rwys:[],
  lvp:'no', xw_risk:false, terr_hh:false, msa_ft:0, msa_sector:'All sectors',
  atc:'no', mil_traff:false, gnss_risk:'no',
  pol_risk:'no', arpt_sec:'good', st_oversight:'yes',
  alt:'yes', fuel:'reliable', crew_rec:true,
  curfew:false, curfew_open:'', curfew_close:'',
  nadp:false, nadp_n1:false, nadp_n2:false, nadp_pA:false, nadp_pB:false,
  free_text:'',
};

// ─── Assessment History (pilot panelinde de kullanılır) ───────────────────────
export function AssessmentHistory({ icao, compact=false }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    if(!icao) return;
    supabase.from('rass_assessments')
      .select('id,assessed_by,assessed_at,risk_level,risk_score,ops_approval')
      .eq('icao', icao.toUpperCase())
      .order('assessed_at', { ascending: false })
      .limit(compact ? 3 : 20)
      .then(({data})=>{ setHistory(data||[]); setLoading(false); });
  },[icao, compact]);

  const fmtDate = iso => {
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-GB')} ${d.toISOString().slice(11,16)} UTC`;
  };

  const riskColor = r => r==='HIGH'?'#ef4444':r==='MEDIUM'?'#e8a320':'#4ade80';

  if(loading) return <div style={{fontSize:10,color:'#475569',padding:'8px 16px',fontFamily:"'Courier New',monospace"}}>Loading history...</div>;
  if(!history.length) return <div style={{fontSize:10,color:'#334155',padding:'8px 16px',fontFamily:"'Courier New',monospace"}}>No assessment history</div>;

  return(
    <div>
      {!compact && (
        <div style={{padding:'6px 16px',background:'#0d1117',borderBottom:'1px solid #1e2530',fontSize:9,color:'#546e7a',fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>
          Assessment History
        </div>
      )}
      {history.map((h,i)=>(
        <div key={h.id} style={{
          padding: compact ? '6px 16px' : '9px 16px',
          borderBottom:'1px solid #1e2530',
          background: i===0 ? 'rgba(56,189,248,0.04)' : 'transparent',
          display:'flex', alignItems:'center', gap:10,
        }}>
          {/* Risk badge */}
          <span style={{
            fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:3,
            background:`${riskColor(h.risk_level)}15`,
            border:`1px solid ${riskColor(h.risk_level)}40`,
            color:riskColor(h.risk_level),
            fontFamily:"'Courier New',monospace",
            minWidth:44, textAlign:'center', flexShrink:0,
          }}>{h.risk_level||'—'}</span>

          {/* Info */}
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:11, color: i===0?'#e8e8e8':'#777', fontFamily:"'Courier New',monospace", fontWeight: i===0?700:400}}>
              {h.assessed_by||'—'}
              {i===0 && <span style={{fontSize:9,color:'#38bdf8',marginLeft:6}}>← current</span>}
            </div>
            <div style={{fontSize:9, color:'#334155', fontFamily:"'Courier New',monospace", marginTop:1}}>
              {fmtDate(h.assessed_at)}
              {h.risk_score!=null && <span style={{marginLeft:8}}>score: {h.risk_score}</span>}
            </div>
          </div>

          {/* Ops approval */}
          {!compact && (
            <div style={{fontSize:9,color:'#475569',fontFamily:"'Courier New',monospace",textAlign:'right',maxWidth:120}}>
              {h.ops_approval?.replace(' APPROVAL REQUIRED','')?.replace(' COORDINATION','') || '—'}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function RiskSurvey({icao, airportName, airportCat, onClose, onSaved}){
  const [open,setOpen]=useState({1:true,2:true,3:false,4:false,5:false,6:false,7:false,8:false,9:false,10:false});
  const [saving,setSaving]=useState(false);
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(true);
  const [lastAssessment,setLastAssessment]=useState(null);
  const APR=['--','CAT III','CAT II','ILS','GNSS','RNP AR','RNP','Non-Precision','Circling'];

  const [f,setF]=useState({...DEFAULT_STATE, cat: airportCat||'B'});

  useEffect(()=>{
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('airport_risks')
          .select('survey_state, category, ra_assessed_by, ra_assessment_date')
          .eq('icao', icao.toUpperCase())
          .single();

        if (data?.survey_state) {
          setF({ ...DEFAULT_STATE, ...data.survey_state, assessed_by:'', cat: data.category||airportCat||'B' });
          setLastAssessment({ by: data.ra_assessed_by, date: data.ra_assessment_date });
        } else {
          setF({...DEFAULT_STATE, cat: airportCat||'B'});
        }
      } catch { setF({...DEFAULT_STATE, cat: airportCat||'B'}); }
      setLoading(false);
    };
    load();
  }, [icao, airportCat]);

  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const tog=(n)=>setOpen(p=>({...p,[n]:!p[n]}));
  const rwyData=f.rwy_data.filter(r=>r.des.trim());
  const bestRwy=rwyData.reduce((b,r)=>(!b||APPR_RANK[r.apr]>APPR_RANK[b.apr])?r:b,null);
  const prec=bestRwy&&APPR_RANK[bestRwy.apr]>=3;
  const precisionCount=rwyData.filter(r=>isPrecision(r.apr)).length;

  const RS=(scopeKey,rwysKey)=>(
    <RwyScope scopeVal={f[scopeKey]} onScope={v=>s(scopeKey,v)} rwysVal={f[rwysKey]} onRwys={v=>s(rwysKey,v)}
      precisionCount={precisionCount} show={true} availableRwys={rwyData}/>
  );

  const handleCalc=()=>{
    const nadp_types=[f.nadp_n1?'NADP 1':null,f.nadp_n2?'NADP 2':null,f.nadp_pA?'Proc A':null,f.nadp_pB?'Proc B':null].filter(Boolean);
    setResult(calcRisk({...f,prec,rwy_data:rwyData,nadp_types,precisionCount}));
    setTimeout(()=>document.getElementById('ra-result-box')?.scrollIntoView({behavior:'smooth'}),100);
  };

  const handleSave=async()=>{
    if(!result||!f.assessed_by) return;
    setSaving(true);
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const due = new Date(Date.now()+365*86400000).toISOString().split('T')[0];
    
    // Approval mapping from weighted system
    const approvalMap = {
      'DISPATCH_OK': 'DISPATCH OK',
      'CHIEF_PILOT_REVIEW': 'CAPTAIN REVIEW / DISPATCH COORDINATION',
      'OPS_MANAGER_APPROVAL_REQUIRED': 'OPS MANAGER APPROVAL REQUIRED',
    };
    const ops = approvalMap[result.approval] || 'DISPATCH OK';
    
    const pps = generatePpsBriefing(f,result,prec,bestRwy,rwyData);
    const matrixPos = scoreToMatrix(result.score);
    const surveyState = { ...f };

    // 1 — airport_risks güncelle (en güncel)
    const { error: e1 } = await supabase.from('airport_risks').upsert({
      icao: icao.toUpperCase(), category: f.cat,
      base_score: Math.round(result.score), risk_level: result.risk, ops_approval: ops,
      max_s: matrixPos.s, max_l: matrixPos.l,
      ra_risk_level: result.risk, ra_risk_score: result.score,
      ra_risk_basis: JSON.stringify(result.basis),
      ra_key_drivers: JSON.stringify(result.drivers),
      ra_actions: JSON.stringify(result.actions),
      ra_assessment_date: today, ra_reassessment_due: due,
      ra_assessed_by: f.assessed_by, ra_ops_approval: ops,
      section1: pps.section1, section2: pps.section2, section3: pps.section3,
      survey_state: surveyState,
      runways: rwyData.map(r=>r.des).filter(Boolean).join(','),
      updated_at: now,
    },{onConflict:'icao'});

    if(e1){ alert('Save error: '+e1.message); setSaving(false); return; }

    // 2 — rass_assessments'a yeni satır ekle (geçmiş)
    await supabase.from('rass_assessments').insert({
      icao: icao.toUpperCase(),
      assessed_by: f.assessed_by,
      assessed_at: now,
      risk_level: result.risk,
      risk_score: result.score,
      ops_approval: ops,
      survey_state: surveyState,
      section1: pps.section1,
      section2: pps.section2,
      section3: pps.section3,
    });

    setSaving(false);
    onSaved&&onSaved();
    onClose();
  };

  const rc=result?RC[result.risk]||RC.LOW:null;
  const scopeInfo=precisionCount>0
    ?`${precisionCount} precision/RNP runway${precisionCount>1?'s':''} — scope proportioning active`
    :'No precision runways — full score applies';

  if(loading) return(
    <div style={{background:'#111',color:'#475569',fontFamily:"'Courier New',monospace",padding:40,textAlign:'center',fontSize:11,letterSpacing:2}}>
      LOADING SURVEY DATA...
    </div>
  );

  return(
    <div style={{background:'#111',color:'#e8e8e8',fontFamily:"'Courier New',monospace",maxHeight:'90vh',display:'flex',flexDirection:'column'}}>
      <div style={{padding:'14px 18px',background:'#1e293b',borderBottom:'1px solid #1e293b',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:'#e8a020',letterSpacing:2}}>{icao}</div>
          <div style={{fontSize:12,color:'#e8e8e8'}}>{airportName} — Risk Assessment Survey</div>
          {lastAssessment?.date && (
            <div style={{fontSize:9,color:'#475569',marginTop:3}}>
              Last assessed: {lastAssessment.date} — {lastAssessment.by||'—'}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:'#475569',cursor:'pointer',fontSize:20}}>✕</button>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>

        {/* Assessment history — compact */}
        <div style={{marginBottom:12,background:'#161616',border:'1px solid #1e293b',borderRadius:6,overflow:'hidden'}}>
          <div style={{padding:'7px 12px',background:'#1e293b',fontSize:9,color:'#38bdf8',fontWeight:700,letterSpacing:1,textTransform:'uppercase',borderBottom:'1px solid #1e293b'}}>
            Assessment History
          </div>
          <AssessmentHistory icao={icao} compact={true}/>
        </div>

        {/* Assessed by */}
        <div style={{marginBottom:12}}>
          <label style={IS.lbl}>Assessed by (required each time)</label>
          <input style={{...IS.inp, borderColor: !f.assessed_by ? '#f97316' : '#334155'}}
            placeholder="Capt. Name..."
            value={f.assessed_by}
            onChange={e=>s('assessed_by',e.target.value)}/>
          {!f.assessed_by&&<div style={{fontSize:9,color:'#f97316',marginTop:3}}>Required before saving</div>}
        </div>

        {/* Block 1 */}
        <Blk title="Block 1 — Aerodrome Classification" open={open[1]} onToggle={()=>tog(1)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Aerodrome category?</label>
            <select style={IS.sel} value={f.cat} onChange={e=>s('cat',e.target.value)}>
              <option value="A">A — Normal operations</option>
              <option value="B">B — Enhanced planning</option>
              <option value="C">C — AUTO OVERRIDE HIGH</option>
            </select>
          </div>
          <div style={IS.r2}>
            <CB label="Special aerodrome designation?" checked={f.sp_desig} onChange={v=>s('sp_desig',v)}/>
            <CB label="Special crew qualification required?" checked={f.sp_crew} onChange={v=>s('sp_crew',v)}/>
          </div>
          <CB label="Special operator approval required?" checked={f.sp_approval} onChange={v=>s('sp_approval',v)}/>
        </Blk>

        {/* Block 2 */}
        <Blk title="Block 2 — Runway & Approach" open={open[2]} onToggle={()=>tog(2)}>
          <label style={IS.lbl}>Active runways and approach types</label>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:10}}>
            {f.rwy_data.map((r,i)=>(
              <div key={i}>
                <input style={{...IS.inp,marginBottom:4}} placeholder={'RWY '+(i+1)} maxLength={4} value={r.des}
                  onChange={e=>s('rwy_data',f.rwy_data.map((x,j)=>j===i?{...x,des:e.target.value.toUpperCase()}:x))}/>
                <select style={IS.sel} value={r.apr}
                  onChange={e=>s('rwy_data',f.rwy_data.map((x,j)=>j===i?{...x,apr:e.target.value}:x))}>
                  {APR.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <button onClick={()=>s("rwy_data",[...f.rwy_data,...Array(8).fill(null).map(()=>({des:"",apr:"--"}))])}
              style={{fontSize:10,padding:"4px 12px",background:"#1e293b",border:"1px solid #38bdf8",color:"#38bdf8",borderRadius:4,cursor:"pointer",fontFamily:"'Courier New',monospace"}}>
              + ADD 8 MORE RUNWAYS ({f.rwy_data.length} slots)
            </button>
            {f.rwy_data.length > 8 && (
              <button onClick={()=>s("rwy_data",f.rwy_data.slice(0,8))}
                style={{fontSize:10,padding:"4px 10px",background:"#1e293b",border:"1px solid #334155",color:"#555",borderRadius:4,cursor:"pointer",fontFamily:"'Courier New',monospace"}}>
                RESET TO 8
              </button>
            )}
          </div>
          {bestRwy&&<div style={{fontSize:10,color:'#4ade80',marginBottom:4}}>Best approach: {bestRwy.apr} — RWY {bestRwy.des} {prec?'(PRECISION)':'(non-precision)'}</div>}
          {rwyData.length>0&&(
            <div style={{fontSize:9,color:precisionCount>0?'#38bdf8':'#555',marginBottom:10,padding:'4px 8px',background:precisionCount>0?'rgba(56,189,248,0.08)':'rgba(80,80,80,0.08)',borderRadius:4}}>
              ℹ {scopeInfo}
            </div>
          )}
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Approach angle?</label>
            <select style={IS.sel} value={f.angle} onChange={e=>s('angle',e.target.value)}>
              <option value="normal">Normal (3.0°) — standard</option>
              <option value="slight">Slightly elevated (3.0–3.49°)</option>
              <option value="moderate_low">Non-standard (3.5–3.89°)</option>
              <option value="moderate">Elevated (3.9–4.49°)</option>
              <option value="steep">Steep (≥4.5°)</option>
            </select>
            {f.angle!=='normal'&&RS('angle_scope','angle_rwys')}
          </div>
          <CB label="Precision DA/DH ≥ 400 ft (terrain-limited minima)?" checked={f.high_da} onChange={v=>s('high_da',v)}>
            {RS('high_da_scope','high_da_rwys')}
          </CB>
          <div style={IS.r2}>
            <CB label="Offset localizer / offset approach in use?" checked={f.offset} onChange={v=>s('offset',v)}>
              {RS('offset_scope','offset_rwys')}
            </CB>
            <CB label="Missed approach / climb gradient above standard?" checked={f.madem} onChange={v=>s('madem',v)}>
              {RS('madem_scope','madem_rwys')}
            </CB>
          </div>
          <CB label="Engine-out go-around requires dedicated crew briefing?" checked={f.oei_ma_brief} onChange={v=>s('oei_ma_brief',v)}>
            {RS('oei_ma_scope','oei_ma_rwys')}
          </CB>
        </Blk>

        {/* Block 3 */}
        <Blk title="Block 3 — Runway & Physical" open={open[3]} onToggle={()=>tog(3)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Runway width?</label>
            <select style={IS.sel} value={f.rwy_w} onChange={e=>s('rwy_w',e.target.value)}>
              <option value="wide">45 m or more — standard</option>
              <option value="medium">30–44 m — reduced</option>
              <option value="narrow">Less than 30 m — narrow</option>
            </select>
            {f.rwy_w!=='wide'&&RS('rwy_w_scope','rwy_w_rwys')}
          </div>
          <div style={IS.r2}>
            <CB label="Runway length marginal for planned operation?" checked={f.rwy_marg} onChange={v=>s('rwy_marg',v)}>
              {RS('rwy_marg_scope','rwy_marg_rwys')}
            </CB>
            <CB label="Physical complexity? (slope / displaced threshold / offset LOC)" checked={f.phys_comp} onChange={v=>s('phys_comp',v)}>
              {RS('phys_comp_scope','phys_comp_rwys')}
            </CB>
          </div>
        </Blk>

        {/* Block 4 */}
        <Blk title="Block 4 — Departure & OEI" open={open[4]} onToggle={()=>tog(4)}>
          <CB label="Special OEI SID required?" checked={f.oei_sid} onChange={v=>s('oei_sid',v)}>
            {RS('oei_sid_scope','oei_sid_rwys')}
          </CB>
          <CB label="OEI gradient demanding?" checked={f.oei_grad} onChange={v=>s('oei_grad',v)}>
            {RS('oei_grad_scope','oei_grad_rwys')}
          </CB>
          <CB label="Performance-limited departure?" checked={f.perf_lim} onChange={v=>s('perf_lim',v)}>
            {RS('perf_lim_scope','perf_lim_rwys')}
          </CB>
        </Blk>

        {/* Block 5 */}
        <Blk title="Block 5 — Weather & Environment" open={open[5]} onToggle={()=>tog(5)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Frequency of LVP / fog / low ceiling?</label>
            <select style={IS.sel} value={f.lvp} onChange={e=>s('lvp',e.target.value)}>
              <option value="no">Rarely / not significant</option>
              <option value="sometimes">Occasional</option>
              <option value="frequent">Frequent</option>
            </select>
          </div>
          <div style={IS.r2}>
            <CB label="Crosswind / windshear / contamination significant?" checked={f.xw_risk} onChange={v=>s('xw_risk',v)}/>
            <CB label="Significant terrain / mountain wave / hot-high?" checked={f.terr_hh} onChange={v=>s('terr_hh',v)}/>
          </div>
          <div style={{...IS.r2,marginTop:10}}>
            <div>
              <label style={IS.lbl}>Minimum Sector Altitude — MSA (ft)</label>
              <input style={IS.inp} type="number" min={0} max={25000} step={100} value={f.msa_ft} onChange={e=>s('msa_ft',parseInt(e.target.value)||0)}/>
            </div>
            <div>
              <label style={IS.lbl}>MSA sector</label>
              <select style={IS.sel} value={f.msa_sector} onChange={e=>s('msa_sector',e.target.value)}>
                <option>All sectors</option>
                <option>Specific sector (worst case)</option>
                <option>Enroute MEA/MORA</option>
              </select>
            </div>
          </div>
        </Blk>

        {/* Block 6 */}
        <Blk title="Block 6 — ATC & Operational Complexity" open={open[6]} onToggle={()=>tog(6)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>ATC / slot / taxi routing complexity?</label>
            <select style={IS.sel} value={f.atc} onChange={e=>s('atc',e.target.value)}>
              <option value="no">Low / normal</option>
              <option value="moderate">Moderate</option>
              <option value="significant">Significant</option>
            </select>
          </div>
          <CB label="Military / mixed traffic or unusual ATC phraseology?" checked={f.mil_traff} onChange={v=>s('mil_traff',v)}/>
          <div style={{marginTop:10}}>
            <label style={IS.lbl}>GNSS / GPS signal reliability?</label>
            <select style={IS.sel} value={f.gnss_risk} onChange={e=>s('gnss_risk',e.target.value)}>
              <option value="no">No known risk</option>
              <option value="notam">NOTAM'd / interference expected</option>
              <option value="active">Active jamming / spoofing reported</option>
            </select>
          </div>
        </Blk>

        {/* Block 7 */}
        <Blk title="Block 7 — Security, State & Oversight" open={open[7]} onToggle={()=>tog(7)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Political / security risk level?</label>
            <select style={IS.sel} value={f.pol_risk} onChange={e=>s('pol_risk',e.target.value)}>
              <option value="no">No significant concern</option>
              <option value="caution">Caution advisories in effect</option>
              <option value="high">High risk — AUTO OVERRIDE HIGH</option>
            </select>
          </div>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Airport security / ground handling standards?</label>
            <select style={IS.sel} value={f.arpt_sec} onChange={e=>s('arpt_sec',e.target.value)}>
              <option value="good">Adequate / reliable</option>
              <option value="uncertain">Uncertain / inconsistent</option>
              <option value="poor">Poor / inadequate</option>
            </select>
          </div>
          <div>
            <label style={IS.lbl}>State safety oversight / ICAO USOAP compliance?</label>
            <select style={IS.sel} value={f.st_oversight} onChange={e=>s('st_oversight',e.target.value)}>
              <option value="yes">Acceptable (EASA or equivalent)</option>
              <option value="partial">Partial — concerns noted</option>
              <option value="no">No / inadequate / unrecognised</option>
            </select>
          </div>
        </Blk>

        {/* Block 8 */}
        <Blk title="Block 8 — Alternate, Fuel & Crew" open={open[8]} onToggle={()=>tog(8)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Adequate alternate aerodrome within range?</label>
            <select style={IS.sel} value={f.alt} onChange={e=>s('alt',e.target.value)}>
              <option value="yes">Yes — available and suitable</option>
              <option value="limited">Limited options</option>
              <option value="no">No adequate alternate</option>
            </select>
          </div>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Fuel quality and ground handling reliability?</label>
            <select style={IS.sel} value={f.fuel} onChange={e=>s('fuel',e.target.value)}>
              <option value="reliable">Reliable and verified</option>
              <option value="uncertain">Uncertain / variable</option>
              <option value="poor">Poor / known concerns</option>
            </select>
          </div>
          <div>
            <label style={IS.lbl}>Has crew operated at this aerodrome in last 12 months?</label>
            <div style={{display:'flex',gap:16,marginTop:4}}>
              {['Yes','No'].map(v=>(
                <div key={v} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:12,color:'#aaa'}} onClick={()=>s('crew_rec',v==='Yes')}>
                  <div style={{width:14,height:14,borderRadius:7,border:'2px solid '+(f.crew_rec===(v==='Yes')?'#38bdf8':'#444'),background:f.crew_rec===(v==='Yes')?'#38bdf8':'transparent'}}/>
                  {v}
                </div>
              ))}
            </div>
          </div>
        </Blk>

        {/* Block 9 */}
        <Blk title="Block 9 — Curfew" open={open[9]} onToggle={()=>tog(9)}>
          <div>
            <label style={IS.lbl}>Is there a curfew at this aerodrome?</label>
            <div style={{display:'flex',gap:16,marginTop:4}}>
              {['No','Yes'].map(v=>(
                <div key={v} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:12,color:'#aaa'}} onClick={()=>s('curfew',v==='Yes')}>
                  <div style={{width:14,height:14,borderRadius:7,border:'2px solid '+(f.curfew===(v==='Yes')?'#38bdf8':'#444'),background:f.curfew===(v==='Yes')?'#38bdf8':'transparent'}}/>
                  {v}
                </div>
              ))}
            </div>
          </div>
          {f.curfew&&(
            <div style={{...IS.r2,marginTop:10}}>
              <div><label style={IS.lbl}>Opening time (UTC)</label><input style={IS.inp} placeholder="0600" maxLength={4} value={f.curfew_open} onChange={e=>s('curfew_open',e.target.value)}/></div>
              <div><label style={IS.lbl}>Closing time (UTC)</label><input style={IS.inp} placeholder="2300" maxLength={4} value={f.curfew_close} onChange={e=>s('curfew_close',e.target.value)}/></div>
            </div>
          )}
        </Blk>

        {/* Block 10 */}
        <Blk title="Block 10 — NADP (Noise Abatement)" open={open[10]} onToggle={()=>tog(10)}>
          <div>
            <label style={IS.lbl}>Is NADP required at this aerodrome?</label>
            <div style={{display:'flex',gap:16,marginTop:4}}>
              {['No','Yes'].map(v=>(
                <div key={v} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:12,color:'#aaa'}} onClick={()=>s('nadp',v==='Yes')}>
                  <div style={{width:14,height:14,borderRadius:7,border:'2px solid '+(f.nadp===(v==='Yes')?'#38bdf8':'#444'),background:f.nadp===(v==='Yes')?'#38bdf8':'transparent'}}/>
                  {v}
                </div>
              ))}
            </div>
          </div>
          {f.nadp&&(
            <div style={{...IS.r2,marginTop:8}}>
              <CB label="NADP 1" checked={f.nadp_n1} onChange={v=>s('nadp_n1',v)}/>
              <CB label="NADP 2" checked={f.nadp_n2} onChange={v=>s('nadp_n2',v)}/>
              <CB label="Procedure A" checked={f.nadp_pA} onChange={v=>s('nadp_pA',v)}/>
              <CB label="Procedure B" checked={f.nadp_pB} onChange={v=>s('nadp_pB',v)}/>
            </div>
          )}
        </Blk>

        <div style={{marginBottom:12}}>
          <label style={IS.lbl}>Additional remarks / local notes (included in PPS briefing)</label>
          <textarea style={{...IS.inp,minHeight:70,resize:'vertical'}} value={f.free_text} onChange={e=>s('free_text',e.target.value)} placeholder="Specific local knowledge, operator notes, special procedures..."/>
        </div>

        <button onClick={handleCalc} style={{width:'100%',background:'#e8a020',border:'none',color:'#000',fontWeight:700,fontSize:13,padding:'12px',borderRadius:5,cursor:'pointer',fontFamily:"'Courier New',monospace",marginBottom:16}}>
          CALCULATE RISK
        </button>

        {result&&(
          <div id="ra-result-box" style={{background:rc.bg,border:'2px solid '+rc.border,borderRadius:8,padding:16,marginBottom:16}}>
            <div style={{fontSize:11,color:rc.text,fontWeight:700,letterSpacing:1,marginBottom:8}}>AERODROME RISK LEVEL</div>
            <div style={{display:'flex',alignItems:'flex-end',gap:16,marginBottom:8}}>
              <div style={{fontSize:36,fontWeight:900,color:rc.text,letterSpacing:2,lineHeight:1}}>{result.risk}</div>
              <div>
                <div style={{fontSize:20,fontWeight:700,color:rc.text}}>Score: {result.score}</div>
                {precisionCount>0&&<div style={{fontSize:9,color:rc.text,opacity:0.6}}>Scope proportioning active — {precisionCount} precision RWY</div>}
              </div>
            </div>
            
            {/* Approval Workflow */}
            <div style={{background:'rgba(0,0,0,0.3)',border:`1px solid ${rc.border}30`,borderRadius:6,padding:'10px 12px',marginBottom:10}}>
              <div style={{fontSize:9,color:rc.text,fontWeight:700,letterSpacing:1,marginBottom:4,textTransform:'uppercase'}}>APPROVAL REQUIRED</div>
              <div style={{fontSize:12,fontWeight:700,color:rc.text}}>
                {result.approval === 'DISPATCH_OK' && '✓ DISPATCH OK — No approval required'}
                {result.approval === 'CHIEF_PILOT_REVIEW' && '👤 CAPTAIN REVIEW — Chief Pilot must review'}
                {result.approval === 'OPS_MANAGER_APPROVAL_REQUIRED' && '🚫 OPS MANAGER APPROVAL — Operations Manager approval required'}
              </div>
            </div>
            <div style={{fontSize:10,color:'#777',lineHeight:1.8,marginBottom:10}}>
              {result.basis.map((b,i)=><div key={i}>▸ {b}</div>)}
            </div>
            {result.actions.length>0&&(
              <div style={{padding:'8px 10px',background:'rgba(0,0,0,0.3)',borderRadius:4,marginBottom:10}}>
                <div style={{fontSize:10,color:'#4ade80',fontWeight:700,marginBottom:6,letterSpacing:1}}>RECOMMENDED ACTIONS</div>
                {result.actions.map((a,i)=><div key={i} style={{fontSize:11,color:'#aaa',marginBottom:4}}>{i+1}. {a}</div>)}
              </div>
            )}
            {(()=>{
              const pps=generatePpsBriefing(f,result,prec,bestRwy,rwyData);
              return(
                <div style={{padding:'10px 12px',background:'rgba(0,0,0,0.3)',borderRadius:4,borderLeft:'3px solid #38bdf8',marginBottom:10}}>
                  <div style={{fontSize:10,color:'#38bdf8',fontWeight:700,marginBottom:10,letterSpacing:1}}>PPS BRIEFING PREVIEW</div>
                  {[['SECTION 1 — Traffic / ATC / RWY Ops',pps.section1],['SECTION 2 — Meteorology / Wind',pps.section2],['SECTION 3 — Security / Handling / Nav',pps.section3]].map(([title,text])=>(
                    <div key={title} style={{marginBottom:10}}>
                      <div style={{fontSize:9,color:'#38bdf8',fontWeight:700,marginBottom:5,letterSpacing:1}}>{title}</div>
                      {text.split('\n').map((line,i)=><div key={i} style={{fontSize:10,color:'#aaa',lineHeight:1.8,paddingLeft:8}}>▸ {line}</div>)}
                    </div>
                  ))}
                </div>
              );
            })()}
            <button onClick={handleSave} disabled={saving||!f.assessed_by}
              style={{width:'100%',background:f.assessed_by?'#4ade80':'#1e293b',border:'none',color:f.assessed_by?'#fff':'#555',fontWeight:700,fontSize:13,padding:'12px',borderRadius:5,cursor:f.assessed_by?'pointer':'not-allowed',fontFamily:"'Courier New',monospace"}}>
              {saving?'SAVING...':(f.assessed_by?'SAVE TO DATABASE (incl. PPS Briefing)':'Enter "Assessed by" to save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default RiskSurvey;