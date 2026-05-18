"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENTS = [
  { key:"business",    label:"Business Analyst",  short:"BA",  color:"#818cf8", glow:"rgba(129,140,248,0.2)", desc:"Market viability & business model" },
  { key:"developer",  label:"Senior Developer",   short:"Dev", color:"#38bdf8", glow:"rgba(56,189,248,0.2)",  desc:"Architecture & scalability" },
  { key:"qa",         label:"QA Engineer",        short:"QA",  color:"#fb923c", glow:"rgba(251,146,60,0.2)",  desc:"Testing strategy & failure scenarios" },
  { key:"security",   label:"Security Engineer",  short:"Sec", color:"#f43f5e", glow:"rgba(244,63,94,0.2)",   desc:"Vulnerabilities & compliance" },
  { key:"ux",         label:"UX Researcher",      short:"UX",  color:"#a78bfa", glow:"rgba(167,139,250,0.2)", desc:"Usability, onboarding & retention" },
  { key:"orchestrator",label:"Orchestrator",      short:"SRS", color:"#34d399", glow:"rgba(52,211,153,0.2)",  desc:"Final SRS synthesis & MVP scope" },
];

// Maps API response keys to agent keys
const KEY_MAP = {
  business:     "business_analysis",
  developer:    "dev_concerns",
  qa:           "qa_concerns",
  security:     "security_concerns",
  ux:           "ux_concerns",
  orchestrator: "final_spec",
};

const VERDICT = {
  promising:           { bg:"#020f06", b:"#16a34a", t:"#4ade80", label:"Promising" },
  needs_clarification: { bg:"#0f0800", b:"#d97706", t:"#fbbf24", label:"Needs Clarification" },
  needs_work:          { bg:"#0f0800", b:"#d97706", t:"#fbbf24", label:"Needs Work" },
  not_viable:          { bg:"#0f0008", b:"#be123c", t:"#fb7185", label:"Not Viable" },
  risky:               { bg:"#0f0008", b:"#be123c", t:"#fb7185", label:"Risky" },
  blocked:             { bg:"#0f0008", b:"#be123c", t:"#fb7185", label:"Blocked" },
  unclear:             { bg:"#080810", b:"#1e293b", t:"#475569", label:"Unclear" },
  feasible:            { bg:"#020f06", b:"#16a34a", t:"#4ade80", label:"Feasible" },
  complex:             { bg:"#0f0800", b:"#d97706", t:"#fbbf24", label:"Complex" },
  partially_feasible:  { bg:"#0f0800", b:"#d97706", t:"#fbbf24", label:"Partially Feasible" },
  technically_complex: { bg:"#0f0800", b:"#d97706", t:"#fbbf24", label:"Technically Complex" },
  stable:              { bg:"#020f06", b:"#16a34a", t:"#4ade80", label:"Stable" },
  unstable:            { bg:"#0f0008", b:"#be123c", t:"#fb7185", label:"Unstable" },
  high_risk:           { bg:"#0f0008", b:"#be123c", t:"#fb7185", label:"High Risk" },
  needs_major_testing: { bg:"#0f0800", b:"#d97706", t:"#fbbf24", label:"Needs Major Testing" },
  needs_improvement:   { bg:"#0f0800", b:"#d97706", t:"#fbbf24", label:"Needs Improvement" },
  secure:              { bg:"#020f06", b:"#16a34a", t:"#4ade80", label:"Secure" },
  critical_risk:       { bg:"#0f0008", b:"#be123c", t:"#fb7185", label:"Critical Risk" },
  high_ux_risk:        { bg:"#0f0008", b:"#be123c", t:"#fb7185", label:"High UX Risk" },
  poor_ux:             { bg:"#0f0008", b:"#be123c", t:"#fb7185", label:"Poor UX" },
  friction_heavy:      { bg:"#0f0800", b:"#d97706", t:"#fbbf24", label:"Friction Heavy" },
  user_friendly:       { bg:"#020f06", b:"#16a34a", t:"#4ade80", label:"User Friendly" },
  medium:              { bg:"#04081a", b:"#3b82f6", t:"#60a5fa", label:"Medium" },
  moderate:            { bg:"#04081a", b:"#3b82f6", t:"#60a5fa", label:"Moderate" },
  high:                { bg:"#020f06", b:"#16a34a", t:"#4ade80", label:"High" },
  low:                 { bg:"#0f0008", b:"#be123c", t:"#fb7185", label:"Low" },
};

const EXAMPLES = [
  "An AI legal doc reviewer for Indian startups",
  "SaaS platform for managing school admissions",
  "Peer-to-peer tutoring marketplace with live scheduling",
];

// ─── ScoreRing ────────────────────────────────────────────────────────────────

function ScoreRing({ value, max = 10, color, size = 54 }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / max) * circ;
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#0d0d1a" strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition:"stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)",
            filter:`drop-shadow(0 0 5px ${color}90)` }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
        justifyContent:"center", fontSize:14, fontWeight:700, color,
        fontFamily:"'IBM Plex Mono',monospace", textShadow:`0 0 14px ${color}70` }}>
        {value}
      </div>
    </div>
  );
}

