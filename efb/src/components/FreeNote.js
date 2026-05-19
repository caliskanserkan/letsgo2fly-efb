import React, { useState, useRef } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';

function FreeNote() {
  const [mode, setMode] = usePersistedState('efb_freenote_mode', 'text');
  const [note, setNote] = usePersistedState('efb_freenote_note', '');
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const canvasRef     = useRef(null);
  const drawing       = useRef(false);
  const canvasHistory = useRef([]);
  const canvasRedo    = useRef([]);

  const handleTextChange = (val) => {
    setRedoStack([]); setHistory(prev => [...prev, note]);
    setNote(val); setSaved(false);
  };
  const undoText  = () => { if(!history.length)return; setRedoStack(p=>[note,...p]); setNote(history[history.length-1]); setHistory(p=>p.slice(0,-1)); setSaved(false); };
  const redoText  = () => { if(!redoStack.length)return; setHistory(p=>[...p,note]); setNote(redoStack[0]); setRedoStack(p=>p.slice(1)); setSaved(false); };
  const clearText = () => { setHistory(p=>[...p,note]); setNote(''); setSaved(false); };

  const getCtx = () => {
    const c=canvasRef.current; if(!c)return null;
    const ctx=c.getContext('2d');
    ctx.strokeStyle='#38bdf8'; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.lineJoin='round';
    return ctx;
  };
  const getPos = (e) => {
    const c=canvasRef.current; if(!c)return null;
    const r=c.getBoundingClientRect(); const sx=c.width/r.width, sy=c.height/r.height;
    const src=e.touches?e.touches[0]:e;
    return {x:(src.clientX-r.left)*sx, y:(src.clientY-r.top)*sy};
  };
  const saveSnapshot = () => { const c=canvasRef.current; if(!c)return; canvasHistory.current.push(c.toDataURL()); canvasRedo.current=[]; };
  const startDraw = (e) => { e.preventDefault(); saveSnapshot(); drawing.current=true; const pos=getPos(e); const ctx=getCtx(); if(ctx&&pos){ctx.beginPath();ctx.moveTo(pos.x,pos.y);} };
  const draw      = (e) => { e.preventDefault(); if(!drawing.current)return; const pos=getPos(e); const ctx=getCtx(); if(ctx&&pos){ctx.lineTo(pos.x,pos.y);ctx.stroke();} };
  const endDraw   = () => { drawing.current=false; };
  const undoCanvas = () => { const c=canvasRef.current; if(!c||!canvasHistory.current.length)return; canvasRedo.current.push(c.toDataURL()); const prev=canvasHistory.current.pop(); const img=new Image(); img.onload=()=>{const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(img,0,0);}; img.src=prev; };
  const redoCanvas = () => { const c=canvasRef.current; if(!c||!canvasRedo.current.length)return; canvasHistory.current.push(c.toDataURL()); const next=canvasRedo.current.pop(); const img=new Image(); img.onload=()=>{const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(img,0,0);}; img.src=next; };
  const clearCanvas = () => { const c=canvasRef.current; if(!c)return; saveSnapshot(); c.getContext('2d').clearRect(0,0,c.width,c.height); };
  const handleSave = () => { setSaved(true); setTimeout(()=>setSaved(false),2000); };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#0f172a', padding:12, gap:10 }}>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:6, alignItems:'center', background:'#1e293b', borderRadius:12, padding:'8px 12px', border:'1px solid #334155', flexWrap:'wrap' }}>
        {/* Mode */}
        <div style={{ display:'flex', gap:4, background:'#0f172a', borderRadius:8, padding:3 }}>
          {[{id:'text',label:'⌨️ Text'},{id:'draw',label:'✏️ Draw'}].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{ background:mode===m.id?'#1e293b':'transparent', border:mode===m.id?'1px solid #334155':'1px solid transparent', borderRadius:6, padding:'5px 12px', fontSize:11, fontWeight:600, color:mode===m.id?'#38bdf8':'#475569', cursor:'pointer', fontFamily:'inherit' }}>
              {m.label}
            </button>
          ))}
        </div>

        <div style={{ width:1, height:20, background:'#334155', flexShrink:0 }} />

        <button onClick={mode==='text'?undoText:undoCanvas}
          style={{ background:'transparent', border:'1px solid #334155', borderRadius:6, padding:'5px 10px', fontSize:11, color:'#94a3b8', cursor:'pointer', fontFamily:'inherit' }}>
          ↩
        </button>
        <button onClick={mode==='text'?redoText:redoCanvas}
          style={{ background:'transparent', border:'1px solid #334155', borderRadius:6, padding:'5px 10px', fontSize:11, color:'#94a3b8', cursor:'pointer', fontFamily:'inherit' }}>
          ↪
        </button>

        <div style={{ width:1, height:20, background:'#334155', flexShrink:0 }} />

        <button onClick={mode==='text'?clearText:clearCanvas}
          style={{ background:'transparent', border:'1px solid rgba(239,68,68,0.3)', borderRadius:6, padding:'5px 10px', fontSize:11, color:'#ef4444', cursor:'pointer', fontFamily:'inherit' }}>
          ✕ Clear
        </button>

        <div style={{ flex:1 }} />

        <button onClick={handleSave}
          style={{ background:saved?'#4ade80':'#38bdf8', border:'none', borderRadius:8, padding:'6px 16px', fontSize:12, fontWeight:600, color:saved?'#0f172a':'#0f172a', cursor:'pointer', fontFamily:'inherit', transition:'background 0.2s' }}>
          {saved ? '✓ Saved' : '💾 Save'}
        </button>
      </div>

      {/* Text mode */}
      {mode === 'text' && (
        <textarea value={note} onChange={e => handleTextChange(e.target.value)}
          placeholder="Type your notes here..."
          style={{ flex:1, background:'#1e293b', border:'1px solid #334155', borderRadius:14, padding:'16px', fontSize:14, color:'#f1f5f9', fontFamily:'inherit', outline:'none', resize:'none', lineHeight:1.8 }}
        />
      )}

      {/* Draw mode */}
      {mode === 'draw' && (
        <div style={{ flex:1, background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden', position:'relative' }}>
          <canvas ref={canvasRef} width={700} height={600}
            style={{ display:'block', width:'100%', height:'100%', cursor:'crosshair', touchAction:'none', background:'#0f172a' }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
          />
          <div style={{ position:'absolute', bottom:12, left:0, right:0, textAlign:'center', fontSize:11, color:'#334155', pointerEvents:'none' }}>
            ✏️ Draw with finger or Apple Pencil
          </div>
        </div>
      )}
    </div>
  );
}

export default FreeNote;