import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

const APPR_RANK = {
  'CAT III':7,'CAT II':6,'ILS':5,'RNP AR':4,'GNSS':3,'RNP':2,
  'Non-Precision':1,'Circling':0,'--':0
};
const isPrecision = (apr) => APPR_RANK[apr] >= 2;

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

function ScopeSelector({ value, onChange, precisionCount, show }) {
  if (!show || !precisionCount) return null;
  const singleMult = Math.max(1 / precisionCount, 0.25);
  const options = [
    { id:'all',      label:'All RWY',   mult:1.0,        color:'#e02020' },
    { id:'majority', label:'>50% RWY',  mult:0.75,       color:'#e8731a' },
    { id:'minority', label:'<50% RWY',  mult:0.50,       color:'#f0c040' },
    { id:'single',   label:'Single RWY',mult:singleMult, color:'#2d9e5f' },
  ];
  return (
    <div style={{ display:'flex', gap:4, marginTop:6, alignItems:'center', flexWrap:'wrap' }}>
      <span style={{ fontSize:9, color:'#555', marginRight:2 }}>AFFECTS:</span>
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)}
          style={{ fontSize:9, padding:'2px 7px', borderRadius:3, cursor:'pointer',
            fontFamily:"'Courier New',monospace", fontWeight:700,
            background: value===o.id ? `${o.color}20` : '#1a1a1a',
            border: `1px solid ${value===o.id ? o.color : '#383838'}`,
            color: value===o.id ? o.color : '#555' }}>
          {o.label} ×{o.mult.toFixed(2)}
        </button>
      ))}
    </div>
  );
}

