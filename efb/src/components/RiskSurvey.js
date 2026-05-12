import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

function calcRisk(s) {
  let score = 0, overrideHigh = false, overrideMedium = false;
  let overrideReasons = [], drivers = [], actions = [];
  const add = (pts, d, a) => { score += pts; if(d) drivers.push(d); if(a) actions.push(a); };
  if(s.cat==='C'){overrideHigh=true;overrideReasons.push('CAT C aerodrome (auto override)');}
  if(s.pol_risk==='high'){overrideHigh=true;overrideReasons.push('High security / political threat');}
  if(!s.prec&&s.angle==='steep'&&s.oei_sid){overrideHigh=true;overrideReasons.push('No precision + steep + special OEI SID');}
  if(s.sp_approval){overrideMedium=true;overrideReasons.push('Special operator approval required');}
  if(s.lvp==='frequent'&&s.alt==='no'){overrideMedium=true;overrideReasons.push('Frequent LVP + no adequate alternate');}
  if(s.sp_desig) add(2,'Special aerodrome designation applies','Verify operator-specific procedures');
  if(s.sp_crew)  add(2,'Special crew qualification required','Verify crew holds required qualification');
  if(s.sp_approval) add(2,'Special operator approval required','Obtain and file approval documentation');
  if(!s.prec) add(2,'No precision approach available','Confirm crew currency on non-precision approach');
  if(s.angle==='slight') add(1,'Slightly elevated approach angle (3.0-3.49 deg)');
  else if(s.angle==='moderate_low') add(2,'Non-standard approach angle (3.5-3.89 deg)','Brief non-standard glide path technique');
  else if(s.angle==='moderate') add(2,'Elevated approach angle (3.9-4.49 deg)');
  else if(s.angle==='steep') add(3,'Steep approach angle (>=4.5 deg)','Brief steep approach technique; verify certification');
  if(s.high_da) add(1,'Terrain-limited precision minima DA/DH >= 400 ft');
  if(s.gnss_risk==='active') add(4,'ACTIVE GNSS JAMMING/SPOOFING','Do NOT rely on GNSS; revert to raw data');
  else if(s.gnss_risk==='notam') add(2,'GNSS reliability concern (NOTAM)','Cross-check raw data');
  if(s.offset) add(1,'Offset localizer / offset approach in use');
  if(s.madem)  add(2,'Demanding missed approach / climb gradient','Brief missed approach in detail');
  if(s.oei_ma_brief) add(2,'Engine-out go-around requires dedicated briefing');
  if(s.rwy_w==='narrow') add(3,'Narrow runway (< 30 m)','Confirm crosswind limits for narrow strip');
  else if(s.rwy_w==='medium') add(1,'Reduced runway width (30-44 m)');
  if(s.rwy_marg)  add(2,'Marginal runway length','Compute performance with actual conditions');
  if(s.phys_comp) add(2,'Physical runway complexity');
  if(s.oei_sid)  add(3,'Special OEI SID required','Complete OEI SID analysis; brief engine failure procedure');
  if(s.oei_grad) add(2,'Demanding OEI climb gradient','Review obstacle clearance margins');
  if(s.perf_lim) add(1,'Performance-limited departure likely','Review WAT/CLG limits');
  if(s.lvp==='sometimes') add(1,'Occasional LVP / low ceiling conditions');
  if(s.lvp==='frequent')  add(2,'Frequent LVP / fog / low visibility','Monitor forecast; verify LVP procedures');
  if(s.xw_risk) add(2,'Crosswind / windshear / contamination','Review crosswind limits; brief windshear escape');
  const msa = parseInt(s.msa_ft)||0;
  if(msa>=12000) add(3,'High terrain MSA '+msa+' ft','Review terrain escape; enhanced GPWS/TAWS awareness');
  else if(msa>=8000) add(2,'Elevated terrain MSA '+msa+' ft','Verify terrain awareness; confirm missed approach clearance');
  else if(msa>=5000) add(1,'Moderate terrain MSA '+msa+' ft');
  if(msa>=8000&&!s.prec) add(1,'High MSA + non-precision approach','Increase terrain-focused briefing depth');
  if(msa>=8000&&(s.angle==='moderate'||s.angle==='steep')) add(1,'High MSA + elevated/steep approach');
  if(s.terr_hh) add(2,'Significant terrain / mountain wave / hot-high','Review terrain awareness; compute hot/high performance');
  if(s.atc==='moderate') add(1,'Moderate ATC / taxi complexity');
  if(s.atc==='significant') add(2,'Significant ATC / sequencing complexity','Allow extra time margins; pre-brief complex taxi');
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
  if(!s.crew_rec) add(1,'No recent crew experience (< 12 months)','Brief aerodrome-specific material; consider refresher');
  if(s.curfew) { const t=s.curfew_open&&s.curfew_close?' ('+s.curfew_open+'-'+s.curfew_close+' UTC)':''; add(1,'Curfew in effect'+t,'Plan within curfew window'); }
  if(s.nadp) { const t=s.nadp_types&&s.nadp_types.length?' - '+s.nadp_types.join(', '):''; add(1,'NADP required'+t,'Brief NADP; ensure crew familiar with thrust reduction'); }
  const uniqueDrivers=[...new Set(drivers.filter(Boolean))];
  const uniqueActions=[...new Set(actions.filter(Boolean))];
  let risk,basis;
  if(overrideHigh){risk='HIGH';basis=overrideReasons;}
  else if(score>=10){risk='HIGH';basis=['Weighted risk score: '+score+' (threshold >= 10)',...overrideReasons];}
  else if(overrideMedium||score>=5){risk='MEDIUM';basis=overrideMedium?[...overrideReasons,...(score?['Score: '+score]:[])]:[`Weighted risk score: ${score} (threshold >= 5)`];}
  else{risk='LOW';basis=['Weighted risk score: '+score+' (threshold < 5)'];}
  return {risk,score,basis,drivers:uniqueDrivers,actions:uniqueActions};
}