// ─── VerdictBadge ─────────────────────────────────────────────────────────────

function VerdictBadge({ verdict, large }) {
  const v = VERDICT[verdict] || VERDICT.unclear;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5,
      padding: large ? "5px 12px" : "3px 8px",
      borderRadius:999, fontWeight:700, letterSpacing:"0.07em",
      textTransform:"uppercase", background:v.bg,
      border:`1px solid ${v.b}`, color:v.t,
      fontSize: large ? 11 : 9 }}>
      <span style={{ width:large?5:4, height:large?5:4, borderRadius:"50%",
        background:v.t, flexShrink:0, boxShadow:`0 0 6px ${v.t}` }} />
      {v.label}
    </span>
  );
}

// ─── ListItems ────────────────────────────────────────────────────────────────

function ListItems({ items, color }) {
  if (!items?.length) return null;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display:"flex", gap:10, padding:"9px 12px",
          background:"#060610", borderRadius:7,
          border:"1px solid #0c0c1c", borderLeft:`2px solid ${color}28`,
          fontSize:12, color:"#94a3b8", lineHeight:1.6 }}>
          <span style={{ color:`${color}50`, flexShrink:0, fontSize:8, marginTop:3 }}>▸</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

// ─── AgentOutput ─────────────────────────────────────────────────────────────