function calcRisk(s) {
  let score = 0, overrideHigh = false, overrideMedium = false;
  let overrideReasons = [], drivers = [], actions = [];
  const pc = s.precisionCount || 0;
  const sm = (scope) => getScopeMultiplier(scope, pc);
  const add = (pts, d, a, mult=1) => {
    score += pts * mult;
    if(d) drivers.push(d);
    if(a) actions.push(a);
  };

  if(s.cat==='C'){overrideHigh=true;overrideReasons.push('CAT C aerodrome (auto override)');}
  if(s.pol_risk==='high'){overrideHigh=true;overrideReasons.push('High security / political threat');}
  if(!s.prec&&s.angle==='steep'&&s.oei_sid&&s.angle_scope==='all'&&s.oei_sid_scope==='all'){
    overrideHigh=true;overrideReasons.push('No precision + steep approach + OEI SID (all runways)');
  }
  if(s.sp_approval){overrideMedium=true;overrideReasons.push('Special operator approval required');}
  if(s.lvp==='frequent'&&s.alt==='no'){overrideMedium=true;overrideReasons.push('Frequent LVP + no adequate alternate');}

  if(s.sp_desig) add(2,'Special aerodrome designation applies','Verify operator-specific procedures');
  if(s.sp_crew)  add(2,'Special crew qualification required','Verify crew holds required qualification');
  if(s.sp_approval) add(2,'Special operator approval required','Obtain and file approval documentation');
  if(!s.prec) add(2,'No precision approach available','Confirm crew currency on non-precision approach');

  if(s.angle==='slight')       add(1,'Slightly elevated approach (3.0-3.49°)',null,sm(s.angle_scope));
  else if(s.angle==='moderate_low') add(2,'Non-standard approach (3.5-3.89°)','Brief glide path technique',sm(s.angle_scope));
  else if(s.angle==='moderate') add(2,'Elevated approach (3.9-4.49°)',null,sm(s.angle_scope));
  else if(s.angle==='steep')    add(3,'Steep approach (>=4.5°)','Brief technique; verify certification',sm(s.angle_scope));

  if(s.high_da)      add(1,'Terrain-limited minima DA/DH >= 400 ft',null,sm(s.high_da_scope));
  if(s.gnss_risk==='active') add(4,'ACTIVE GNSS JAMMING/SPOOFING','Do NOT rely on GNSS; revert to raw data');
  else if(s.gnss_risk==='notam') add(2,'GNSS reliability concern (NOTAM)','Cross-check raw data');
  if(s.offset)       add(1,'Offset localizer / offset approach',null,sm(s.offset_scope));
  if(s.madem)        add(2,'Demanding missed approach / gradient','Brief missed approach in detail',sm(s.madem_scope));
  if(s.oei_ma_brief) add(2,'Engine-out go-around dedicated briefing required',null,sm(s.oei_ma_scope));

  if(s.rwy_w==='narrow') add(3,'Narrow runway (<30m)','Confirm crosswind limits',sm(s.rwy_w_scope));
  else if(s.rwy_w==='medium') add(1,'Reduced runway width (30-44m)',null,sm(s.rwy_w_scope));
  if(s.rwy_marg)  add(2,'Marginal runway length','Compute performance with actual conditions',sm(s.rwy_marg_scope));
  if(s.phys_comp) add(2,'Physical runway complexity',null,sm(s.phys_comp_scope));

  if(s.oei_sid)  add(3,'Special OEI SID required','Complete OEI SID analysis; brief engine failure',sm(s.oei_sid_scope));
  if(s.oei_grad) add(2,'Demanding OEI climb gradient','Review obstacle clearance margins',sm(s.oei_grad_scope));
  if(s.perf_lim) add(1,'Performance-limited departure','Review WAT/CLG limits',sm(s.perf_lim_scope));

  if(s.lvp==='sometimes') add(1,'Occasional LVP / low ceiling');
  if(s.lvp==='frequent')  add(2,'Frequent LVP / fog / low visibility','Monitor forecast; verify LVP procedures');
  if(s.xw_risk) add(2,'Crosswind / windshear / contamination','Review limits; brief windshear escape');
  const msa=parseInt(s.msa_ft)||0;
  if(msa>=12000) add(3,'High terrain MSA '+msa+' ft','Review terrain escape; enhanced GPWS/TAWS awareness');
  else if(msa>=8000) add(2,'Elevated terrain MSA '+msa+' ft','Verify terrain awareness; confirm missed approach clearance');
  else if(msa>=5000) add(1,'Moderate terrain MSA '+msa+' ft');
  if(msa>=8000&&!s.prec) add(1,'High MSA + non-precision approach','Increase terrain-focused briefing');
  if(msa>=8000&&(s.angle==='moderate'||s.angle==='steep')) add(1,'High MSA + elevated/steep approach');
  if(s.terr_hh) add(2,'Significant terrain / mountain wave / hot-high','Compute hot-high performance; enhanced TAWS awareness');

  if(s.atc==='moderate') add(1,'Moderate ATC / taxi complexity');
  if(s.atc==='significant') add(2,'Significant ATC / sequencing complexity','Allow extra margins; pre-brief complex taxi');
  if(s.mil_traff) add(2,'Military / mixed traffic / unusual phraseology','Review local ATC procedures');

  if(s.pol_risk==='caution') add(3,'Political / security caution advisories','Obtain security briefing; review emergency protocols');
  if(s.arpt_sec==='uncertain') add(3,'Airport security / handling uncertain','Coordinate with handler for enhanced measures');
  if(s.arpt_sec==='poor') add(4,'Poor airport security / handling','Consult security team; consider enhanced measures');
  if(s.st_oversight==='partial') add(2,'Partial state safety oversight');
  if(s.st_oversight==='no') add(4,'Inadequate state safety oversight','Verify OM requirements; obtain safety bulletins');

  if(s.alt==='limited') add(2,'Limited alternate options','Identify extended-range alternates; plan contingency fuel');
  if(s.alt==='no') add(3,'No adequate alternate','Reassess dispatch; carry contingency fuel; notify OCC');
  if(s.fuel==='uncertain') add(1,'Fuel / ground handling uncertain','Confirm availability 48h before departure');
  if(s.fuel==='poor') add(2,'Poor fuel / ground handling','Arrange alternative source; coordinate with handler');
  if(!s.crew_rec) add(1,'No recent crew experience (<12 months)','Brief aerodrome-specific material; consider refresher');
  if(s.curfew){ const t=s.curfew_open&&s.curfew_close?' ('+s.curfew_open+'-'+s.curfew_close+' UTC)':''; add(1,'Curfew in effect'+t,'Plan within curfew window'); }
  if(s.nadp){ const t=s.nadp_types&&s.nadp_types.length?' - '+s.nadp_types.join(', '):''; add(1,'NADP required'+t,'Brief NADP; ensure crew familiar with thrust reduction'); }

  score = Math.round(score * 10) / 10;
  const uniqueDrivers=[...new Set(drivers.filter(Boolean))];
  const uniqueActions=[...new Set(actions.filter(Boolean))];

  let risk,basis;
  if(overrideHigh){risk='HIGH';basis=overrideReasons;}
  else if(score>=10){risk='HIGH';basis=['Weighted risk score: '+score+' (threshold >= 10)',...overrideReasons];}
  else if(overrideMedium||score>=5){risk='MEDIUM';basis=overrideMedium?[...overrideReasons,...(score?['Score: '+score]:[])]:[`Weighted risk score: ${score} (threshold >= 5)`];}
  else{risk='LOW';basis=['Weighted risk score: '+score+' (threshold < 5)'];}

  return {risk,score,basis,drivers:uniqueDrivers,actions:uniqueActions};
}

