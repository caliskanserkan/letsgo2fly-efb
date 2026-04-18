// AdminPanel.js — GO2 eFB Admin Panel
// Path: /workspaces/letsgo2fly-efb/efb/src/components/AdminPanel.js

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root: {
    minHeight: "100vh",
    background: "#0a0c10",
    color: "#c8cdd8",
    fontFamily: "'Courier New', Courier, monospace",
  },
  topBar: {
    background: "#0d1117",
    borderBottom: "1px solid #1e2530",
    padding: "12px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontSize: "13px",
    color: "#e8a020",
    letterSpacing: "2px",
    fontWeight: "bold",
  },
  logoBadge: {
    background: "#e8a020",
    color: "#0a0c10",
    padding: "2px 8px",
    fontSize: "10px",
    fontWeight: "bold",
    letterSpacing: "3px",
  },
  adminTag: {
    background: "#1a0a00",
    border: "1px solid #e8a020",
    color: "#e8a020",
    padding: "3px 10px",
    fontSize: "10px",
    letterSpacing: "2px",
  },
  backBtn: {
    background: "none",
    border: "1px solid #2a3040",
    color: "#7a8494",
    padding: "6px 14px",
    cursor: "pointer",
    fontSize: "11px",
    letterSpacing: "1px",
    fontFamily: "inherit",
  },
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "24px 20px",
  },
  tabRow: {
    display: "flex",
    marginBottom: "28px",
    borderBottom: "1px solid #1e2530",
  },
  tab: (active) => ({
    padding: "10px 20px",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid #e8a020" : "2px solid transparent",
    color: active ? "#e8a020" : "#5a6474",
    cursor: "pointer",
    fontSize: "11px",
    letterSpacing: "2px",
    fontFamily: "inherit",
    fontWeight: active ? "bold" : "normal",
    marginBottom: "-1px",
  }),
  card: {
    background: "#0d1117",
    border: "1px solid #1e2530",
    padding: "20px",
    marginBottom: "16px",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
    paddingBottom: "10px",
    borderBottom: "1px solid #1a2030",
  },
  cardTitle: {
    fontSize: "11px",
    color: "#e8a020",
    letterSpacing: "3px",
    fontWeight: "bold",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "12px" },
  th: {
    textAlign: "left",
    padding: "8px 10px",
    color: "#4a5464",
    fontSize: "10px",
    letterSpacing: "2px",
    borderBottom: "1px solid #1a2030",
    fontWeight: "normal",
  },
  td: {
    padding: "10px 10px",
    borderBottom: "1px solid #111820",
    verticalAlign: "middle",
  },
  badge: (color) => ({
    display: "inline-block",
    padding: "2px 8px",
    fontSize: "9px",
    letterSpacing: "1px",
    background: color === "green" ? "#0a1a10" : color === "amber" ? "#1a1000" : "#141820",
    color: color === "green" ? "#30c060" : color === "amber" ? "#e8a020" : "#4a5464",
    border: `1px solid ${color === "green" ? "#1a4030" : color === "amber" ? "#4a3010" : "#2a3040"}`,
  }),
  input: {
    width: "100%",
    background: "#080c12",
    border: "1px solid #1e2530",
    color: "#c8cdd8",
    padding: "8px 12px",
    fontSize: "12px",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    background: "#080c12",
    border: "1px solid #1e2530",
    color: "#c8cdd8",
    padding: "8px 12px",
    fontSize: "12px",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
    appearance: "none",
  },
  label: {
    display: "block",
    fontSize: "10px",
    color: "#4a5464",
    letterSpacing: "2px",
    marginBottom: "6px",
  },
  formGroup: { marginBottom: "14px" },
  btnPrimary: {
    background: "#e8a020",
    color: "#0a0c10",
    border: "none",
    padding: "9px 20px",
    fontSize: "11px",
    fontFamily: "inherit",
    fontWeight: "bold",
    letterSpacing: "2px",
    cursor: "pointer",
  },
  btnDanger: {
    background: "none",
    color: "#c04040",
    border: "1px solid #3a1010",
    padding: "5px 12px",
    fontSize: "10px",
    fontFamily: "inherit",
    cursor: "pointer",
    letterSpacing: "1px",
  },
  btnSecondary: {
    background: "none",
    color: "#7a8494",
    border: "1px solid #2a3040",
    padding: "5px 12px",
    fontSize: "10px",
    fontFamily: "inherit",
    cursor: "pointer",
    letterSpacing: "1px",
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  toast: (type) => ({
    position: "fixed",
    bottom: "24px",
    right: "24px",
    background: type === "error" ? "#1a0808" : "#081a10",
    border: `1px solid ${type === "error" ? "#602020" : "#206040"}`,
    color: type === "error" ? "#f06060" : "#40d080",
    padding: "12px 20px",
    fontSize: "12px",
    fontFamily: "inherit",
    zIndex: 1000,
    letterSpacing: "1px",
  }),
  modal: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
  },
  modalBox: {
    background: "#0d1117",
    border: "1px solid #2a3040",
    padding: "28px",
    minWidth: "380px",
    maxWidth: "480px",
    width: "90%",
  },
  empty: {
    textAlign: "center",
    padding: "40px 20px",
    color: "#3a4454",
    fontSize: "11px",
    letterSpacing: "2px",
  },
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  if (!msg) return null;
  return <div style={S.toast(type)}>{type === "error" ? "⚠ " : "✓ "}{msg}</div>;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, children, onClose }) {
  return (
    <div style={S.modal} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modalBox}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", paddingBottom: "10px", borderBottom: "1px solid #1a2030" }}>
          <span style={{ fontSize: "11px", color: "#e8a020", letterSpacing: "3px", fontWeight: "bold" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4a5464", cursor: "pointer", fontSize: "16px", fontFamily: "inherit" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── TAB 1: User Management ───────────────────────────────────────────────────
function UserManagement({ toast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showPw, setShowPw] = useState(null);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", code: "", role: "pilot" });
  const [newPw, setNewPw] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch {
      setUsers([
        { id: "1", email: "ahmet.akpinar@go2fly.com", full_name: "Capt. Ahmet Akpinar", code: "AAK", role: "pilot", created_at: new Date().toISOString() },
        { id: "2", email: "selcuk.ekinci@go2fly.com", full_name: "Capt. Selcuk Ekinci", code: "SEL", role: "pilot", created_at: new Date().toISOString() },
        { id: "3", email: "serkan.caliskan@go2fly.com", full_name: "Capt. Serkan Caliskan", code: "SCL", role: "admin", created_at: new Date().toISOString() },
      ]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAdd = async () => {
    if (!form.email || !form.password || !form.full_name) {
      toast("All required fields must be filled.", "error"); return;
    }
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name, code: form.code, role: form.role } },
      });
      if (error) throw error;
      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id, email: form.email,
          full_name: form.full_name, code: form.code, role: form.role,
        });
      }
      toast("User created. Awaiting email confirmation.", "success");
      setShowAdd(false);
      setForm({ email: "", password: "", full_name: "", code: "", role: "pilot" });
      fetchUsers();
    } catch (e) { toast(e.message, "error"); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      await supabase.from("profiles").delete().eq("id", id);
      toast("User deleted.", "success");
      fetchUsers();
    } catch (e) { toast(e.message, "error"); }
  };

  const handleChangePw = async () => {
    if (!newPw || newPw.length < 6) { toast("Password must be at least 6 characters.", "error"); return; }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      toast("Password updated.", "success");
      setShowPw(null); setNewPw("");
    } catch (e) { toast(e.message, "error"); }
  };

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>USER LIST</span>
          <button style={S.btnPrimary} onClick={() => setShowAdd(true)}>+ ADD PILOT</button>
        </div>
        {loading ? <div style={S.empty}>LOADING...</div> : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>CODE</th>
                <th style={S.th}>FULL NAME</th>
                <th style={S.th}>EMAIL</th>
                <th style={S.th}>ROLE</th>
                <th style={S.th}>CREATED</th>
                <th style={S.th}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={S.td}><span style={{ color: "#e8a020", fontWeight: "bold", fontSize: "13px" }}>{u.code || "—"}</span></td>
                  <td style={S.td}>{u.full_name}</td>
                  <td style={{ ...S.td, color: "#7a8494" }}>{u.email}</td>
                  <td style={S.td}><span style={S.badge(u.role === "admin" ? "amber" : "green")}>{u.role?.toUpperCase()}</span></td>
                  <td style={{ ...S.td, color: "#4a5464", fontSize: "10px" }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("en-GB") : "—"}
                  </td>
                  <td style={S.td}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button style={S.btnSecondary} onClick={() => { setShowPw(u); setNewPw(""); }}>PASSWORD</button>
                      <button style={S.btnDanger} onClick={() => handleDelete(u.id, u.full_name)}>DELETE</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal title="ADD NEW USER" onClose={() => setShowAdd(false)}>
          <div style={S.formGroup}>
            <label style={S.label}>FULL NAME *</label>
            <input style={S.input} placeholder="Capt. First Last" value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div style={{ ...S.grid2, marginBottom: "14px" }}>
            <div>
              <label style={S.label}>PILOT CODE</label>
              <input style={S.input} placeholder="AAK" maxLength={5} value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label style={S.label}>ROLE</label>
              <select style={S.select} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="pilot">PILOT</option>
                <option value="admin">ADMIN</option>
              </select>
            </div>
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>EMAIL *</label>
            <input style={S.input} type="email" placeholder="pilot@go2fly.com" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>PASSWORD *</label>
            <input style={S.input} type="password" placeholder="Min. 6 characters" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
            <button style={S.btnSecondary} onClick={() => setShowAdd(false)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleAdd}>CREATE</button>
          </div>
        </Modal>
      )}

      {showPw && (
        <Modal title="CHANGE PASSWORD" onClose={() => setShowPw(null)}>
          <div style={{ color: "#7a8494", fontSize: "11px", marginBottom: "16px" }}>
            {showPw.full_name} — {showPw.email}
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>NEW PASSWORD</label>
            <input style={S.input} type="password" placeholder="Min. 6 characters" value={newPw}
              onChange={(e) => setNewPw(e.target.value)} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
            <button style={S.btnSecondary} onClick={() => setShowPw(null)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleChangePw}>UPDATE</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── TAB 2: OFP Management ────────────────────────────────────────────────────
function OFPManagement({ toast }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignModal, setAssignModal] = useState(null);
  const [assignForm, setAssignForm] = useState({ pic: "", fo: "" });

  const PILOTS = [
    { code: "AAK", name: "Capt. Ahmet Akpinar" },
    { code: "SEL", name: "Capt. Selcuk Ekinci" },
    { code: "SCL", name: "Capt. Serkan Caliskan" },
  ];

  useEffect(() => {
    const fetchPlans = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from("plans").select("*").order("created_at", { ascending: false }).limit(50);
        if (error) throw error;
        setPlans(data || []);
      } catch { setPlans([]); }
      setLoading(false);
    };
    fetchPlans();
  }, []);

  const handleAssign = async () => {
    try {
      const { error } = await supabase.from("plans")
        .update({ assigned_pic: assignForm.pic, assigned_fo: assignForm.fo })
        .eq("id", assignModal.id);
      if (error) throw error;
      toast("Crew assignment updated.", "success");
      setPlans((prev) => prev.map((p) =>
        p.id === assignModal.id ? { ...p, assigned_pic: assignForm.pic, assigned_fo: assignForm.fo } : p
      ));
      setAssignModal(null);
    } catch (e) { toast(e.message, "error"); }
  };

  const statusColor = (s) => s === "active" ? "green" : s === "available" ? "amber" : "default";

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>OFP / PLAN MANAGEMENT</span>
          <span style={{ fontSize: "10px", color: "#4a5464" }}>PDF upload via Dashboard</span>
        </div>
        {loading ? <div style={S.empty}>LOADING...</div> : plans.length === 0 ? (
          <div style={S.empty}>NO PLANS FOUND</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>FLIGHT NO</th>
                <th style={S.th}>ROUTE</th>
                <th style={S.th}>STATUS</th>
                <th style={S.th}>PIC</th>
                <th style={S.th}>F/O</th>
                <th style={S.th}>UPLOADED</th>
                <th style={S.th}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td style={{ ...S.td, color: "#e8a020", fontWeight: "bold" }}>{p.flight_number || p.callsign || p.dispatch_no || "—"}</td>
                  <td style={S.td}>{p.dep || "—"} → {p.dest || "—"}</td>
                  <td style={S.td}><span style={S.badge(statusColor(p.status))}>{(p.status || "—").toUpperCase()}</span></td>
                  <td style={S.td}>{p.assigned_pic || <span style={{ color: "#3a4454" }}>UNASSIGNED</span>}</td>
                  <td style={S.td}>{p.assigned_fo || <span style={{ color: "#3a4454" }}>UNASSIGNED</span>}</td>
                  <td style={{ ...S.td, color: "#4a5464", fontSize: "10px" }}>
                    {p.created_at ? new Date(p.created_at).toLocaleString("en-GB") : "—"}
                  </td>
                  <td style={S.td}>
                    <button style={S.btnSecondary} onClick={() => { setAssignModal(p); setAssignForm({ pic: p.assigned_pic || "", fo: p.assigned_fo || "" }); }}>
                      ASSIGN CREW
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {assignModal && (
        <Modal title="ASSIGN CREW" onClose={() => setAssignModal(null)}>
          <div style={{ color: "#7a8494", fontSize: "11px", marginBottom: "16px" }}>
            {assignModal.dispatch_no} — {assignModal.dep} → {assignModal.dest}
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>PIC (CAPTAIN)</label>
            <select style={S.select} value={assignForm.pic} onChange={(e) => setAssignForm({ ...assignForm, pic: e.target.value })}>
              <option value="">— Select —</option>
              {PILOTS.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
            </select>
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>F/O (FIRST OFFICER)</label>
            <select style={S.select} value={assignForm.fo} onChange={(e) => setAssignForm({ ...assignForm, fo: e.target.value })}>
              <option value="">— Select —</option>
              {PILOTS.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
            <button style={S.btnSecondary} onClick={() => setAssignModal(null)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleAssign}>SAVE</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── TAB 3: Flight Archive ────────────────────────────────────────────────────
function FlightArchive() {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ pilot: "", route: "" });
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const fetchArchive = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("plan_versions")
          .select("*, plans(*)")
          .not("archived_at", "is", null)
          .order("archived_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        setVersions(data || []);
      } catch {
        // fallback: fetch archived plans directly
        try {
          const { data } = await supabase.from("plans").select("*").eq("status", "archived").order("archived_at", { ascending: false });
          setVersions((data || []).map(p => ({ id: p.id, archived_at: p.archived_at, version_number: 1, plans: p })));
        } catch { setVersions([]); }
      }
      setLoading(false);
    };
    fetchArchive();
  }, []);

  const filtered = versions.filter((v) => {
    const plan = v.plans || {};
    const pilotMatch = !filter.pilot ||
      (plan.assigned_pic || "").includes(filter.pilot.toUpperCase()) ||
      (plan.assigned_fo || "").includes(filter.pilot.toUpperCase());
    const routeMatch = !filter.route ||
      `${plan.dep || ""}${plan.dest || ""}`.toLowerCase().includes(filter.route.toLowerCase());
    return pilotMatch && routeMatch;
  });

  return (
    <div>
      <div style={{ ...S.card, marginBottom: "16px" }}>
        <div style={S.grid2}>
          <div>
            <label style={S.label}>PILOT CODE</label>
            <input style={S.input} placeholder="AAK, SEL, SCL..." value={filter.pilot}
              onChange={(e) => setFilter({ ...filter, pilot: e.target.value })} />
          </div>
          <div>
            <label style={S.label}>ROUTE / ICAO</label>
            <input style={S.input} placeholder="LTAI, LTFM..." value={filter.route}
              onChange={(e) => setFilter({ ...filter, route: e.target.value })} />
          </div>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>FLIGHT ARCHIVE</span>
          <span style={{ fontSize: "10px", color: "#4a5464" }}>{filtered.length} RECORDS</span>
        </div>
        {loading ? <div style={S.empty}>LOADING...</div> : filtered.length === 0 ? (
          <div style={S.empty}>NO ARCHIVE RECORDS FOUND</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>ARCHIVED</th>
                <th style={S.th}>FLIGHT NO</th>
                <th style={S.th}>ROUTE</th>
                <th style={S.th}>PIC</th>
                <th style={S.th}>F/O</th>
                <th style={S.th}>VERSION</th>
                <th style={S.th}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const plan = v.plans || {};
                return (
                  <tr key={v.id}>
                    <td style={{ ...S.td, color: "#4a5464", fontSize: "10px" }}>
                      {v.archived_at ? new Date(v.archived_at).toLocaleString("en-GB") : "—"}
                    </td>
                    <td style={{ ...S.td, color: "#e8a020" }}>{plan.dispatch_no || plan.flight_number || "—"}</td>
                    <td style={S.td}>{plan.dep || "—"} → {plan.dest || "—"}</td>
                    <td style={S.td}>{plan.assigned_pic || "—"}</td>
                    <td style={S.td}>{plan.assigned_fo || "—"}</td>
                    <td style={{ ...S.td, color: "#4a5464", fontSize: "10px" }}>v{v.version_number || "1"}</td>
                    <td style={S.td}>
                      <button style={S.btnSecondary} onClick={() => setDetail(v)}>VIEW</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <Modal title="ARCHIVE DETAIL" onClose={() => setDetail(null)}>
          <div style={{ fontSize: "11px", lineHeight: "1.8" }}>
            {[
              ["Archived",   detail.archived_at ? new Date(detail.archived_at).toLocaleString("en-GB") : "—"],
              ["Dispatch No", detail.plans?.dispatch_no || "—"],
              ["From",       detail.plans?.dep  || "—"],
              ["To",         detail.plans?.dest || "—"],
              ["Date",       detail.plans?.date || "—"],
              ["STD",        detail.plans?.std  || "—"],
              ["ETA",        detail.plans?.eta  || "—"],
              ["FOB",        detail.plans?.fob  || "—"],
              ["Aircraft",   detail.plans?.ac_type || "—"],
              ["Reg",        detail.plans?.reg  || "—"],
              ["PIC",        detail.plans?.assigned_pic || "—"],
              ["F/O",        detail.plans?.assigned_fo  || "—"],
              ["Version",    `v${detail.version_number || 1}`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #111820" }}>
                <span style={{ color: "#4a5464", letterSpacing: "1px" }}>{k}</span>
                <span style={{ color: "#c8cdd8" }}>{v || "—"}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "20px", textAlign: "right" }}>
            <button style={S.btnSecondary} onClick={() => setDetail(null)}>CLOSE</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── TAB 4: System Settings ───────────────────────────────────────────────────
function SystemSettings({ toast }) {
 const [settings, setSettings] = useState({
    company_name: "GO2 FLY",
    company_icao: "GO2",
    aircraft_reg: "TC-GO2",
    aircraft_type: "B737-800",
    base_airport: "LTAI",
    fuel_density_default: "0.800",
    max_fuel_kg: "20900",
    min_fuel_kg: "2000",
    admin_password: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase.from("system_settings").select("*").single();
        if (data) setSettings((prev) => ({ ...prev, ...data }));
      } catch { /* use defaults */ }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("system_settings").upsert({ id: 1, ...settings });
      if (error) throw error;
      toast("Settings saved.", "success");
    } catch (e) { toast(e.message || "Save failed.", "error"); }
    setSaving(false);
  };

  const field = (key, label, placeholder) => (
    <div style={S.formGroup}>
      <label style={S.label}>{label}</label>
      <input style={S.input} placeholder={placeholder} value={settings[key] || ""}
        onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} />
    </div>
  );

  return (
    <div>
      <div style={S.grid2}>
        <div style={S.card}>
          <div style={S.cardHeader}><span style={S.cardTitle}>COMPANY INFO</span></div>
          {field("company_name", "COMPANY NAME", "GO2 FLY")}
          {field("company_icao", "ICAO CODE", "GO2")}
          {field("base_airport", "HOME BASE ICAO", "LTAI")}
        </div>
        <div style={S.card}>
          <div style={S.cardHeader}><span style={S.cardTitle}>AIRCRAFT</span></div>
          {field("aircraft_reg",        "REGISTRATION",       "TC-GO2"  )}
          {field("aircraft_type",       "TYPE",               "B737-800")}
          {field("max_fuel_kg",         "MAX FUEL (KG)",      "20900"   )}
          {field("min_fuel_kg",         "MIN FUEL (KG)",      "2000"    )}
          {field("fuel_density_default","DEFAULT FUEL DENSITY","0.800"  )}
          {field("admin_password", "ADMIN PASSWORD", "Enter new password")}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
        <button style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
          {saving ? "SAVING..." : "SAVE SETTINGS"}
        </button>
      </div>
    </div>
  );
}

// ─── Main: AdminPanel ─────────────────────────────────────────────────────────
export default function AdminPanel({ onBack }) {
  const [tab, setTab] = useState("users");
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "success" });

  const showToast = useCallback((msg, type = "success") => setToast({ msg, type }), []);

 useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { onBack(); return; }
      setReady(true);
    };
    checkAuth();
  }, [onBack]);
  if (!ready) {
    return (
      <div style={{ ...S.root, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#e8a020", letterSpacing: "3px", fontSize: "12px" }}>
          CHECKING AUTHORIZATION...
        </div>
      </div>
    );
  }

  const TABS = [
    { id: "users",    label: "USERS"    },
    { id: "ofp",      label: "OFP"      },
    { id: "archive",  label: "ARCHIVE"  },
    { id: "settings", label: "SETTINGS" },
  ];

  return (
    <div style={S.root}>
      <div style={S.topBar}>
        <div style={S.logo}>
          <span style={S.logoBadge}>GO2</span>
          <span>eFB ADMIN</span>
          <span style={S.adminTag}>▲ ADMIN MODE</span>
        </div>
        <button style={S.backBtn} onClick={onBack}>← DASHBOARD</button>
      </div>

      <div style={S.container}>
        <div style={S.tabRow}>
          {TABS.map((t) => (
            <button key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "users"    && <UserManagement toast={showToast} />}
        {tab === "ofp"      && <OFPManagement  toast={showToast} />}
        {tab === "archive"  && <FlightArchive  toast={showToast} />}
        {tab === "settings" && <SystemSettings toast={showToast} />}
      </div>

      {toast.msg && (
        <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: "", type: "success" })} />
      )}
    </div>
  );
}