function AgentOutput({ agent, data }) {
  if (!data) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", height:200, gap:8, color:"#1e293b" }}>
      <span style={{ fontSize:28 }}>◌</span>
      <span style={{ fontSize:12 }}>No output</span>
    </div>
  );

  if (data.error) return (
    <div style={{ padding:"14px 16px", background:"#0f0008", border:"1px solid #7f1d1d",
      borderRadius:8, color:"#fca5a5", fontSize:12.5, lineHeight:1.7 }}>
      <strong style={{ display:"block", marginBottom:4, fontSize:10,
        textTransform:"uppercase", letterSpacing:"0.1em", color:"#f87171" }}>
        Analysis Failed
      </strong>
      {data.error}
    </div>
  );

  const verdict      = data.verdict || data.project_viability;
  const scores       = Object.entries(data).filter(([k,v]) => k.endsWith("_score") && typeof v === "number");
  const recommendation = data.recommendation || data.final_recommendation;
  const summary      = data.product_summary || data.core_problem_statement;
  const lists        = Object.entries(data).filter(([k,v]) => Array.isArray(v) && v.length && k !== "_meta");
  const textFields   = Object.entries(data).filter(([k,v]) => typeof v === "string" &&
    !["role","verdict","project_viability","recommendation","final_recommendation",
      "product_summary","core_problem_statement"].includes(k));
  const meta = data._meta;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:22 }}>

      {(verdict || scores.length > 0) && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          flexWrap:"wrap", gap:14, padding:"16px 18px",
          background:"linear-gradient(135deg,#07070f,#060610)",
          border:"1px solid #0f0f1c", borderRadius:10 }}>
          <div>
            {verdict && <VerdictBadge verdict={verdict} large />}
            <div style={{ fontSize:9, color:"#334155", marginTop:6,
              fontFamily:"'IBM Plex Mono',monospace" }}>
              {agent.label} assessment
            </div>
          </div>
          {scores.length > 0 && (
            <div style={{ display:"flex", gap:18 }}>
              {scores.map(([k,v]) => (
                <div key={k} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
                  <ScoreRing value={v} color={agent.color} size={54} />
                  <span style={{ fontSize:8, color:"#334155", textAlign:"center",
                    textTransform:"uppercase", letterSpacing:"0.1em",
                    fontFamily:"'IBM Plex Mono',monospace", maxWidth:58, lineHeight:1.3 }}>
                    {k.replace(/_score$/,"").replace(/_/g," ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {summary && (
        <div style={{ padding:"13px 15px",
          background:`linear-gradient(135deg,${agent.color}08,transparent)`,
          border:`1px solid ${agent.color}1a`,
          borderLeft:`3px solid ${agent.color}`,
          borderRadius:8, fontSize:13, color:"#e2e8f0", lineHeight:1.7 }}>
          <div style={{ fontSize:8, fontWeight:700, color:agent.color, opacity:.7,
            textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:7,
            fontFamily:"'IBM Plex Mono',monospace" }}>
            {data.product_summary ? "Product Summary" : "Problem Statement"}
          </div>
          {summary}
        </div>
      )}

      {recommendation && (
        <div style={{ padding:"13px 15px", background:"#07070f",
          border:"1px solid #0f0f1c", borderLeft:"3px solid #1e293b",
          borderRadius:8, fontSize:12.5, color:"#64748b", lineHeight:1.75 }}>
          <div style={{ fontSize:8, fontWeight:700, color:"#334155",
            textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:7,
            fontFamily:"'IBM Plex Mono',monospace" }}>
            Recommendation
          </div>
          {recommendation}
        </div>
      )}

      {textFields.map(([k,v]) => (
        <div key={k}>
          <div style={{ fontSize:8, fontWeight:700, color:"#334155",
            textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:8,
            fontFamily:"'IBM Plex Mono',monospace", paddingBottom:6,
            borderBottom:"1px solid #0a0a14" }}>
            {k.replace(/_/g," ")}
          </div>
          <p style={{ fontSize:12, color:"#64748b", lineHeight:1.7 }}>{v}</p>
        </div>
      ))}

      {lists.map(([k,v]) => (
        <div key={k}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:9,
            paddingBottom:7, borderBottom:"1px solid #0a0a14" }}>
            <span style={{ fontSize:8, fontWeight:700, color:"#334155",
              textTransform:"uppercase", letterSpacing:"0.12em",
              fontFamily:"'IBM Plex Mono',monospace" }}>
              {k.replace(/_/g," ")}
            </span>
            <span style={{ fontSize:9, padding:"1px 7px", borderRadius:999,
              background:`${agent.color}10`, border:`1px solid ${agent.color}22`,
              color:`${agent.color}80`, fontFamily:"'IBM Plex Mono',monospace" }}>
              {v.length}
            </span>
          </div>
          <ListItems items={v} color={agent.color} />
        </div>
      ))}

      {meta && (
        <div style={{ display:"flex", gap:16, paddingTop:12,
          borderTop:"1px solid #0a0a14", flexWrap:"wrap" }}>
          {[
            { label:"Latency", val:`${meta.latency_seconds}s` },
            { label:"Input tokens", val:meta.input_tokens?.toLocaleString() },
            { label:"Output tokens", val:meta.output_tokens?.toLocaleString() },
            { label:"Cost", val:`$${meta.estimated_cost_usd}` },
          ].map(({ label, val }) => val && (
            <div key={label} style={{ display:"flex", flexDirection:"column", gap:2 }}>
              <span style={{ fontSize:8, color:"#1e293b", textTransform:"uppercase",
                letterSpacing:"0.1em", fontFamily:"'IBM Plex Mono',monospace" }}>
                {label}
              </span>
              <span style={{ fontSize:10, color:"#334155",
                fontFamily:"'IBM Plex Mono',monospace" }}>
                {val}
              </span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────
// Uses /generate-spec (single request) and animates agents one-by-one
// using setTimeout after response arrives. Visually identical to streaming
// but works reliably on Render free tier which buffers SSE responses.

export default function Home() {
  const router      = useRouter();
  const [phase, setPhase]       = useState("idle");
  const [idea, setIdea]         = useState("");
  const [statuses, setStatuses] = useState({});
  const [results, setResults]   = useState({});
  const [active, setActive]     = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [focused, setFocused]   = useState(false);
  const [error, setError]       = useState(null);
  const [loadingText, setLoadingText] = useState("Analysing...");
  const textareaRef = useRef(null);
  const timersRef   = useRef([]);

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push("/login");
    });
  }, []);

  const completedCount = Object.values(statuses).filter(s => s === "done").length;
  const activeAgentObj = AGENTS.find(a => statuses[a.key] === "running");

  // Cycling loading messages while waiting for backend
  useEffect(() => {
    if (phase !== "running") return;
    const messages = [
      "Analysing...",
      "Business Analyst thinking...",
      "Engineer reviewing architecture...",
      "QA checking failure scenarios...",
      "Security scanning vulnerabilities...",
      "UX evaluating usability...",
      "Orchestrator synthesising...",
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % messages.length;
      setLoadingText(messages[i]);
    }, 4000);
    return () => clearInterval(interval);
  }, [phase]);

  // Animate agents one by one from data
  function animateAgents(data) {
    // Clear any previous timers
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    AGENTS.forEach((agent, i) => {
      const dataKey = KEY_MAP[agent.key];
      const agentData = data[dataKey];
      if (!agentData) return;

      // Show as "running" first
      const runTimer = setTimeout(() => {
        setStatuses(prev => ({ ...prev, [agent.key]: "running" }));
      }, i * 600);

      // Then show as "done" with results
      const doneTimer = setTimeout(() => {
        setStatuses(prev => ({ ...prev, [agent.key]: "done" }));
        setResults(prev => ({ ...prev, [agent.key]: agentData }));
        setActive(prev => prev || agent.key);
      }, i * 600 + 400);

      timersRef.current.push(runTimer, doneTimer);
    });
  }

  const submit = useCallback(async () => {
    if (!idea.trim() || phase === "running") return;

    setPhase("running");
    setStatuses({});
    setResults({});
    setActive(null);
    setProjectId(null);
    setError(null);
    setLoadingText("Analysing...");

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300000); // 5 min

      const res = await fetch("https://specforge-j74n.onrender.com/generate-spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();

      // Animate agents appearing one by one
      animateAgents(data);

      // Set done after all animations complete
      const totalDelay = (AGENTS.length - 1) * 600 + 600;
      const doneTimer = setTimeout(() => {
        setProjectId(data.project_id);
        setPhase("done");
      }, totalDelay);
      timersRef.current.push(doneTimer);

    } catch (err) {
      if (err.name === "AbortError") {
        setError("Request timed out. The backend may be waking up — wait 30 seconds and try again.");
      } else if (err.message?.includes("429")) {
        setError("Rate limit reached. You can generate 3 specs per hour. Please try again later.");
      } else {
        setError(err.message || "Connection failed.");
      }
      setPhase("idle");
    }
  }, [idea, phase]);

  const reset = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase("idle");
    setIdea("");
    setStatuses({});
    setResults({});
    setActive(null);
    setProjectId(null);
    setError(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const isIdle    = phase === "idle";
  const isRunning = phase === "running";
  const isDone    = phase === "done";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html { scroll-behavior:smooth; }
        body {
          background:#05050a; color:#f1f5f9;
          font-family:'Inter',sans-serif; min-height:100vh;
          -webkit-font-smoothing:antialiased;
        }
        ::-webkit-scrollbar { width:3px; height:3px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#1e293b; border-radius:2px; }
        ::selection { background:rgba(99,102,241,0.3); color:#f1f5f9; }

        @keyframes spin        { to { transform:rotate(360deg); } }
        @keyframes pulseGlow   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.88)} }
        @keyframes shimmerFlow { 0%{background-position:-300% center} 100%{background-position:300% center} }
        @keyframes ambientDrift{ 0%,100%{opacity:.6} 50%{opacity:1} }
        @keyframes slideUp     { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn      { from{opacity:0} to{opacity:1} }
        @keyframes popIn       { 0%{opacity:0;transform:scale(.85)} 60%{transform:scale(1.05)} 100%{opacity:1;transform:scale(1)} }

        .shimmer {
          background:linear-gradient(90deg,#6366f1 0%,#818cf8 25%,#c4b5fd 50%,#818cf8 75%,#6366f1 100%);
          background-size:300% auto;
          -webkit-background-clip:text; background-clip:text;
          -webkit-text-fill-color:transparent;
          animation:shimmerFlow 5s linear infinite;
        }
        .dot-bg {
          background-image:radial-gradient(circle,#1e293b 1px,transparent 1px);
          background-size:28px 28px;
        }
        .glass {
          background:rgba(5,5,10,.85);
          backdrop-filter:blur(24px) saturate(1.3);
          -webkit-backdrop-filter:blur(24px) saturate(1.3);
        }
        .card {
          background:#07070f; border:1px solid #0f0f1c;
          border-radius:12px; transition:border-color .2s;
        }
        .card:hover { border-color:#161628; }
        .agent-btn {
          border:none; background:transparent; cursor:pointer;
          width:100%; text-align:left; transition:background .15s;
        }
        .agent-btn:hover { background:#09090f; }
        .slide-up { animation:slideUp .45s cubic-bezier(.22,1,.36,1) forwards; }
        .fade-in  { animation:fadeIn  .35s ease forwards; }
        .pop-in   { animation:popIn   .4s cubic-bezier(.22,1,.36,1) forwards; }
        .chip {
          border:1px solid #12122a; background:transparent;
          cursor:pointer; border-radius:999px;
          font-family:'Inter',sans-serif; transition:all .15s;
        }
        .chip:hover { background:#0d0d20; border-color:#6366f130; color:#818cf8 !important; }
        .qt-btn {
          border:1px solid #0f0f1c; background:#07070f; cursor:pointer;
          font-family:'IBM Plex Mono',monospace; border-radius:6px; transition:all .15s;
        }
        .qt-btn:hover { background:#0d0d1a; }
      `}</style>

      <div className="dot-bg" style={{ position:"fixed", inset:0, zIndex:0, opacity:.35, pointerEvents:"none" }} />

      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-200, left:"28%", width:640, height:640,
          background:"radial-gradient(ellipse,rgba(99,102,241,.07) 0%,transparent 70%)",
          animation:"ambientDrift 9s ease infinite" }} />
        <div style={{ position:"absolute", top:"45%", right:-80, width:420, height:420,
          background:"radial-gradient(ellipse,rgba(167,139,250,.05) 0%,transparent 70%)",
          animation:"ambientDrift 12s ease infinite 3s" }} />
        <div style={{ position:"absolute", bottom:-100, left:"10%", width:360, height:360,
          background:"radial-gradient(ellipse,rgba(56,189,248,.04) 0%,transparent 70%)",
          animation:"ambientDrift 15s ease infinite 6s" }} />
      </div>

      <div style={{ position:"relative", zIndex:1, minHeight:"100vh", paddingBottom:80 }}>

        {/* ── Navbar ── */}
        <nav className="glass" style={{
          position:"sticky", top:0, zIndex:200,
          borderBottom:"1px solid #0a0a14", height:54,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 32px",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:17, letterSpacing:"-0.025em" }}>
              Spec<span style={{ color:"#6366f1", textShadow:"0 0 24px rgba(99,102,241,.5)" }}>Forge</span>
            </span>
            <span style={{ fontSize:8, padding:"2px 7px", borderRadius:4,
              background:"linear-gradient(135deg,#0d0a2e,#12103a)",
              border:"1px solid #2e1f8a40", color:"#818cf8",
              fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.1em" }}>BETA</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            {isRunning && (
              <div style={{ display:"flex", alignItems:"center", gap:7,
                padding:"4px 12px", background:"#0f0900",
                border:"1px solid #92400e40", borderRadius:999 }}>
                <span style={{ width:5, height:5, borderRadius:"50%", background:"#f59e0b",
                  animation:"pulseGlow 1.5s ease infinite",
                  boxShadow:"0 0 8px #f59e0b", display:"inline-block" }} />
                <span style={{ fontSize:10, color:"#f59e0b", fontFamily:"'IBM Plex Mono',monospace" }}>
                  {loadingText}
                </span>
              </div>
            )}
            {isDone && (
              <div style={{ display:"flex", alignItems:"center", gap:7,
                padding:"4px 12px", background:"#020d07",
                border:"1px solid #16a34a40", borderRadius:999 }}>
                <span style={{ width:5, height:5, borderRadius:"50%", background:"#34d399",
                  boxShadow:"0 0 8px #34d399", display:"inline-block" }} />
                <span style={{ fontSize:10, color:"#34d399", fontFamily:"'IBM Plex Mono',monospace" }}>
                  {completedCount}/6 complete
                </span>
              </div>
            )}
            <span style={{ fontSize:11, color:"#1e293b", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.05em" }}>
              Multi-Agent SRS Generator
            </span>
          </div>
        </nav>

        <div style={{ maxWidth:1280, margin:"0 auto", padding:"0 32px" }}>

          {/* ── Hero (collapses smoothly on submit) ── */}
          <div style={{
            maxHeight: isIdle ? 600 : 0, opacity: isIdle ? 1 : 0,
            overflow:"hidden",
            transition:"max-height .6s cubic-bezier(.22,1,.36,1), opacity .4s ease",
          }}>
            <div style={{ paddingTop:76, paddingBottom:36, position:"relative" }} className="slide-up">
              <div style={{ position:"absolute", top:-40, left:"50%", transform:"translateX(-50%)",
                width:700, height:280, pointerEvents:"none",
                background:"radial-gradient(ellipse at top,rgba(99,102,241,.1) 0%,transparent 65%)" }} />

              <div style={{ display:"inline-flex", alignItems:"center", gap:8,
                padding:"6px 16px", background:"linear-gradient(135deg,#07051a,#0a0820)",
                border:"1px solid #2d1f6e50", borderRadius:999, marginBottom:28,
                boxShadow:"0 0 24px rgba(99,102,241,.1)" }}>
                <span style={{ display:"flex", gap:3 }}>
                  {AGENTS.slice(0,5).map((a,i) => (
                    <span key={i} style={{ width:4, height:4, borderRadius:"50%",
                      background:a.color, boxShadow:`0 0 6px ${a.color}`, display:"inline-block" }} />
                  ))}
                </span>
                <span style={{ fontSize:10, color:"#818cf8", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.1em" }}>
                  5 AI AGENTS · DEBATE MODE · RAG-GROUNDED
                </span>
              </div>

              <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(34px,5.4vw,70px)",
                fontWeight:800, lineHeight:1.03, letterSpacing:"-0.03em", marginBottom:18 }}>
                Your idea, stress&#8209;tested<br />
                <span className="shimmer">from every angle</span>
              </h1>

              <p style={{ fontSize:15, color:"#475569", maxWidth:520, lineHeight:1.7, marginBottom:28 }}>
                Five AI specialists debate your product idea and synthesize a complete Software Requirements
                Specification — with MVP scope, security analysis, and implementation priorities.
              </p>

              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
                {AGENTS.slice(0,5).map(a => (
                  <span key={a.key} style={{ display:"inline-flex", alignItems:"center", gap:5,
                    fontSize:10, padding:"4px 11px", borderRadius:999,
                    background:`${a.color}0d`, border:`1px solid ${a.color}25`, color:a.color,
                    fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.04em" }}>
                    <span style={{ width:4, height:4, borderRadius:"50%", background:a.color, boxShadow:`0 0 6px ${a.color}` }} />
                    {a.label}
                  </span>
                ))}
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                <span style={{ fontSize:10, color:"#1e293b", fontFamily:"'IBM Plex Mono',monospace" }}>TRY →</span>
                {EXAMPLES.map((e,i) => (
                  <button key={i} className="chip"
                    onClick={() => { setIdea(e); textareaRef.current?.focus(); }}
                    style={{ fontSize:10, padding:"4px 11px", color:"#334155" }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Input ── */}
          <div style={{ paddingTop:isIdle?0:24, paddingBottom:20, transition:"padding .5s ease" }}>
            <div style={{ borderRadius:14, padding:1,
              background:focused ? "linear-gradient(135deg,#4338ca,#7c3aed,#4338ca)" : "#0f0f1c",
              transition:"background .3s, box-shadow .3s",
              boxShadow:focused ? "0 0 32px rgba(99,102,241,.18)" : "none" }}>
              <div style={{ borderRadius:13, background:"#08081a", overflow:"hidden" }}>
                <textarea
                  ref={textareaRef}
                  value={idea}
                  onChange={e => setIdea(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={e => { if (e.key==="Enter" && (e.metaKey||e.ctrlKey)) submit(); }}
                  placeholder={isIdle ? "Describe your product idea in as much detail as possible..." : "Analyse another idea..."}
                  rows={isIdle ? 4 : 2}
                  style={{ width:"100%", background:"transparent", border:"none", outline:"none",
                    resize:"none", fontFamily:"'Inter',sans-serif", fontSize:14,
                    lineHeight:1.7, color:"#e2e8f0", caretColor:"#6366f1",
                    padding:isIdle ? "18px 18px 56px 18px" : "14px 18px 14px 18px",
                    transition:"padding .45s ease" }}
                />
                {isIdle && (
                  <div style={{ padding:"10px 18px", borderTop:"1px solid #0d0d1a",
                    display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      {["⌘","↵"].map((k,i) => (
                        <kbd key={i} style={{ fontSize:10, padding:"2px 7px", background:"#07070f",
                          border:"1px solid #0f0f1c", borderRadius:4, color:"#1e293b",
                          fontFamily:"'IBM Plex Mono',monospace" }}>{k}</kbd>
                      ))}
                      <span style={{ fontSize:10, color:"#1e293b" }}>to submit</span>
                    </div>
                    <span style={{ fontSize:10, color:"#1e293b", fontFamily:"'IBM Plex Mono',monospace" }}>
                      {idea.length > 0 ? `${idea.length} chars` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
              <button onClick={submit} disabled={isRunning || !idea.trim()}
                style={{ padding:"9px 22px",
                  background:isRunning ? "#0d0a28" : "linear-gradient(135deg,#4338ca,#6d28d9)",
                  border:"1px solid", borderColor:isRunning?"#1e1b4b":"#5b4dcc",
                  borderRadius:9, color:isRunning?"#4338ca":"#fff",
                  fontSize:12, fontWeight:600,
                  opacity:(!idea.trim()||isRunning)?.45:1,
                  cursor:(!idea.trim()||isRunning)?"not-allowed":"pointer",
                  transition:"all .2s", display:"inline-flex", alignItems:"center", gap:8,
                  boxShadow:isRunning?"none":"0 0 22px rgba(99,102,241,.28)",
                  fontFamily:"'Inter',sans-serif" }}>
                {isRunning ? (
                  <>
                    <span style={{ width:11, height:11, borderRadius:"50%",
                      border:"2px solid #1e1b4b", borderTopColor:"#818cf8",
                      animation:"spin .7s linear infinite", display:"inline-block" }} />
                    {loadingText}
                  </>
                ) : "Generate Spec →"}
              </button>
            </div>
          </div>

          {/* ── Error banner ── */}
          {error && (
            <div className="slide-up" style={{ marginBottom:16, padding:"12px 16px",
              background:"#0f0008", border:"1px solid #7f1d1d", borderRadius:10,
              display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ color:"#f87171", fontSize:14 }}>⚠</span>
              <span style={{ fontSize:12, color:"#fca5a5" }}>{error}</span>
              <button onClick={() => setError(null)}
                style={{ marginLeft:"auto", background:"none", border:"none",
                  color:"#7f1d1d", cursor:"pointer", fontSize:16 }}>×</button>
            </div>
          )}

          {/* ── Pipeline ── */}
          <div style={{
            maxHeight:isIdle?0:130, opacity:isIdle?0:1,
            overflow:"hidden", transition:"max-height .5s ease, opacity .4s ease",
            marginBottom:isIdle?0:18,
          }}>
            <div className="card" style={{ padding:"18px 24px" }}>
              <div style={{ display:"flex", alignItems:"center", marginBottom:14 }}>
                <span style={{ fontSize:8, fontWeight:700, color:"#1e293b",
                  textTransform:"uppercase", letterSpacing:"0.14em",
                  fontFamily:"'IBM Plex Mono',monospace" }}>Agent Pipeline</span>
                <div style={{ flex:1, height:1, background:"#0a0a14", margin:"0 12px" }} />
                <span style={{ fontSize:9, color:"#1e293b", fontFamily:"'IBM Plex Mono',monospace" }}>
                  {completedCount}/6
                </span>
              </div>
              <div style={{ display:"flex", alignItems:"center" }}>
                {AGENTS.map((agent,i) => {
                  const s = statuses[agent.key];
                  const isRun = s === "running";
                  const isDn  = s === "done";
                  return (
                    <div key={agent.key} style={{ display:"flex", alignItems:"center", flex:1, minWidth:0 }}>
                      <button onClick={() => isDn && setActive(agent.key)}
                        style={{ display:"flex", flexDirection:"column", alignItems:"center",
                          gap:6, flex:1, padding:"2px", border:"none",
                          background:"transparent", cursor:isDn?"pointer":"default" }}>
                        <div style={{ position:"relative" }}>
                          {isRun && (
                            <div style={{ position:"absolute", inset:-5, borderRadius:"50%",
                              border:`1px solid ${agent.color}35`,
                              animation:"pulseGlow 2s ease infinite" }} />
                          )}
                          <div style={{
                            width:36, height:36, borderRadius:"50%",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            background:isDn?`${agent.color}14`:isRun?"#100c00":"#07070f",
                            border:`2px solid ${isDn?agent.color:isRun?"#f59e0b":"#0f0f1c"}`,
                            transition:"all .4s cubic-bezier(.22,1,.36,1)",
                            boxShadow:isDn?`0 0 16px ${agent.glow}`:isRun?"0 0 12px rgba(245,158,11,.28)":"none",
                            ...(isDn ? { animation:"popIn .4s cubic-bezier(.22,1,.36,1)" } : {})
                          }}>
                            {isDn
                              ? <span style={{ color:agent.color, fontSize:13, fontWeight:700, textShadow:`0 0 10px ${agent.color}` }}>✓</span>
                              : isRun
                              ? <span style={{ width:7, height:7, borderRadius:"50%", background:"#f59e0b",
                                  display:"block", animation:"pulseGlow 1s ease infinite", boxShadow:"0 0 8px #f59e0b" }} />
                              : <span style={{ color:"#1e293b", fontSize:10, fontWeight:600, fontFamily:"'IBM Plex Mono',monospace" }}>{i+1}</span>
                            }
                          </div>
                        </div>
                        <span style={{ fontSize:8, fontWeight:600, fontFamily:"'IBM Plex Mono',monospace",
                          letterSpacing:"0.05em", color:isDn?agent.color:isRun?"#f59e0b":"#1e293b",
                          transition:"color .3s", whiteSpace:"nowrap" }}>
                          {agent.short}
                        </span>
                      </button>
                      {i < AGENTS.length-1 && (
                        <div style={{ flex:"0 0 14px", height:1, background:"#0a0a14", position:"relative", overflow:"hidden" }}>
                          <div style={{ position:"absolute", inset:0, background:isDn?agent.color:"transparent",
                            opacity:.3, transition:"background .5s ease" }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Results ── */}
          {Object.keys(results).length > 0 && (
            <div className="fade-in" style={{ display:"grid", gridTemplateColumns:"220px 1fr",
              gap:14, marginBottom:32 }}>

              {/* Sidebar */}
              <div className="card" style={{ overflow:"hidden", position:"sticky", top:66, height:"fit-content" }}>
                <div style={{ padding:"11px 15px", borderBottom:"1px solid #0a0a14",
                  display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:8, fontWeight:700, color:"#1e293b", textTransform:"uppercase",
                    letterSpacing:"0.14em", fontFamily:"'IBM Plex Mono',monospace" }}>Agents</span>
                  <span style={{ fontSize:9, color:"#1e293b", fontFamily:"'IBM Plex Mono',monospace" }}>
                    {Object.keys(results).length}/{AGENTS.length}
                  </span>
                </div>
                {AGENTS.filter(a => results[a.key]).map(agent => {
                  const result  = results[agent.key];
                  const verdict = result?.verdict || result?.project_viability;
                  const isActive= active === agent.key;
                  const vCfg    = VERDICT[verdict];
                  return (
                    <button key={agent.key} className="agent-btn"
                      onClick={() => setActive(agent.key)}
                      style={{ padding:"11px 15px",
                        borderLeft:`2px solid ${isActive?agent.color:"transparent"}`,
                        background:isActive?`linear-gradient(90deg,${agent.color}08,transparent)`:"transparent",
                        display:"flex", flexDirection:"column", gap:5 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:6, height:6, borderRadius:"50%", background:agent.color, flexShrink:0,
                          boxShadow:isActive?`0 0 8px ${agent.color}`:"none", transition:"box-shadow .2s" }} />
                        <span style={{ fontSize:11, fontWeight:500, color:isActive?"#e2e8f0":"#475569",
                          transition:"color .15s", lineHeight:1.2 }}>
                          {agent.label}
                        </span>
                      </div>
                      {verdict && (
                        <div style={{ marginLeft:14 }}>
                          <span style={{ display:"inline-flex", alignItems:"center", gap:4,
                            fontSize:8, padding:"2px 8px", borderRadius:999,
                            background:vCfg?.bg||"#07070f", border:`1px solid ${vCfg?.b||"#0f0f1c"}`,
                            color:vCfg?.t||"#475569", fontWeight:700, letterSpacing:"0.08em",
                            textTransform:"uppercase" }}>
                            <span style={{ width:3, height:3, borderRadius:"50%", background:vCfg?.t||"#475569" }} />
                            {vCfg?.label||verdict}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Main panel */}
              <div className="card" style={{ overflow:"hidden", minHeight:400 }}>
                {active && (() => {
                  const agent = AGENTS.find(a => a.key === active);
                  if (!agent) return null;
                  return (
                    <>
                      <div style={{ padding:"15px 24px", borderBottom:"1px solid #0a0a14",
                        background:`linear-gradient(135deg,${agent.color}06,transparent 60%)`,
                        display:"flex", alignItems:"center", gap:12 }}>
                        <div style={{ width:34, height:34, borderRadius:"50%", flexShrink:0,
                          background:`${agent.color}10`, border:`1.5px solid ${agent.color}30`,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          boxShadow:`0 0 16px ${agent.glow}` }}>
                          <span style={{ width:10, height:10, borderRadius:"50%", background:agent.color,
                            boxShadow:`0 0 10px ${agent.color},0 0 22px ${agent.color}60` }} />
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14,
                            color:"#f1f5f9", letterSpacing:"-0.015em" }}>{agent.label}</div>
                          <div style={{ fontSize:10, color:"#334155", marginTop:2 }}>{agent.desc}</div>
                        </div>
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap", justifyContent:"flex-end" }}>
                          {AGENTS.filter(a => results[a.key] && a.key !== active).map(a => (
                            <button key={a.key} className="qt-btn"
                              onClick={() => setActive(a.key)}
                              style={{ fontSize:8, padding:"4px 9px", color:"#334155", letterSpacing:"0.06em" }}
                              onMouseEnter={e => { e.currentTarget.style.background=`${a.color}10`; e.currentTarget.style.borderColor=`${a.color}30`; e.currentTarget.style.color=a.color; }}
                              onMouseLeave={e => { e.currentTarget.style.background="#07070f"; e.currentTarget.style.borderColor="#0f0f1c"; e.currentTarget.style.color="#334155"; }}>
                              {a.short}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ padding:"24px 28px", maxHeight:680, overflowY:"auto" }}>
                        <AgentOutput agent={agent} data={results[active]} />
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── Completion banner ── */}
          <div style={{
            maxHeight:isDone?100:0, opacity:isDone?1:0,
            overflow:"hidden", transition:"max-height .5s ease, opacity .4s ease",
            marginBottom:isDone?32:0,
          }}>
            <div style={{ padding:"16px 24px",
              background:"linear-gradient(135deg,#020d07,#030f08)",
              border:"1px solid #16a34a25", borderRadius:12,
              display:"flex", alignItems:"center", justifyContent:"space-between",
              boxShadow:"0 0 32px rgba(52,211,153,.04)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:34, height:34, borderRadius:"50%", background:"#052e16",
                  border:"1px solid #16a34a40", display:"flex", alignItems:"center", justifyContent:"center",
                  boxShadow:"0 0 16px rgba(52,211,153,.18)" }}>
                  <span style={{ color:"#4ade80", fontSize:14, textShadow:"0 0 12px #4ade80" }}>✓</span>
                </div>
                <div>
                  <p style={{ fontSize:13, fontWeight:600, color:"#4ade80", letterSpacing:"-0.01em" }}>
                    Specification generated &amp; saved
                  </p>
                  {projectId && (
                    <p style={{ fontSize:9, color:"#166534", marginTop:3,
                      fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.05em" }}>
                      PROJECT_ID: {projectId}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={reset}
                style={{ fontSize:11, padding:"7px 16px", background:"transparent",
                  border:"1px solid #16a34a30", color:"#4ade80", borderRadius:7,
                  cursor:"pointer", fontFamily:"'Inter',sans-serif", transition:"all .15s" }}
                onMouseEnter={e => { e.currentTarget.style.background="#052e16"; e.currentTarget.style.borderColor="#16a34a60"; }}
                onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="#16a34a30"; }}>
                New Analysis →
              </button>
            </div>
          </div>

          {/* ── Feature cards (idle only) ── */}
          <div style={{
            maxHeight:isIdle?300:0, opacity:isIdle?1:0,
            overflow:"hidden", transition:"max-height .6s ease, opacity .4s ease",
          }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, paddingTop:4 }}>
              {[
                { icon:"◈", color:"#818cf8", title:"Multi-Agent Debate",
                  desc:"5 specialized agents each contribute a distinct perspective. Conflicts are surfaced explicitly — not averaged away.",
                  tags:["BA","Dev","QA","Sec","UX"] },
                { icon:"⬡", color:"#38bdf8", title:"RAG-Grounded Analysis",
                  desc:"Agents retrieve from GDPR, OWASP, DPDP Act, and SaaS architecture docs before responding — not just training data.",
                  tags:["GDPR","OWASP","DPDP"] },
                { icon:"◆", color:"#34d399", title:"Production SRS Output",
                  desc:"The Orchestrator synthesizes into MVP scope, functional requirements, security requirements, and launch risks.",
                  tags:["SRS","MVP","Risks"] },
              ].map((card,i) => (
                <div key={i} className="card" style={{ padding:"20px 22px" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
                    <span style={{ fontSize:22, color:card.color, textShadow:`0 0 18px ${card.color}60` }}>{card.icon}</span>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap", justifyContent:"flex-end" }}>
                      {card.tags.map(t => (
                        <span key={t} style={{ fontSize:7, padding:"2px 6px",
                          background:`${card.color}0d`, border:`1px solid ${card.color}20`,
                          color:card.color, borderRadius:4, fontFamily:"'IBM Plex Mono',monospace",
                          letterSpacing:"0.06em" }}>{t}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13.5,
                    color:"#94a3b8", marginBottom:8, letterSpacing:"-0.01em" }}>
                    {card.title}
                  </div>
                  <div style={{ fontSize:12, color:"#334155", lineHeight:1.65 }}>{card.desc}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}