function generatePpsBriefing(f, result, prec, bestRwy, rwyData) {
  const lines1=[],lines2=[],lines3=[];
  const sl=(scope)=>{
    if(!f.precisionCount) return '';
    return scope==='all'?' (all RWY)':scope==='majority'?' (>50% RWY)':scope==='minority'?' (<50% RWY)':' (single RWY)';
  };

  if(rwyData.length) lines1.push(`RUNWAYS: ${rwyData.map(r=>`RWY ${r.des} (${r.apr})`).join(', ')}`);
  if(bestRwy) lines1.push(`BEST APPROACH: ${bestRwy.apr} — RWY ${bestRwy.des}${prec?' (PRECISION)':' (NON-PRECISION — confirm crew currency)'}`);

  const angleMap={normal:null,slight:`APPROACH ANGLE: Slightly elevated (3.0–3.49°)${sl(f.angle_scope)}`,moderate_low:`APPROACH ANGLE: Non-standard (3.5–3.89°)${sl(f.angle_scope)} — brief technique`,moderate:`APPROACH ANGLE: Elevated (3.9–4.49°)${sl(f.angle_scope)} — enhanced briefing`,steep:`APPROACH ANGLE: STEEP (≥4.5°)${sl(f.angle_scope)} — mandatory dedicated briefing`};
  if(angleMap[f.angle]) lines1.push(angleMap[f.angle]);
  if(f.high_da)       lines1.push(`MINIMA: DA/DH ≥ 400 ft (terrain-limited)${sl(f.high_da_scope)}`);
  if(f.offset)        lines1.push(`LOCALIZER: Offset approach${sl(f.offset_scope)} — brief technique`);
  if(f.madem)         lines1.push(`MISSED APPROACH: Above-standard gradient${sl(f.madem_scope)} — brief in detail`);
  if(f.oei_ma_brief)  lines1.push(`OEI GO-AROUND: Dedicated briefing required${sl(f.oei_ma_scope)}`);
  const rwm={wide:null,medium:`RWY WIDTH: Reduced (30–44m)${sl(f.rwy_w_scope)}`,narrow:`RWY WIDTH: Narrow (<30m)${sl(f.rwy_w_scope)} — confirm limits`};
  if(rwm[f.rwy_w]) lines1.push(rwm[f.rwy_w]);
  if(f.rwy_marg)  lines1.push(`RWY LENGTH: Marginal${sl(f.rwy_marg_scope)} — compute with actual conditions`);
  if(f.phys_comp) lines1.push(`PHYSICAL: Slope/displaced threshold/offset LOC${sl(f.phys_comp_scope)}`);
  if(f.oei_sid)   lines1.push(`DEP: Special OEI SID${sl(f.oei_sid_scope)} — complete obstacle analysis`);
  if(f.oei_grad)  lines1.push(`DEP: Demanding OEI gradient${sl(f.oei_grad_scope)} — verify clearance margins`);
  if(f.perf_lim)  lines1.push(`DEP: Performance-limited departure${sl(f.perf_lim_scope)} — review WAT/CLG`);
  const atcm={no:null,moderate:'ATC: Moderate complexity — allow extra margins',significant:'ATC: Significant sequencing — coordinate slot; brief full taxi'};
  if(atcm[f.atc]) lines1.push(atcm[f.atc]);
  if(f.mil_traff) lines1.push('ATC: Military/mixed traffic — unusual phraseology; review local procedures');
  if(f.curfew){ const w=f.curfew_open&&f.curfew_close?` (${f.curfew_open}–${f.curfew_close} UTC)`:''; lines1.push(`CURFEW: In effect${w}`); }
  if(f.nadp){ const t=[f.nadp_n1?'NADP 1':null,f.nadp_n2?'NADP 2':null,f.nadp_pA?'Proc A':null,f.nadp_pB?'Proc B':null].filter(Boolean); lines1.push(`NADP: Required${t.length?' — '+t.join(', '):''}  — brief thrust reduction`); }
  if(!lines1.length) lines1.push('RWY/ATC: No significant complexity identified');

  const lvpm={no:null,sometimes:'LVP: Occasional — monitor TAF; verify LVP procedures',frequent:'LVP: Frequent — verify procedures; alternate planning essential'};
  if(lvpm[f.lvp]) lines2.push(lvpm[f.lvp]);
  if(f.xw_risk) lines2.push('WIND: Crosswind/windshear/contamination — review limits; brief escape');
  if(f.terr_hh) lines2.push('TERRAIN: Significant terrain/mountain wave/hot-high — compute hot-high performance');
  const msa=parseInt(f.msa_ft)||0;
  if(msa>=12000) lines2.push(`MSA: HIGH — ${msa} ft (${f.msa_sector}) — terrain escape review required`);
  else if(msa>=8000) lines2.push(`MSA: ELEVATED — ${msa} ft (${f.msa_sector}) — verify terrain awareness`);
  else if(msa>=5000) lines2.push(`MSA: MODERATE — ${msa} ft (${f.msa_sector})`);
  else if(msa>0) lines2.push(`MSA: ${msa} ft (${f.msa_sector})`);
  if(!lines2.length) lines2.push('WEATHER: No significant constraints identified');

  const gm={no:null,notam:"GNSS: NOTAM'd interference — cross-check raw data",active:'GNSS: ACTIVE JAMMING/SPOOFING — revert to raw data only'};
  if(gm[f.gnss_risk]) lines3.push(gm[f.gnss_risk]);
  const pm={no:null,caution:'SECURITY: Caution advisories — obtain briefing; review diversion protocols',high:'SECURITY: HIGH RISK — mandatory pre-flight briefing; contingency plan required'};
  if(pm[f.pol_risk]) lines3.push(pm[f.pol_risk]);
  const sm2={good:null,uncertain:'HANDLING: Uncertain — coordinate with handler',poor:'HANDLING: Poor — arrange alternative handler'};
  if(sm2[f.arpt_sec]) lines3.push(sm2[f.arpt_sec]);
  const om={yes:null,partial:'STATE OVERSIGHT: Partial — verify OM requirements',no:'STATE OVERSIGHT: Inadequate — obtain safety bulletins; strict OM adherence'};
  if(om[f.st_oversight]) lines3.push(om[f.st_oversight]);
  const am={yes:null,limited:'ALTERNATE: Limited — contingency fuel required',no:'ALTERNATE: None — reassess dispatch; max contingency fuel; notify OCC'};
  if(am[f.alt]) lines3.push(am[f.alt]);
  const fm={reliable:null,uncertain:'FUEL: Uncertain — confirm 48h before departure',poor:'FUEL: Poor — arrange alternative source'};
  if(fm[f.fuel]) lines3.push(fm[f.fuel]);
  if(!f.crew_rec) lines3.push('CREW RECENCY: <12 months — review aerodrome briefing material');
  if(f.sp_desig) lines3.push('DESIGNATION: Special — verify operator-specific procedures');
  if(f.sp_crew)  lines3.push('QUALIFICATION: Special crew qualification required');
  if(f.sp_approval) lines3.push('APPROVAL: Special operator approval — obtain documentation');
  if(f.free_text&&f.free_text.trim()) lines3.push(`REMARKS: ${f.free_text.trim()}`);
  if(!lines3.length) lines3.push('SECURITY/HANDLING/NAV: No significant concerns');

  return{section1:lines1.join('\n'),section2:lines2.join('\n'),section3:lines3.join('\n')};
}