const IS = {
  sel:{width:'100%',background:'#1a1a1a',border:'1px solid #383838',color:'#e8e8e8',fontSize:12,padding:'8px 10px',borderRadius:4,fontFamily:"'Courier New',monospace"},
  inp:{width:'100%',background:'#1a1a1a',border:'1px solid #383838',color:'#e8e8e8',fontSize:12,padding:'8px 10px',borderRadius:4,fontFamily:"'Courier New',monospace",boxSizing:'border-box'},
  lbl:{fontSize:10,color:'#777',marginBottom:5,textTransform:'uppercase',letterSpacing:.8,display:'block'},
  r2:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12},
  r3:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12},
  blk:{marginBottom:12,background:'#161616',border:'1px solid #2a2a2a',borderRadius:6,overflow:'hidden'},
  bh:{padding:'10px 14px',background:'#1e1e1e',borderBottom:'1px solid #2a2a2a',fontSize:11,fontWeight:700,color:'#1a9bc4',letterSpacing:1,textTransform:'uppercase',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'},
  bb:{padding:'12px 14px'},
};

function CB({label,checked,onChange}){
  return(
    <div onClick={()=>onChange(!checked)} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',cursor:'pointer',fontSize:12,color:'#aaa'}}>
      <div style={{width:16,height:16,border:'2px solid '+(checked?'#1a9bc4':'#444'),background:checked?'#1a9bc4':'transparent',borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        {checked&&<span style={{color:'#fff',fontSize:10}}>v</span>}
      </div>
      {label}
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

export function RiskSurvey({icao,airportName,airportCat,onClose,onSaved}){
  const [open,setOpen]=useState({1:true,2:true,3:false,4:false,5:false,6:false,7:false,8:false,9:false,10:false});
  const [saving,setSaving]=useState(false);
  const [result,setResult]=useState(null);
  const APR=['--','CAT III','CAT II','ILS','GNSS','RNP AR','RNP','Non-Precision','Circling'];
  const APPR_RANK={'CAT III':7,'CAT II':6,'ILS':5,'RNP AR':4,'GNSS':3,'RNP':2,'Non-Precision':1,'Circling':0,'--':0};
  const [f,setF]=useState({assessed_by:'',cat:airportCat||'B',sp_desig:false,sp_crew:false,sp_approval:false,rwy_data:Array(8).fill(null).map(()=>({des:'',apr:'--'})),angle:'normal',high_da:false,offset:false,madem:false,oei_ma_brief:false,rwy_w:'wide',rwy_marg:false,phys_comp:false,oei_sid:false,oei_grad:false,perf_lim:false,lvp:'no',xw_risk:false,terr_hh:false,msa_ft:0,msa_sector:'All sectors',atc:'no',mil_traff:false,gnss_risk:'no',pol_risk:'no',arpt_sec:'good',st_oversight:'yes',alt:'yes',fuel:'reliable',crew_rec:true,curfew:false,curfew_open:'',curfew_close:'',nadp:false,nadp_n1:false,nadp_n2:false,nadp_pA:false,nadp_pB:false,free_text:''});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const tog=(n)=>setOpen(p=>({...p,[n]:!p[n]}));
  const rwyData=f.rwy_data.filter(r=>r.des.trim());
  const bestRwy=rwyData.reduce((b,r)=>(!b||APPR_RANK[r.apr]>APPR_RANK[b.apr])?r:b,null);
  const prec=bestRwy&&APPR_RANK[bestRwy.apr]>=3;

  const handleCalc=()=>{
    const nadp_types=[f.nadp_n1?'NADP 1':null,f.nadp_n2?'NADP 2':null,f.nadp_pA?'Proc A':null,f.nadp_pB?'Proc B':null].filter(Boolean);
    setResult(calcRisk({...f,prec,rwy_data:rwyData,nadp_types}));
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
    console.log('Saving to:', icao);
    const{error,data}=await supabase.from('airport_risks').upsert({
      icao:icao.toUpperCase(),
      category:f.cat,base_score:result.score,ra_risk_level:result.risk,ra_risk_score:result.score,
      ra_risk_basis:JSON.stringify(result.basis),ra_key_drivers:JSON.stringify(result.drivers),
      ra_actions:JSON.stringify(result.actions),ra_briefing_items:JSON.stringify(summary),
      ra_assessment_date:today,ra_reassessment_due:due,ra_assessed_by:f.assessed_by||'Admin',
      ra_ops_approval:ops,updated_at:new Date().toISOString(),
    },{onConflict:'icao'});
    setSaving(false);
    console.log('Save result:', error, data);
    if(error){alert('Save error: '+error.message);}
    else{
      // Verify update worked
      const check = await supabase.from('airport_risks').select('risk_level,updated_at').eq('icao',icao.toUpperCase()).single();
      console.log('After save:', check.data);
      alert('Saved! Risk: '+result.risk);
      onSaved&&onSaved();onClose();
    }
  };

  const rc=result?RC[result.risk]||RC.LOW:null;

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
          <div style={IS.r2}><CB label="Special aerodrome designation applies?" checked={f.sp_desig} onChange={v=>s('sp_desig',v)}/><CB label="Special crew qualification required?" checked={f.sp_crew} onChange={v=>s('sp_crew',v)}/></div>
          <CB label="Special operator approval required for this destination?" checked={f.sp_approval} onChange={v=>s('sp_approval',v)}/>
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
          {bestRwy&&<div style={{fontSize:10,color:'#2d9e5f',marginBottom:8}}>Best: {bestRwy.apr} - RWY {bestRwy.des} {prec?'(PRECISION)':'(non-precision)'}</div>}
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Best available approach angle?</label>
            <select style={IS.sel} value={f.angle} onChange={e=>s('angle',e.target.value)}>
              <option value="normal">Normal (3.0 deg)</option>
              <option value="slight">Slightly elevated (3.0-3.49 deg)</option>
              <option value="moderate_low">Non-standard (3.5-3.89 deg)</option>
              <option value="moderate">Elevated (3.9-4.49 deg)</option>
              <option value="steep">Steep (4.5 deg) - override risk</option>
            </select>
          </div>
          <CB label="Precision DA/DH >= 400 ft due to terrain-limited minima?" checked={f.high_da} onChange={v=>s('high_da',v)}/>
          <div style={IS.r2}>
            <CB label="Offset localizer / offset approach in use?" checked={f.offset} onChange={v=>s('offset',v)}/>
            <CB label="Missed approach / climb gradient above standard?" checked={f.madem} onChange={v=>s('madem',v)}/>
          </div>
          <CB label="Engine-out go-around requires dedicated crew briefing?" checked={f.oei_ma_brief} onChange={v=>s('oei_ma_brief',v)}/>
        </Blk>

        <Blk title="Block 3 - Runway & Physical" open={open[3]} onToggle={()=>tog(3)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Runway width?</label>
            <select style={IS.sel} value={f.rwy_w} onChange={e=>s('rwy_w',e.target.value)}>
              <option value="wide">45 m or more</option><option value="medium">30-44 m</option><option value="narrow">Less than 30 m</option>
            </select>
          </div>
          <div style={IS.r2}>
            <CB label="Runway length marginal for planned operation?" checked={f.rwy_marg} onChange={v=>s('rwy_marg',v)}/>
            <CB label="Physical complexity? (slope / displaced threshold / offset LOC)" checked={f.phys_comp} onChange={v=>s('phys_comp',v)}/>
          </div>
        </Blk>

        <Blk title="Block 4 - Departure & OEI" open={open[4]} onToggle={()=>tog(4)}>
          <div style={IS.r3}>
            <CB label="Special OEI SID required?" checked={f.oei_sid} onChange={v=>s('oei_sid',v)}/>
            <CB label="OEI gradient demanding?" checked={f.oei_grad} onChange={v=>s('oei_grad',v)}/>
            <CB label="Performance-limited departure?" checked={f.perf_lim} onChange={v=>s('perf_lim',v)}/>
          </div>
        </Blk>

        <Blk title="Block 5 - Weather & Environment" open={open[5]} onToggle={()=>tog(5)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Frequency of LVP / fog / low ceiling?</label>
            <select style={IS.sel} value={f.lvp} onChange={e=>s('lvp',e.target.value)}>
              <option value="no">Rarely / not significant</option><option value="sometimes">Occasional</option><option value="frequent">Frequent</option>
            </select>
          </div>
          <div style={IS.r2}>
            <CB label="Crosswind / windshear / contamination risk significant?" checked={f.xw_risk} onChange={v=>s('xw_risk',v)}/>
            <CB label="Significant terrain / mountain wave / hot-high?" checked={f.terr_hh} onChange={v=>s('terr_hh',v)}/>
          </div>
          <div style={{...IS.r2,marginTop:10}}>
            <div><label style={IS.lbl}>Maximum Sector Altitude / MSA (ft)</label>
              <input style={IS.inp} type="number" min={0} max={25000} step={100} value={f.msa_ft} onChange={e=>s('msa_ft',parseInt(e.target.value)||0)}/></div>
            <div><label style={IS.lbl}>MSA sector</label>
              <select style={IS.sel} value={f.msa_sector} onChange={e=>s('msa_sector',e.target.value)}>
                <option>All sectors</option><option>Specific sector (worst case)</option><option>Enroute MEA/MORA</option>
              </select></div>
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
              <option value="no">No known risk</option><option value="notam">NOTAM'd / interference expected</option><option value="active">Active jamming / spoofing reported</option>
            </select>
          </div>
        </Blk>

        <Blk title="Block 7 - Security, State & Oversight" open={open[7]} onToggle={()=>tog(7)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Political / security risk?</label>
            <select style={IS.sel} value={f.pol_risk} onChange={e=>s('pol_risk',e.target.value)}>
              <option value="no">No significant concern</option><option value="caution">Caution advisories in effect</option><option value="high">High risk - AUTO OVERRIDE HIGH</option>
            </select>
          </div>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Airport security / handling standards?</label>
            <select style={IS.sel} value={f.arpt_sec} onChange={e=>s('arpt_sec',e.target.value)}>
              <option value="good">Adequate / reliable</option><option value="uncertain">Uncertain / inconsistent</option><option value="poor">Poor / inadequate</option>
            </select>
          </div>
          <div>
            <label style={IS.lbl}>State safety oversight / ICAO USOAP compliance?</label>
            <select style={IS.sel} value={f.st_oversight} onChange={e=>s('st_oversight',e.target.value)}>
              <option value="yes">Acceptable (EASA or equivalent)</option><option value="partial">Partial - concerns noted</option><option value="no">No / inadequate / unrecognised</option>
            </select>
          </div>
        </Blk>

        <Blk title="Block 8 - Alternate, Fuel & Crew" open={open[8]} onToggle={()=>tog(8)}>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Adequate alternate within fuel planning range?</label>
            <select style={IS.sel} value={f.alt} onChange={e=>s('alt',e.target.value)}>
              <option value="yes">Yes - available and suitable</option><option value="limited">Limited options</option><option value="no">No adequate alternate</option>
            </select>
          </div>
          <div style={{marginBottom:10}}>
            <label style={IS.lbl}>Fuel quality and ground handling reliability?</label>
            <select style={IS.sel} value={f.fuel} onChange={e=>s('fuel',e.target.value)}>
              <option value="reliable">Reliable and verified</option><option value="uncertain">Uncertain / variable</option><option value="poor">Poor / known concerns</option>
            </select>
          </div>
          <div>
            <label style={IS.lbl}>Crew has operated at this aerodrome within the last 12 months?</label>
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
            <label style={IS.lbl}>Is there a curfew at this aerodrome?</label>
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
              <div><label style={IS.lbl}>Opening time (UTC)</label><input style={IS.inp} placeholder="0600" maxLength={4} value={f.curfew_open} onChange={e=>s('curfew_open',e.target.value)}/></div>
              <div><label style={IS.lbl}>Closing time (UTC)</label><input style={IS.inp} placeholder="2300" maxLength={4} value={f.curfew_close} onChange={e=>s('curfew_close',e.target.value)}/></div>
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
            <div style={{marginTop:10,fontSize:10,color:'#777',lineHeight:1.8}}>{result.basis.map((b,i)=><div key={i}>- {b}</div>)}</div>
            {result.actions.length>0&&(
              <div style={{marginTop:10,padding:'8px 10px',background:'rgba(0,0,0,0.3)',borderRadius:4}}>
                <div style={{fontSize:10,color:'#2d9e5f',fontWeight:700,marginBottom:6}}>RECOMMENDED ACTIONS</div>
                {result.actions.map((a,i)=><div key={i} style={{fontSize:11,color:'#aaa',marginBottom:4}}>{i+1}. {a}</div>)}
              </div>
            )}
            <button onClick={handleSave} disabled={saving} style={{width:'100%',background:'#2d9e5f',border:'none',color:'#fff',fontWeight:700,fontSize:13,padding:'12px',borderRadius:5,cursor:'pointer',fontFamily:"'Courier New',monospace",marginTop:12}}>
              {saving?'SAVING...':'SAVE TO DATABASE'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default RiskSurvey;
