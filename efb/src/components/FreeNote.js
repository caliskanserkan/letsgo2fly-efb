import React, { useState, useRef } from 'react';

function FreeNote() {
  const [mode, setMode] = useState('text'); // 'text' | 'draw'
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Canvas refs
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const lastPos   = useRef(null);
  const canvasHistory = useRef([]); // snapshots for undo
  const canvasRedo    = useRef([]);

  // ── TEXT MODE ────────────────────────────────────
  const handleTextChange = (val) => {
    setRedoStack([]);
    setHistory(prev => [...prev, note]);
    setNote(val);
    setSaved(false);
  };

  const undoText = () => {
    if (history.length === 0) return;
    setRedoStack(prev => [note, ...prev]);
    setNote(history[history.length - 1]);
    setHistory(prev => prev.slice(0, -1));
    setSaved(false);
  };

  const redoText = () => {
    if (redoStack.length === 0) return;
    setHistory(prev => [...prev, note]);
    setNote(redoStack[0]);
    setRedoStack(prev => prev.slice(1));
    setSaved(false);
  };

  const clearText = () => {
    setHistory(prev => [...prev, note]);
    setNote('');
    setSaved(false);
  };

  // ── CANVAS MODE ──────────────────────────────────
  const getCtx = () => {
    const c = canvasRef.current;
    if (!c) return null;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#1a9bc4';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  };

  const getPos = (e) => {
    const c = canvasRef.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width;
    const sy = c.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * sx, y: (src.clientY - r.top) * sy };
  };

  const saveSnapshot = () => {
    const c = canvasRef.current;
    if (!c) return;
    canvasHistory.current.push(c.toDataURL());
    canvasRedo.current = [];
  };

  const startDraw = (e) => {
    e.preventDefault();
    saveSnapshot();
    drawing.current = true;
    const pos = getPos(e);
    lastPos.current = pos;
    const ctx = getCtx();
    if (ctx && pos) { ctx.beginPath(); ctx.moveTo(pos.x, pos.y); }
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const pos = getPos(e);
    const ctx = getCtx();
    if (ctx && pos) { ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
    lastPos.current = pos;
  };

  const endDraw = () => { drawing.current = false; };

  const undoCanvas = () => {
    const c = canvasRef.current;
    if (!c || canvasHistory.current.length === 0) return;
    canvasRedo.current.push(c.toDataURL());
    const prev = canvasHistory.current.pop();
    const img = new Image();
    img.onload = () => {
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = prev;
  };

  const redoCanvas = () => {
    const c = canvasRef.current;
    if (!c || canvasRedo.current.length === 0) return;
    canvasHistory.current.push(c.toDataURL());
    const next = canvasRedo.current.pop();
    const img = new Image();
    img.onload = () => {
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = next;
  };

  const clearCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    saveSnapshot();
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const btnStyle = (active) => ({
    background: active ? 'rgba(26,155,196,0.15)' : '#2a2a2a',
    border: `1px solid ${active ? '#1a9bc4' : '#383838'}`,
    borderRadius: 6, padding: '6px 14px', fontSize: 11,
    fontWeight: 600, color: active ? '#1a9bc4' : '#666',
    cursor: 'pointer', fontFamily: 'inherit',
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', padding:16, gap:10 }}>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        {/* Mode toggle */}
        <button style={btnStyle(mode === 'text')} onClick={() => setMode('text')}>⌨ Keyboard</button>
        <button style={btnStyle(mode === 'draw')} onClick={() => setMode('draw')}>✏ Pen</button>

        <div style={{ width:1, height:24, background:'#333', margin:'0 4px' }} />

        {/* Undo / Redo */}
        <button
          disabled={mode === 'text' ? history.length === 0 : canvasHistory.current.length === 0}
          onClick={mode === 'text' ? undoText : undoCanvas}
          style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:6, padding:'6px 10px', fontSize:12, color: (mode === 'text' ? history.length === 0 : false) ? '#333' : '#777', cursor:'pointer', fontFamily:'inherit' }}>
          ↩ Undo
        </button>
        <button
          disabled={mode === 'text' ? redoStack.length === 0 : canvasRedo.current.length === 0}
          onClick={mode === 'text' ? redoText : redoCanvas}
          style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:6, padding:'6px 10px', fontSize:12, color: (mode === 'text' ? redoStack.length === 0 : false) ? '#333' : '#777', cursor:'pointer', fontFamily:'inherit' }}>
          ↪ Redo
        </button>

        <div style={{ width:1, height:24, background:'#333', margin:'0 4px' }} />

        <button onClick={mode === 'text' ? clearText : clearCanvas}
          style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:6, padding:'6px 10px', fontSize:12, color:'#e02020', cursor:'pointer', fontFamily:'inherit' }}>
          ✕ Clear
        </button>

        <div style={{ flex:1 }} />

        <button onClick={handleSave}
          style={{ background: saved ? '#2d9e5f' : '#1a9bc4', border:'none', borderRadius:6, padding:'6px 14px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
          {saved ? '✓ Saved' : '💾 Save'}
        </button>
      </div>

      {/* Text area */}
      {mode === 'text' && (
        <textarea
          value={note}
          onChange={e => handleTextChange(e.target.value)}
          placeholder="Type your notes here..."
          style={{
            flex:1, background:'#1a1a1a', border:'1.5px solid #2e2e2e',
            borderRadius:8, padding:'12px 14px', fontSize:13, color:'#ccc',
            fontFamily:'inherit', outline:'none', resize:'none', lineHeight:1.7,
          }}
        />
      )}

      {/* Draw canvas */}
      {mode === 'draw' && (
        <div style={{ flex:1, background:'#1a1a1a', borderRadius:8, border:'1.5px solid #2e2e2e', overflow:'hidden', position:'relative' }}>
          <canvas
            ref={canvasRef}
            width={700}
            height={600}
            style={{ display:'block', width:'100%', height:'100%', cursor:'crosshair', touchAction:'none' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          <div style={{ position:'absolute', bottom:10, left:0, right:0, textAlign:'center', fontSize:11, color:'#333', pointerEvents:'none' }}>
            ✏ Draw with mouse or Apple Pencil
          </div>
        </div>
      )}
    </div>
  );
}

export default FreeNote;