const IS={
  sel:{width:'100%',background:'#1a1a1a',border:'1px solid #383838',color:'#e8e8e8',fontSize:12,padding:'8px 10px',borderRadius:4,fontFamily:"'Courier New',monospace"},
  inp:{width:'100%',background:'#1a1a1a',border:'1px solid #383838',color:'#e8e8e8',fontSize:12,padding:'8px 10px',borderRadius:4,fontFamily:"'Courier New',monospace",boxSizing:'border-box'},
  lbl:{fontSize:10,color:'#777',marginBottom:5,textTransform:'uppercase',letterSpacing:.8,display:'block'},
  r2:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12},
  r3:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12},
  blk:{marginBottom:12,background:'#161616',border:'1px solid #2a2a2a',borderRadius:6,overflow:'hidden'},
  bh:{padding:'10px 14px',background:'#1e1e1e',borderBottom:'1px solid #2a2a2a',fontSize:11,fontWeight:700,color:'#1a9bc4',letterSpacing:1,textTransform:'uppercase',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'},
  bb:{padding:'12px 14px'},
};

function CB({label,checked,onChange,children}){
  return(
    <div style={{padding:'5px 0'}}>
      <div onClick={()=>onChange(!checked)} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:12,color:'#aaa'}}>
        <div style={{width:16,height:16,border:'2px solid '+(checked?'#1a9bc4':'#444'),background:checked?'#1a9bc4':'transparent',borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          {checked&&<span style={{color:'#fff',fontSize:10}}>v</span>}
        </div>
        {label}
      </div>
      {checked&&children}
    </div>
  );
}

function Blk({title,open,onToggle,children}){
  return(
    <div style={IS.blk}>
      <div style={IS.bh} onClick={onToggle}><span>{title}</span><span>{open?'▲':'▼'}</span></div>
      {open&&<div style={IS.bb}>{children}</div>}
    </div>
  );
}

const RC={'LOW':{bg:'rgba(45,158,95,0.12)',border:'#2d9e5f',text:'#2d9e5f'},'MEDIUM':{bg:'rgba(232,163,32,0.12)',border:'#e8a320',text:'#e8a320'},'HIGH':{bg:'rgba(224,32,32,0.12)',border:'#e02020',text:'#e02020'}};

const DEFAULT_SCOPES={angle_scope:'all',high_da_scope:'all',offset_scope:'all',madem_scope:'all',oei_ma_scope:'all',rwy_w_scope:'all',rwy_marg_scope:'all',phys_comp_scope:'all',oei_sid_scope:'all',oei_grad_scope:'all',perf_lim_scope:'all'};

export function RiskSurvey({icao,airportName,airportCat,onClose,onSaved}){
  const [open,setOpen]=useState({1:true,2:true,3:false,4:false,5:false,6:false,7:false,8:false,9:false,10:false});
  const [saving,setSaving]=useState(false);
  const [result,setResult]=useState(null);
  const APR=['--','CAT III','CAT II','ILS','GNSS','RNP AR','RNP','Non-Precision','Circling'];

  const [f,setF]=useState({
    assessed_by:'',cat:airportCat||'B',sp_desig:false,sp_crew:false,sp_approval:false,
    rwy_data:Array(8).fill(null).map(()=>({des:'',apr:'--'})),
    angle:'normal',high_da:false,offset:false,madem:false,oei_ma_brief:false,
    rwy_w:'wide',rwy_marg:false,phys_comp:false,
    oei_sid:false,oei_grad:false,perf_lim:false,
    lvp:'no',xw_risk:false,terr_hh:false,msa_ft:0,msa_sector:'All sectors',
    atc:'no',mil_traff:false,gnss_risk:'no',
    pol_risk:'no',arpt_sec:'good',st_oversight:'yes',
    alt:'yes',fuel:'reliable',crew_rec:true,
    curfew:false,curfew_open:'',curfew_close:'',
    nadp:false,nadp_n1:false,nadp_n2:false,nadp_pA:false,nadp_pB:false,
    free_text:'',...DEFAULT_SCOPES,
  });

  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const tog=(n)=>setOpen(p=>({...p,[n]:!p[n]}));
  const rwyData=f.rwy_data.filter(r=>r.des.trim());
  const bestRwy=rwyData.reduce((b,r)=>(!b||APPR_RANK[r.apr]>APPR_RANK[b.apr])?r:b,null);
  const prec=bestRwy&&APPR_RANK[bestRwy.apr]>=3;
  const precisionCount=rwyData.filter(r=>isPrecision(r.apr)).length;

  const handleCalc=()=>{
    const nadp_types=[f.nadp_n1?'NADP 1':null,f.nadp_n2?'NADP 2':null,f.nadp_pA?'Proc A':null,f.nadp_pB?'Proc B':null].filter(Boolean);
    setResult(calcRisk({...f,prec,rwy_data:rwyData,nadp_types,precisionCount}));
    setTimeout(()=>document.getElementById('ra-result-box')?.scrollIntoView({behavior:'smooth'}),100);
  };

  const handleSave=async()=>{
    if(!result)return;
    setSaving(true);
    const today=new Date().toISOString().split('T')[0];
    const due=new Date(Date.now()+365*86400000).toISOString().split('T')[0];
    const summary=[...result.drivers];
    if(!prec) summary.unshift('No precision approach available');
    if(f.cat!=='A') summary.unshift('CAT '+f.cat+' aerodrome');
    const ops=result.risk==='HIGH'?'OPS MANAGER APPROVAL REQUIRED':result.risk==='MEDIUM'?'CAPTAIN REVIEW / DISPATCH COORDINATION':'DISPATCH OK';
    const pps=generatePpsBriefing(f,result,prec,bestRwy,rwyData);
    const{error}=await supabase.from('airport_risks').upsert({
      icao:icao.toUpperCase(),category:f.cat,base_score:result.score,risk_level:result.risk,ops_approval:ops,max_s:5,max_l:5,
      ra_risk_level:result.risk,ra_risk_score:result.score,ra_risk_basis:JSON.stringify(result.basis),
      ra_key_drivers:JSON.stringify(result.drivers),ra_actions:JSON.stringify(result.actions),
      ra_briefing_items:JSON.stringify(summary),ra_assessment_date:today,ra_reassessment_due:due,
      ra_assessed_by:f.assessed_by||'Admin',ra_ops_approval:ops,
      section1:pps.section1,section2:pps.section2,section3:pps.section3,
      updated_at:new Date().toISOString(),
    },{onConflict:'icao'});
    setSaving(false);
    if(error){alert('Save error: '+error.message);}
    else{onSaved&&onSaved();onClose();}
  };

  const rc=result?RC[result.risk]||RC.LOW:null;
  const scopeInfo=precisionCount>0
    ?`${precisionCount} precision/RNP runway${precisionCount>1?'s':''} — scope proportioning active`
    :'No precision runways — full score applies';

  return(
    <div style={{background:'#111',color:'#e8e8e8',fontFamily:"'Courier New',monospace",maxHeight:'90vh',display:'flex',flexDirection:'column'}}>
      <div style={{padding:'14px 18px',background:'#1a1a1a',borderBottom:'1px solid #2a2a2a',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:'#e8a020',letterSpacing:2}}>{icao}</div>
          <div style={{fontSize:12,color:'#e8e8e8'}}>{airportName} — Risk Assessment Survey</div>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:20}}>x</button>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>
        <div style={{marginBottom:12}}>
          <label style={IS.lbl}>Assessed by</label>
          <input style={IS.inp} placeholder="Capt. Name..." value={f.assessed_by} onChange={e=>s('assessed_by',e.target.value)}/>
        </div>

        <Blk title="Block 1 - Aerodrome Classification" open={open[1]} onToggle={()=>tog(1)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Aerodrome category?</label>
            <select style={IS.sel} value={f.cat} onChange={e=>s('cat',e.target.value)}>
              <option value="A">A</option><option value="B">B</option><option value="C">C - AUTO OVERRIDE HIGH</option>
            </select>
          </div>
          <div style={IS.r2}>
            <CB label="Special aerodrome designation?" checked={f.sp_desig} onChange={v=>s('sp_desig',v)}/>
            <CB label="Special crew qualification required?" checked={f.sp_crew} onChange={v=>s('sp_crew',v)}/>
          </div>
          <CB label="Special operator approval required?" checked={f.sp_approval} onChange={v=>s('sp_approval',v)}/>
        </Blk>

        <Blk title="Block 2 - Runway & Approach" open={open[2]} onToggle={()=>tog(2)}>
          <label style={IS.lbl}>Active runways and approach types</label>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:10}}>
            {f.rwy_data.map((r,i)=>(
              <div key={i}>
                <input style={{...IS.inp,marginBottom:4}} placeholder={'RWY '+(i+1)} maxLength={4} value={r.des} onChange={e=>s('rwy_data',f.rwy_data.map((x,j)=>j===i?{...x,des:e.target.value.toUpperCase()}:x))}/>
                <select style={IS.sel} value={r.apr} onChange={e=>s('rwy_data',f.rwy_data.map((x,j)=>j===i?{...x,apr:e.target.value}:x))}>
                  {APR.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            ))}
          </div>
          {bestRwy&&<div style={{fontSize:10,color:'#2d9e5f',marginBottom:4}}>Best: {bestRwy.apr} - RWY {bestRwy.des} {prec?'(PRECISION)':'(non-precision)'}</div>}
          {rwyData.length>0&&(
            <div style={{fontSize:9,color:precisionCount>0?'#1a9bc4':'#555',marginBottom:10,padding:'4px 8px',background:precisionCount>0?'rgba(26,155,196,0.08)':'rgba(80,80,80,0.08)',borderRadius:4}}>
              ℹ {scopeInfo}
            </div>
          )}

          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Approach angle?</label>
            <select style={IS.sel} value={f.angle} onChange={e=>s('angle',e.target.value)}>
              <option value="normal">Normal (3.0°)</option>
              <option value="slight">Slightly elevated (3.0–3.49°)</option>
              <option value="moderate_low">Non-standard (3.5–3.89°)</option>
              <option value="moderate">Elevated (3.9–4.49°)</option>
              <option value="steep">Steep (>=4.5°)</option>
            </select>
            {f.angle!=='normal'&&<ScopeSelector value={f.angle_scope} onChange={v=>s('angle_scope',v)} precisionCount={precisionCount} show={true}/>}
          </div>

          <CB label="Precision DA/DH >= 400 ft (terrain-limited minima)?" checked={f.high_da} onChange={v=>s('high_da',v)}>
            <ScopeSelector value={f.high_da_scope} onChange={v=>s('high_da_scope',v)} precisionCount={precisionCount} show={true}/>
          </CB>
          <div style={IS.r2}>
            <CB label="Offset localizer / offset approach?" checked={f.offset} onChange={v=>s('offset',v)}>
              <ScopeSelector value={f.offset_scope} onChange={v=>s('offset_scope',v)} precisionCount={precisionCount} show={true}/>
            </CB>
            <CB label="Missed approach / gradient above standard?" checked={f.madem} onChange={v=>s('madem',v)}>
              <ScopeSelector value={f.madem_scope} onChange={v=>s('madem_scope',v)} precisionCount={precisionCount} show={true}/>
            </CB>
          </div>
          <CB label="Engine-out go-around requires dedicated briefing?" checked={f.oei_ma_brief} onChange={v=>s('oei_ma_brief',v)}>
            <ScopeSelector value={f.oei_ma_scope} onChange={v=>s('oei_ma_scope',v)} precisionCount={precisionCount} show={true}/>
          </CB>
        </Blk>

        <Blk title="Block 3 - Runway & Physical" open={open[3]} onToggle={()=>tog(3)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Runway width?</label>
            <select style={IS.sel} value={f.rwy_w} onChange={e=>s('rwy_w',e.target.value)}>
              <option value="wide">45 m or more</option>
              <option value="medium">30-44 m</option>
              <option value="narrow">Less than 30 m</option>
            </select>
            {f.rwy_w!=='wide'&&<ScopeSelector value={f.rwy_w_scope} onChange={v=>s('rwy_w_scope',v)} precisionCount={precisionCount} show={true}/>}
          </div>
          <div style={IS.r2}>
            <CB label="Runway length marginal?" checked={f.rwy_marg} onChange={v=>s('rwy_marg',v)}>
              <ScopeSelector value={f.rwy_marg_scope} onChange={v=>s('rwy_marg_scope',v)} precisionCount={precisionCount} show={true}/>
            </CB>
            <CB label="Physical complexity? (slope / threshold / offset LOC)" checked={f.phys_comp} onChange={v=>s('phys_comp',v)}>
              <ScopeSelector value={f.phys_comp_scope} onChange={v=>s('phys_comp_scope',v)} precisionCount={precisionCount} show={true}/>
            </CB>
          </div>
        </Blk>

        <Blk title="Block 4 - Departure & OEI" open={open[4]} onToggle={()=>tog(4)}>
          <CB label="Special OEI SID required?" checked={f.oei_sid} onChange={v=>s('oei_sid',v)}>
            <ScopeSelector value={f.oei_sid_scope} onChange={v=>s('oei_sid_scope',v)} precisionCount={precisionCount} show={true}/>
          </CB>
          <CB label="OEI gradient demanding?" checked={f.oei_grad} onChange={v=>s('oei_grad',v)}>
            <ScopeSelector value={f.oei_grad_scope} onChange={v=>s('oei_grad_scope',v)} precisionCount={precisionCount} show={true}/>
          </CB>
          <CB label="Performance-limited departure?" checked={f.perf_lim} onChange={v=>s('perf_lim',v)}>
            <ScopeSelector value={f.perf_lim_scope} onChange={v=>s('perf_lim_scope',v)} precisionCount={precisionCount} show={true}/>
          </CB>
        </Blk>

        <Blk title="Block 5 - Weather & Environment" open={open[5]} onToggle={()=>tog(5)}>
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
            <div><label style={IS.lbl}>MSA (ft)</label><input style={IS.inp} type="number" min={0} max={25000} step={100} value={f.msa_ft} onChange={e=>s('msa_ft',parseInt(e.target.value)||0)}/></div>
            <div><label style={IS.lbl}>MSA sector</label>
              <select style={IS.sel} value={f.msa_sector} onChange={e=>s('msa_sector',e.target.value)}>
                <option>All sectors</option><option>Specific sector (worst case)</option><option>Enroute MEA/MORA</option>
              </select>
            </div>
          </div>
        </Blk>

        <Blk title="Block 6 - ATC & Operational Complexity" open={open[6]} onToggle={()=>tog(6)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>ATC / slot / taxi complexity?</label>
            <select style={IS.sel} value={f.atc} onChange={e=>s('atc',e.target.value)}>
              <option value="no">Low / normal</option><option value="moderate">Moderate</option><option value="significant">Significant</option>
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

        <Blk title="Block 7 - Security, State & Oversight" open={open[7]} onToggle={()=>tog(7)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Political / security risk?</label>
            <select style={IS.sel} value={f.pol_risk} onChange={e=>s('pol_risk',e.target.value)}>
              <option value="no">No significant concern</option>
              <option value="caution">Caution advisories in effect</option>
              <option value="high">High risk - AUTO OVERRIDE HIGH</option>
            </select>
          </div>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Airport security / handling standards?</label>
            <select style={IS.sel} value={f.arpt_sec} onChange={e=>s('arpt_sec',e.target.value)}>
              <option value="good">Adequate / reliable</option>
              <option value="uncertain">Uncertain / inconsistent</option>
              <option value="poor">Poor / inadequate</option>
            </select>
          </div>
          <div>
            <label style={IS.lbl}>State safety oversight / ICAO USOAP?</label>
            <select style={IS.sel} value={f.st_oversight} onChange={e=>s('st_oversight',e.target.value)}>
              <option value="yes">Acceptable (EASA or equivalent)</option>
              <option value="partial">Partial - concerns noted</option>
              <option value="no">No / inadequate / unrecognised</option>
            </select>
          </div>
        </Blk>

        <Blk title="Block 8 - Alternate, Fuel & Crew" open={open[8]} onToggle={()=>tog(8)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Adequate alternate within range?</label>
            <select style={IS.sel} value={f.alt} onChange={e=>s('alt',e.target.value)}>
              <option value="yes">Yes - available and suitable</option>
              <option value="limited">Limited options</option>
              <option value="no">No adequate alternate</option>
            </select>
          </div>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Fuel quality and ground handling?</label>
            <select style={IS.sel} value={f.fuel} onChange={e=>s('fuel',e.target.value)}>
              <option value="reliable">Reliable and verified</option>
              <option value="uncertain">Uncertain / variable</option>
              <option value="poor">Poor / known concerns</option>
            </select>
          </div>
          <div>
            <label style={IS.lbl}>Crew operated here in last 12 months?</label>
            <div style={{display:'flex',gap:16,marginTop:4}}>
              {['Yes','No'].map(v=>(
                <div key={v} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:12,color:'#aaa'}} onClick={()=>s('crew_rec',v==='Yes')}>
                  <div style={{width:14,height:14,borderRadius:7,border:'2px solid '+(f.crew_rec===(v==='Yes')?'#1a9bc4':'#444'),background:f.crew_rec===(v==='Yes')?'#1a9bc4':'transparent'}}/>
                  {v}
                </div>
              ))}
            </div>
          </div>
        </Blk>

        <Blk title="Block 9 - Curfew" open={open[9]} onToggle={()=>tog(9)}>
          <div>
            <label style={IS.lbl}>Curfew at this aerodrome?</label>
            <div style={{display:'flex',gap:16,marginTop:4}}>
              {['No','Yes'].map(v=>(
                <div key={v} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:12,color:'#aaa'}} onClick={()=>s('curfew',v==='Yes')}>
                  <div style={{width:14,height:14,borderRadius:7,border:'2px solid '+(f.curfew===(v==='Yes')?'#1a9bc4':'#444'),background:f.curfew===(v==='Yes')?'#1a9bc4':'transparent'}}/>
                  {v}
                </div>
              ))}
            </div>
          </div>
          {f.curfew&&(
            <div style={{...IS.r2,marginTop:10}}>
              <div><label style={IS.lbl}>Opening (UTC)</label><input style={IS.inp} placeholder="0600" maxLength={4} value={f.curfew_open} onChange={e=>s('curfew_open',e.target.value)}/></div>
              <div><label style={IS.lbl}>Closing (UTC)</label><input style={IS.inp} placeholder="2300" maxLength={4} value={f.curfew_close} onChange={e=>s('curfew_close',e.target.value)}/></div>
            </div>
          )}
        </Blk>

        <Blk title="Block 10 - NADP (Noise Abatement)" open={open[10]} onToggle={()=>tog(10)}>
          <div>
            <label style={IS.lbl}>NADP required?</label>
            <div style={{display:'flex',gap:16,marginTop:4}}>
              {['No','Yes'].map(v=>(
                <div key={v} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:12,color:'#aaa'}} onClick={()=>s('nadp',v==='Yes')}>
                  <div style={{width:14,height:14,borderRadius:7,border:'2px solid '+(f.nadp===(v==='Yes')?'#1a9bc4':'#444'),background:f.nadp===(v==='Yes')?'#1a9bc4':'transparent'}}/>
                  {v}
                </div>
              ))}
            </div>
          </div>
          {f.nadp&&(
            <div style={{...IS.r2,marginTop:8}}>
              <CB label="NADP 1" checked={f.nadp_n1} onChange={v=>s('nadp_n1',v)}/>
              <CB label="NADP 2" checked={f.nadp_n2} onChange={v=>s('nadp_n2',v)}/>
              <CB label="Proc A" checked={f.nadp_pA} onChange={v=>s('nadp_pA',v)}/>
              <CB label="Proc B" checked={f.nadp_pB} onChange={v=>s('nadp_pB',v)}/>
            </div>
          )}
        </Blk>

        <div style={{marginBottom:12}}>
          <label style={IS.lbl}>Additional remarks (not scored)</label>
          <textarea style={{...IS.inp,minHeight:60,resize:'vertical'}} value={f.free_text} onChange={e=>s('free_text',e.target.value)}/>
        </div>

        <button onClick={handleCalc} style={{width:'100%',background:'#e8a020',border:'none',color:'#000',fontWeight:700,fontSize:13,padding:'12px',borderRadius:5,cursor:'pointer',fontFamily:"'Courier New',monospace",marginBottom:16}}>
          CALCULATE RISK
        </button>

        {result&&(
          <div id="ra-result-box" style={{background:rc.bg,border:'2px solid '+rc.border,borderRadius:8,padding:16,marginBottom:16}}>
            <div style={{fontSize:11,color:rc.text,fontWeight:700,letterSpacing:1,marginBottom:8}}>AERODROME RISK LEVEL</div>
            <div style={{fontSize:32,fontWeight:900,color:rc.text,letterSpacing:2}}>{result.risk}</div>
            <div style={{fontSize:12,color:rc.text,marginTop:4}}>Score: {result.score}</div>
            {precisionCount>0&&<div style={{fontSize:9,color:rc.text,opacity:0.7,marginTop:2}}>Scope proportioning active — {precisionCount} precision RWY</div>}
            <div style={{marginTop:10,fontSize:10,color:'#777',lineHeight:1.8}}>{result.basis.map((b,i)=><div key={i}>- {b}</div>)}</div>
            {result.actions.length>0&&(
              <div style={{marginTop:10,padding:'8px 10px',background:'rgba(0,0,0,0.3)',borderRadius:4}}>
                <div style={{fontSize:10,color:'#2d9e5f',fontWeight:700,marginBottom:6}}>RECOMMENDED ACTIONS</div>
                {result.actions.map((a,i)=><div key={i} style={{fontSize:11,color:'#aaa',marginBottom:4}}>{i+1}. {a}</div>)}
              </div>
            )}
            {(()=>{
              const pps=generatePpsBriefing(f,result,prec,bestRwy,rwyData);
              return(
                <div style={{marginTop:12,padding:'10px 12px',background:'rgba(0,0,0,0.3)',borderRadius:4,borderLeft:'3px solid #1a9bc4'}}>
                  <div style={{fontSize:10,color:'#1a9bc4',fontWeight:700,marginBottom:8,letterSpacing:1}}>PPS BRIEFING PREVIEW</div>
                  {[['SECTION 1',pps.section1],['SECTION 2',pps.section2],['SECTION 3',pps.section3]].map(([title,text])=>(
                    <div key={title} style={{marginBottom:8}}>
                      <div style={{fontSize:9,color:'#1a9bc4',fontWeight:700,marginBottom:4}}>{title}</div>
                      {text.split('\n').map((line,i)=><div key={i} style={{fontSize:10,color:'#888',lineHeight:1.7,paddingLeft:8}}>▸ {line}</div>)}
                    </div>
                  ))}
                </div>
              );
            })()}
            <button onClick={handleSave} disabled={saving} style={{width:'100%',background:'#2d9e5f',border:'none',color:'#fff',fontWeight:700,fontSize:13,padding:'12px',borderRadius:5,cursor:'pointer',fontFamily:"'Courier New',monospace",marginTop:12}}>
              {saving?'SAVING...':'SAVE TO DATABASE (incl. PPS Briefing)'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default RiskSurvey;