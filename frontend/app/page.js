"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const AGENTS = [
  { key:"business",     label:"Business Analyst",  short:"BA",  color:"#818cf8", glow:"rgba(129,140,248,0.2)", desc:"Market viability & business model" },
  { key:"developer",   label:"Senior Developer",   short:"Dev", color:"#38bdf8", glow:"rgba(56,189,248,0.2)",  desc:"Architecture & scalability" },
  { key:"qa",          label:"QA Engineer",        short:"QA",  color:"#fb923c", glow:"rgba(251,146,60,0.2)",  desc:"Testing strategy & failure scenarios" },
  { key:"security",    label:"Security Engineer",  short:"Sec", color:"#f43f5e", glow:"rgba(244,63,94,0.2)",   desc:"Vulnerabilities & compliance" },
  { key:"ux",          label:"UX Researcher",      short:"UX",  color:"#a78bfa", glow:"rgba(167,139,250,0.2)", desc:"Usability, onboarding & retention" },
  { key:"orchestrator",label:"Orchestrator",       short:"SRS", color:"#34d399", glow:"rgba(52,211,153,0.2)",  desc:"Final SRS synthesis & MVP scope" },
];

const KEY_MAP = {
  business:"business_analysis", developer:"dev_concerns",
  qa:"qa_concerns", security:"security_concerns",
  ux:"ux_concerns", orchestrator:"final_spec",
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

const BACKEND = "https://specforge-j74n.onrender.com";

// Agent timing — simulates realistic debate durations while waiting
// Total ~5.5 minutes to match actual backend time
const AGENT_DURATIONS = [55, 60, 65, 70, 60, 75]; // seconds per agent

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
        justifyContent:"center", fontSize:13, fontWeight:700, color,
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

  const verdict        = data.verdict || data.project_viability;
  const scores         = Object.entries(data).filter(([k,v]) => k.endsWith("_score") && typeof v === "number");
  const recommendation = data.recommendation || data.final_recommendation;
  const summary        = data.product_summary || data.core_problem_statement;
  const lists          = Object.entries(data).filter(([k,v]) => Array.isArray(v) && v.length && k !== "_meta");
  const textFields     = Object.entries(data).filter(([k,v]) => typeof v === "string" &&
    !["role","verdict","project_viability","recommendation","final_recommendation",
      "product_summary","core_problem_statement"].includes(k));
  const meta = data._meta;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      {(verdict || scores.length > 0) && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          flexWrap:"wrap", gap:12, padding:"14px 16px",
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
            <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
              {scores.map(([k,v]) => (
                <div key={k} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
                  <ScoreRing value={v} color={agent.color} size={50} />
                  <span style={{ fontSize:8, color:"#334155", textAlign:"center",
                    textTransform:"uppercase", letterSpacing:"0.1em",
                    fontFamily:"'IBM Plex Mono',monospace", maxWidth:54, lineHeight:1.3 }}>
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
          border:`1px solid ${agent.color}1a`, borderLeft:`3px solid ${agent.color}`,
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
            fontFamily:"'IBM Plex Mono',monospace" }}>Recommendation</div>
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
                letterSpacing:"0.1em", fontFamily:"'IBM Plex Mono',monospace" }}>{label}</span>
              <span style={{ fontSize:10, color:"#334155",
                fontFamily:"'IBM Plex Mono',monospace" }}>{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MobileAgentPanel ─────────────────────────────────────────────────────────

function MobileAgentPanel({ results, active, setActive }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div className="agent-tabs" style={{ display:"flex", gap:8, overflowX:"auto",
        paddingBottom:8, WebkitOverflowScrolling:"touch", scrollbarWidth:"none" }}>
        {AGENTS.filter(a => results[a.key]).map(agent => {
          const result  = results[agent.key];
          const verdict = result?.verdict || result?.project_viability;
          const isActive= active === agent.key;
          const vCfg    = VERDICT[verdict];
          return (
            <button key={agent.key} onClick={() => setActive(agent.key)}
              style={{ flexShrink:0, padding:"8px 14px",
                background:isActive?`${agent.color}14`:"#07070f",
                border:`1px solid ${isActive?agent.color:"#0f0f1c"}`,
                borderRadius:8, cursor:"pointer",
                display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                transition:"all .2s", minWidth:64 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:agent.color,
                boxShadow:isActive?`0 0 8px ${agent.color}`:"none" }} />
              <span style={{ fontSize:10, fontWeight:600,
                color:isActive?agent.color:"#475569",
                fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.05em" }}>
                {agent.short}
              </span>
              {verdict && vCfg && (
                <span style={{ fontSize:7, padding:"1px 5px", borderRadius:999,
                  background:vCfg.bg, border:`1px solid ${vCfg.b}`, color:vCfg.t,
                  fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase",
                  whiteSpace:"nowrap" }}>
                  {vCfg.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {active && (() => {
        const agent = AGENTS.find(a => a.key === active);
        if (!agent) return null;
        return (
          <div style={{ background:"#07070f", border:"1px solid #0f0f1c",
            borderRadius:12, overflow:"hidden" }}>
            <div style={{ padding:"12px 16px", borderBottom:"1px solid #0a0a14",
              background:`linear-gradient(135deg,${agent.color}06,transparent 60%)`,
              display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0,
                background:`${agent.color}10`, border:`1.5px solid ${agent.color}30`,
                display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:agent.color,
                  boxShadow:`0 0 8px ${agent.color}` }} />
              </div>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700,
                  fontSize:13, color:"#f1f5f9" }}>{agent.label}</div>
                <div style={{ fontSize:9, color:"#334155" }}>{agent.desc}</div>
              </div>
            </div>
            <div style={{ padding:"16px" }}>
              <AgentOutput agent={agent} data={results[active]} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────
// Smooth animated progress bar. Fills based on elapsed time estimate.

function ProgressBar({ progress }) {
  return (
    <div style={{ height:2, background:"#0a0a14", borderRadius:999, overflow:"hidden" }}>
      <div style={{
        height:"100%", borderRadius:999,
        background:"linear-gradient(90deg,#4338ca,#818cf8,#34d399)",
        width:`${progress}%`,
        transition:"width 1s linear",
        boxShadow:"0 0 8px rgba(99,102,241,0.5)",
      }} />
    </div>
  );
}

// ─── generatePDF ─────────────────────────────────────────────────────────────
// Generates a text report and triggers browser download

function downloadReport(idea, results) {
  const lines = [];
  lines.push("SPECFORGE — SOFTWARE REQUIREMENTS SPECIFICATION");
  lines.push("=".repeat(60));
  lines.push(`IDEA: ${idea}`);
  lines.push(`GENERATED: ${new Date().toLocaleString()}`);
  lines.push("");

  AGENTS.forEach(agent => {
    const data = results[agent.key];
    if (!data) return;
    lines.push("=".repeat(60));
    lines.push(`${agent.label.toUpperCase()}`);
    lines.push("-".repeat(40));

    const verdict = data.verdict || data.project_viability;
    if (verdict) lines.push(`VERDICT: ${(VERDICT[verdict]?.label || verdict).toUpperCase()}`);

    const summary = data.product_summary || data.core_problem_statement;
    if (summary) {
      lines.push("");
      lines.push(data.product_summary ? "PRODUCT SUMMARY:" : "PROBLEM STATEMENT:");
      lines.push(summary);
    }

    const rec = data.recommendation || data.final_recommendation;
    if (rec) {
      lines.push("");
      lines.push("RECOMMENDATION:");
      lines.push(rec);
    }

    Object.entries(data).forEach(([k, v]) => {
      if (Array.isArray(v) && v.length && k !== "_meta") {
        lines.push("");
        lines.push(`${k.replace(/_/g," ").toUpperCase()}:`);
        v.forEach(item => lines.push(`  • ${item}`));
      }
    });

    lines.push("");
  });

  const blob = new Blob([lines.join("\n")], { type:"text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `specforge-${idea.slice(0,30).replace(/\s+/g,"-").toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Home ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();
  const [phase, setPhase]         = useState("idle");
  const [idea, setIdea]           = useState("");
  const [statuses, setStatuses]   = useState({});
  const [results, setResults]     = useState({});
  const [active, setActive]       = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [focused, setFocused]     = useState(false);
  const [error, setError]         = useState(null);
  const [progress, setProgress]   = useState(0);
  const [activeAgentIdx, setActiveAgentIdx] = useState(0);
  const [isMobile, setIsMobile]   = useState(false);

  const textareaRef    = useRef(null);
  const timersRef      = useRef([]);
  const controllerRef  = useRef(null);
  const progressRef    = useRef(null);
  const startTimeRef   = useRef(null);

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push("/login");
    });
  }, []);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const completedCount = Object.values(statuses).filter(s => s === "done").length;

  // Smooth progress bar — runs during request, reaches ~90% then waits
  function startProgressBar() {
    const totalMs = 340000; // ~5.5 min estimate
    startTimeRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(90, (elapsed / totalMs) * 100);
      setProgress(pct);
      if (pct < 90) {
        progressRef.current = requestAnimationFrame(tick);
      }
    };
    progressRef.current = requestAnimationFrame(tick);
  }

  function stopProgressBar(complete = true) {
    if (progressRef.current) cancelAnimationFrame(progressRef.current);
    if (complete) setProgress(100);
  }

  // Sequential agent "thinking" animation while waiting for backend
  // Each agent pulses for its duration, then shows as "running" → next agent
  function startAgentAnimation() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    let cumulativeMs = 3500; // starts after wake-up ping (3s) + small buffer
    AGENTS.forEach((agent, i) => {
      const duration = AGENT_DURATIONS[i] * 1000;

      // Show this agent as "running"
      const t1 = setTimeout(() => {
        setActiveAgentIdx(i);
        setStatuses(prev => ({ ...prev, [agent.key]: "running" }));
      }, cumulativeMs);
      timersRef.current.push(t1);

      cumulativeMs += duration;
    });
  }

  // When real data arrives, animate agents completing one by one
  function animateResults(data) {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setStatuses({});

    AGENTS.forEach((agent, i) => {
      const agentData = data[KEY_MAP[agent.key]];
      if (!agentData) return;

      const t1 = setTimeout(() => {
        setStatuses(prev => ({ ...prev, [agent.key]: "running" }));
      }, i * 500);

      const t2 = setTimeout(() => {
        setStatuses(prev => ({ ...prev, [agent.key]: "done" }));
        setResults(prev => ({ ...prev, [agent.key]: agentData }));
        setActive(prev => prev || agent.key);
      }, i * 500 + 350);

      timersRef.current.push(t1, t2);
    });
  }

  const cancel = useCallback(() => {
    if (controllerRef.current) controllerRef.current.abort();
    timersRef.current.forEach(clearTimeout);
    stopProgressBar(false);
    setPhase("idle");
    setStatuses({});
    setResults({});
    setProgress(0);
    setActiveAgentIdx(0);
    setError("Analysis cancelled.");
  }, []);

  const submit = useCallback(async () => {
    if (!idea.trim() || phase === "running") return;

    setPhase("running");
    setStatuses({});
    setResults({});
    setActive(null);
    setProjectId(null);
    setError(null);
    setProgress(0);
    setActiveAgentIdx(0);

    controllerRef.current = new AbortController();
    startProgressBar();
    startAgentAnimation();

    try {
      // Wake up Render backend first
      try {
        await fetch(`${BACKEND}/`, { method:"GET" });
        await new Promise(r => setTimeout(r, 3000));
      } catch { /* ignore */ }

      const timeout = setTimeout(() => controllerRef.current?.abort(), 480000);

      const res = await fetch(`${BACKEND}/generate-spec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
        signal: controllerRef.current.signal,
      });

      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();

      stopProgressBar(true);
      animateResults(data);

      const totalDelay = (AGENTS.length - 1) * 500 + 500;
      const t = setTimeout(() => {
        setProjectId(data.project_id);
        setPhase("done");
      }, totalDelay);
      timersRef.current.push(t);

    } catch (err) {
      stopProgressBar(false);
      setProgress(0);
      if (err.name === "AbortError") {
        // Could be user cancel or timeout — only show error if not already cancelled
        if (phase !== "idle") {
          setError("Request timed out. Please try again.");
          setPhase("idle");
        }
      } else if (err.message?.includes("429")) {
        setError("Rate limit reached — 3 specs per hour. Try again later.");
        setPhase("idle");
      } else {
        setError("Connection failed. The backend may be waking up — wait 30s and try again.");
        setPhase("idle");
      }
      setStatuses({});
    }
  }, [idea, phase]);

  const reset = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    if (progressRef.current) cancelAnimationFrame(progressRef.current);
    setPhase("idle");
    setIdea("");
    setStatuses({});
    setResults({});
    setActive(null);
    setProjectId(null);
    setError(null);
    setProgress(0);
    setActiveAgentIdx(0);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const isIdle    = phase === "idle";
  const isRunning = phase === "running";
  const isDone    = phase === "done";
  const px        = isMobile ? "16px" : "32px";
  const currentAgent = AGENTS[activeAgentIdx];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html { scroll-behavior:smooth; }
        body { background:#05050a; color:#f1f5f9; font-family:'Inter',sans-serif; min-height:100vh; -webkit-font-smoothing:antialiased; }
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
          background-size:300% auto; -webkit-background-clip:text; background-clip:text;
          -webkit-text-fill-color:transparent; animation:shimmerFlow 5s linear infinite;
        }
        .dot-bg { background-image:radial-gradient(circle,#1e293b 1px,transparent 1px); background-size:28px 28px; }
        .glass { background:rgba(5,5,10,.9); backdrop-filter:blur(24px) saturate(1.3); -webkit-backdrop-filter:blur(24px) saturate(1.3); }
        .card { background:#07070f; border:1px solid #0f0f1c; border-radius:12px; }
        .agent-btn { border:none; background:transparent; cursor:pointer; width:100%; text-align:left; transition:background .15s; }
        .agent-btn:hover { background:#09090f; }
        .slide-up { animation:slideUp .45s cubic-bezier(.22,1,.36,1) forwards; }
        .fade-in  { animation:fadeIn .35s ease forwards; }
        .chip { border:1px solid #12122a; background:transparent; cursor:pointer; border-radius:999px; font-family:'Inter',sans-serif; transition:all .15s; }
        .chip:hover { background:#0d0d20; border-color:#6366f130; color:#818cf8 !important; }
        .qt-btn { border:1px solid #0f0f1c; background:#07070f; cursor:pointer; font-family:'IBM Plex Mono',monospace; border-radius:6px; transition:all .15s; }
        .qt-btn:hover { background:#0d0d1a; }
        .agent-tabs::-webkit-scrollbar { display:none; }
        .cancel-btn:hover { background:#1a0505 !important; border-color:#7f1d1d !important; }
        .dl-btn:hover { background:#0a1628 !important; border-color:#3b82f6 !important; }
      `}</style>

      <div className="dot-bg" style={{ position:"fixed", inset:0, zIndex:0, opacity:.35, pointerEvents:"none" }} />

      {!isMobile && (
        <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:-200, left:"28%", width:640, height:640,
            background:"radial-gradient(ellipse,rgba(99,102,241,.07) 0%,transparent 70%)",
            animation:"ambientDrift 9s ease infinite" }} />
          <div style={{ position:"absolute", top:"45%", right:-80, width:420, height:420,
            background:"radial-gradient(ellipse,rgba(167,139,250,.05) 0%,transparent 70%)",
            animation:"ambientDrift 12s ease infinite 3s" }} />
        </div>
      )}

      <div style={{ position:"relative", zIndex:1, minHeight:"100vh", paddingBottom:80 }}>

        {/* ── Navbar ── */}
        <nav className="glass" style={{
          position:"sticky", top:0, zIndex:200,
          borderBottom:"1px solid #0a0a14",
          display:"flex", flexDirection:"column",
        }}>
          <div style={{ height:54, display:"flex", alignItems:"center",
            justifyContent:"space-between", padding:`0 ${px}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800,
                fontSize:isMobile?15:17, letterSpacing:"-0.025em" }}>
                Spec<span style={{ color:"#6366f1", textShadow:"0 0 24px rgba(99,102,241,.5)" }}>Forge</span>
              </span>
              <span style={{ fontSize:8, padding:"2px 7px", borderRadius:4,
                background:"linear-gradient(135deg,#0d0a2e,#12103a)",
                border:"1px solid #2e1f8a40", color:"#818cf8",
                fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.1em" }}>BETA</span>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {/* Running state: show current agent name */}
              {isRunning && (
                <div style={{ display:"flex", alignItems:"center", gap:6,
                  padding:"4px 10px", background:"#0d0a28",
                  border:`1px solid ${currentAgent.color}30`, borderRadius:999 }}>
                  <span style={{ width:5, height:5, borderRadius:"50%",
                    background:currentAgent.color,
                    animation:"pulseGlow 1.5s ease infinite",
                    boxShadow:`0 0 8px ${currentAgent.color}`, display:"inline-block" }} />
                  <span style={{ fontSize:9, color:currentAgent.color,
                    fontFamily:"'IBM Plex Mono',monospace",
                    maxWidth:isMobile?100:180, overflow:"hidden",
                    textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {currentAgent.label} analysing
                  </span>
                </div>
              )}
              {isDone && (
                <div style={{ display:"flex", alignItems:"center", gap:6,
                  padding:"4px 10px", background:"#020d07",
                  border:"1px solid #16a34a40", borderRadius:999 }}>
                  <span style={{ width:5, height:5, borderRadius:"50%", background:"#34d399",
                    boxShadow:"0 0 8px #34d399", display:"inline-block" }} />
                  <span style={{ fontSize:9, color:"#34d399",
                    fontFamily:"'IBM Plex Mono',monospace" }}>
                    {completedCount}/6 complete
                  </span>
                </div>
              )}
              {!isMobile && !isRunning && !isDone && (
                <span style={{ fontSize:11, color:"#1e293b",
                  fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.05em" }}>
                  Multi-Agent SRS Generator
                </span>
              )}
            </div>
          </div>

          {/* Progress bar — only visible when running */}
          {isRunning && (
            <div style={{ padding:`0 ${px} 0` }}>
              <ProgressBar progress={progress} />
              <div style={{ height:6 }} />
            </div>
          )}
        </nav>

        <div style={{ maxWidth:1280, margin:"0 auto", padding:`0 ${px}` }}>

          {/* ── Hero ── */}
          <div style={{
            maxHeight:isIdle?700:0, opacity:isIdle?1:0, overflow:"hidden",
            transition:"max-height .6s cubic-bezier(.22,1,.36,1), opacity .4s ease",
          }}>
            <div style={{ paddingTop:isMobile?40:76, paddingBottom:36 }} className="slide-up">
              <div style={{ display:"inline-flex", alignItems:"center", gap:8,
                padding:"6px 14px", background:"linear-gradient(135deg,#07051a,#0a0820)",
                border:"1px solid #2d1f6e50", borderRadius:999, marginBottom:24,
                boxShadow:"0 0 24px rgba(99,102,241,.1)" }}>
                <span style={{ display:"flex", gap:3 }}>
                  {AGENTS.slice(0,5).map((a,i) => (
                    <span key={i} style={{ width:4, height:4, borderRadius:"50%",
                      background:a.color, boxShadow:`0 0 6px ${a.color}`, display:"inline-block" }} />
                  ))}
                </span>
                <span style={{ fontSize:isMobile?9:10, color:"#818cf8",
                  fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.08em" }}>
                  5 AI AGENTS · DEBATE MODE · RAG-GROUNDED
                </span>
              </div>

              <h1 style={{ fontFamily:"'Syne',sans-serif",
                fontSize:isMobile?"clamp(32px,8vw,48px)":"clamp(34px,5.4vw,70px)",
                fontWeight:800, lineHeight:1.05, letterSpacing:"-0.03em", marginBottom:16 }}>
                Your idea, stress&#8209;tested<br />
                <span className="shimmer">from every angle</span>
              </h1>

              <p style={{ fontSize:isMobile?13:15, color:"#475569",
                maxWidth:520, lineHeight:1.7, marginBottom:24 }}>
                Five AI specialists debate your product idea and synthesize a complete
                Software Requirements Specification — with MVP scope, security analysis,
                and implementation priorities.
              </p>

              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
                {AGENTS.slice(0,5).map(a => (
                  <span key={a.key} style={{ display:"inline-flex", alignItems:"center",
                    gap:5, fontSize:isMobile?9:10, padding:"4px 10px", borderRadius:999,
                    background:`${a.color}0d`, border:`1px solid ${a.color}25`, color:a.color,
                    fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.04em" }}>
                    <span style={{ width:4, height:4, borderRadius:"50%",
                      background:a.color, boxShadow:`0 0 6px ${a.color}` }} />
                    {isMobile ? a.short : a.label}
                  </span>
                ))}
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                <span style={{ fontSize:10, color:"#1e293b",
                  fontFamily:"'IBM Plex Mono',monospace" }}>TRY →</span>
                {EXAMPLES.map((e,i) => (
                  <button key={i} className="chip"
                    onClick={() => { setIdea(e); textareaRef.current?.focus(); }}
                    style={{ fontSize:isMobile?9:10, padding:"4px 10px", color:"#334155" }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Input ── */}
          <div style={{ paddingTop:isIdle?0:20, paddingBottom:16, transition:"padding .5s ease" }}>
            <div style={{ borderRadius:14, padding:1,
              background:focused?"linear-gradient(135deg,#4338ca,#7c3aed,#4338ca)":"#0f0f1c",
              transition:"background .3s, box-shadow .3s",
              boxShadow:focused?"0 0 32px rgba(99,102,241,.18)":"none" }}>
              <div style={{ borderRadius:13, background:"#08081a", overflow:"hidden" }}>
                <textarea
                  ref={textareaRef}
                  value={idea}
                  onChange={e => setIdea(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={e => { if (e.key==="Enter" && (e.metaKey||e.ctrlKey)) submit(); }}
                  placeholder={isIdle?"Describe your product idea...":"Analyse another idea..."}
                  rows={isIdle?(isMobile?3:4):2}
                  style={{ width:"100%", background:"transparent", border:"none", outline:"none",
                    resize:"none", fontFamily:"'Inter',sans-serif",
                    fontSize:isMobile?15:14, lineHeight:1.7, color:"#e2e8f0", caretColor:"#6366f1",
                    padding:isIdle?(isMobile?"16px 16px 50px 16px":"18px 18px 56px 18px"):"14px 16px",
                    transition:"padding .45s ease", WebkitAppearance:"none" }}
                />
                {isIdle && (
                  <div style={{ padding:"8px 16px", borderTop:"1px solid #0d0d1a",
                    display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    {!isMobile ? (
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        {["⌘","↵"].map((k,i) => (
                          <kbd key={i} style={{ fontSize:10, padding:"2px 7px", background:"#07070f",
                            border:"1px solid #0f0f1c", borderRadius:4, color:"#1e293b",
                            fontFamily:"'IBM Plex Mono',monospace" }}>{k}</kbd>
                        ))}
                        <span style={{ fontSize:10, color:"#1e293b" }}>to submit</span>
                      </div>
                    ) : <span />}
                    <span style={{ fontSize:10, color:"#1e293b",
                      fontFamily:"'IBM Plex Mono',monospace" }}>
                      {idea.length > 0 ? `${idea.length} chars` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Buttons row */}
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>

              {/* Cancel button — only when running */}
              {isRunning && (
                <button onClick={cancel} className="cancel-btn"
                  style={{ padding:isMobile?"12px 20px":"9px 18px",
                    background:"#0f0008", border:"1px solid #7f1d1d",
                    borderRadius:9, color:"#f87171",
                    fontSize:isMobile?13:12, fontWeight:600,
                    cursor:"pointer", transition:"all .2s",
                    display:"inline-flex", alignItems:"center", gap:6,
                    fontFamily:"'Inter',sans-serif",
                    flex:isMobile?"1":"none" }}>
                  <span style={{ fontSize:10 }}>✕</span> Stop
                </button>
              )}

              {/* Generate / Analysing button */}
              {!isRunning && (
                <button onClick={submit}
                  disabled={!idea.trim()}
                  style={{ padding:isMobile?"12px 24px":"9px 22px",
                    background: "linear-gradient(135deg,#4338ca,#6d28d9)",
                    border:"1px solid #5b4dcc", borderRadius:9, color:"#fff",
                    fontSize:isMobile?14:12, fontWeight:600,
                    opacity:!idea.trim()?.45:1,
                    cursor:!idea.trim()?"not-allowed":"pointer",
                    transition:"all .2s",
                    display:"inline-flex", alignItems:"center", gap:8,
                    boxShadow:"0 0 22px rgba(99,102,241,.28)",
                    fontFamily:"'Inter',sans-serif",
                    width:isMobile?"100%":"auto",
                    justifyContent:isMobile?"center":"flex-start" }}>
                  Generate Spec →
                </button>
              )}

              {isRunning && !isMobile && (
                <div style={{ display:"flex", alignItems:"center", gap:8,
                  padding:"9px 18px", background:"#0d0a28",
                  border:"1px solid #1e1b4b", borderRadius:9,
                  fontSize:12, color:"#4338ca",
                  fontFamily:"'Inter',sans-serif" }}>
                  <span style={{ width:11, height:11, borderRadius:"50%",
                    border:"2px solid #1e1b4b", borderTopColor:"#818cf8",
                    animation:"spin .7s linear infinite", display:"inline-block" }} />
                  Analysing
                </div>
              )}
            </div>
          </div>

          {/* ── Error banner ── */}
          {error && (
            <div className="slide-up" style={{ marginBottom:16, padding:"12px 16px",
              background:"#0f0008", border:"1px solid #7f1d1d", borderRadius:10,
              display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ color:"#f87171", fontSize:14, flexShrink:0 }}>⚠</span>
              <span style={{ fontSize:12, color:"#fca5a5", lineHeight:1.5 }}>{error}</span>
              <button onClick={() => setError(null)}
                style={{ marginLeft:"auto", background:"none", border:"none",
                  color:"#7f1d1d", cursor:"pointer", fontSize:16, flexShrink:0 }}>×</button>
            </div>
          )}

          {/* ── Agent Pipeline ── */}
          <div style={{
            maxHeight:isIdle?0:140, opacity:isIdle?0:1,
            overflow:"hidden", transition:"max-height .5s ease, opacity .4s ease",
            marginBottom:isIdle?0:16,
          }}>
            <div className="card" style={{ padding:isMobile?"14px 16px":"18px 24px" }}>
              <div style={{ display:"flex", alignItems:"center", marginBottom:12 }}>
                <span style={{ fontSize:8, fontWeight:700, color:"#1e293b",
                  textTransform:"uppercase", letterSpacing:"0.14em",
                  fontFamily:"'IBM Plex Mono',monospace" }}>Agent Pipeline</span>
                <div style={{ flex:1, height:1, background:"#0a0a14", margin:"0 10px" }} />
                <span style={{ fontSize:9, color:"#1e293b",
                  fontFamily:"'IBM Plex Mono',monospace" }}>{completedCount}/6</span>
              </div>
              <div style={{ display:"flex", alignItems:"center" }}>
                {AGENTS.map((agent,i) => {
                  const s = statuses[agent.key];
                  const isRun = s === "running";
                  const isDn  = s === "done";
                  const nodeSize = isMobile?30:36;
                  return (
                    <div key={agent.key} style={{ display:"flex", alignItems:"center", flex:1, minWidth:0 }}>
                      <button onClick={() => isDn && setActive(agent.key)}
                        style={{ display:"flex", flexDirection:"column", alignItems:"center",
                          gap:4, flex:1, padding:"2px", border:"none",
                          background:"transparent", cursor:isDn?"pointer":"default" }}>
                        <div style={{ position:"relative" }}>
                          {isRun && (
                            <div style={{ position:"absolute", inset:-4, borderRadius:"50%",
                              border:`1px solid ${agent.color}35`,
                              animation:"pulseGlow 2s ease infinite" }} />
                          )}
                          <div style={{ width:nodeSize, height:nodeSize, borderRadius:"50%",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            background:isDn?`${agent.color}14`:isRun?"#100c00":"#07070f",
                            border:`2px solid ${isDn?agent.color:isRun?"#f59e0b":"#0f0f1c"}`,
                            transition:"all .4s cubic-bezier(.22,1,.36,1)",
                            boxShadow:isDn?`0 0 14px ${agent.glow}`:isRun?"0 0 10px rgba(245,158,11,.28)":"none",
                            ...(isDn?{animation:"popIn .4s cubic-bezier(.22,1,.36,1)"}:{}) }}>
                            {isDn
                              ? <span style={{ color:agent.color, fontSize:isMobile?11:13, fontWeight:700 }}>✓</span>
                              : isRun
                              ? <span style={{ width:6, height:6, borderRadius:"50%",
                                  background:"#f59e0b", display:"block",
                                  animation:"pulseGlow 1s ease infinite" }} />
                              : <span style={{ color:"#1e293b", fontSize:9, fontWeight:600,
                                  fontFamily:"'IBM Plex Mono',monospace" }}>{i+1}</span>
                            }
                          </div>
                        </div>
                        <span style={{ fontSize:isMobile?7:8, fontWeight:600,
                          fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.05em",
                          color:isDn?agent.color:isRun?"#f59e0b":"#1e293b",
                          transition:"color .3s", whiteSpace:"nowrap" }}>
                          {agent.short}
                        </span>
                      </button>
                      {i < AGENTS.length-1 && (
                        <div style={{ flex:"0 0 10px", height:1, background:"#0a0a14",
                          position:"relative", overflow:"hidden" }}>
                          <div style={{ position:"absolute", inset:0,
                            background:isDn?agent.color:"transparent",
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
            <div className="fade-in" style={{ marginBottom:32 }}>
              {isMobile ? (
                <MobileAgentPanel results={results} active={active} setActive={setActive} />
              ) : (
                <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:14 }}>
                  {/* Sidebar */}
                  <div className="card" style={{ overflow:"hidden",
                    position:"sticky", top:66, height:"fit-content" }}>
                    <div style={{ padding:"11px 15px", borderBottom:"1px solid #0a0a14",
                      display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:8, fontWeight:700, color:"#1e293b",
                        textTransform:"uppercase", letterSpacing:"0.14em",
                        fontFamily:"'IBM Plex Mono',monospace" }}>Agents</span>
                      <span style={{ fontSize:9, color:"#1e293b",
                        fontFamily:"'IBM Plex Mono',monospace" }}>
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
                            <div style={{ width:6, height:6, borderRadius:"50%",
                              background:agent.color, flexShrink:0,
                              boxShadow:isActive?`0 0 8px ${agent.color}`:"none",
                              transition:"box-shadow .2s" }} />
                            <span style={{ fontSize:11, fontWeight:500,
                              color:isActive?"#e2e8f0":"#475569",
                              transition:"color .15s", lineHeight:1.2 }}>
                              {agent.label}
                            </span>
                          </div>
                          {verdict && vCfg && (
                            <div style={{ marginLeft:14 }}>
                              <span style={{ display:"inline-flex", alignItems:"center", gap:4,
                                fontSize:8, padding:"2px 8px", borderRadius:999,
                                background:vCfg.bg, border:`1px solid ${vCfg.b}`,
                                color:vCfg.t, fontWeight:700, letterSpacing:"0.08em",
                                textTransform:"uppercase" }}>
                                <span style={{ width:3, height:3, borderRadius:"50%",
                                  background:vCfg.t }} />
                                {vCfg.label}
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
                              <span style={{ width:10, height:10, borderRadius:"50%",
                                background:agent.color,
                                boxShadow:`0 0 10px ${agent.color},0 0 22px ${agent.color}60` }} />
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700,
                                fontSize:14, color:"#f1f5f9", letterSpacing:"-0.015em" }}>
                                {agent.label}
                              </div>
                              <div style={{ fontSize:10, color:"#334155", marginTop:2 }}>
                                {agent.desc}
                              </div>
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
            </div>
          )}

          {/* ── Completion banner ── */}
          <div style={{
            maxHeight:isDone?160:0, opacity:isDone?1:0,
            overflow:"hidden", transition:"max-height .5s ease, opacity .4s ease",
            marginBottom:isDone?32:0,
          }}>
            <div style={{ padding:isMobile?"14px 16px":"16px 24px",
              background:"linear-gradient(135deg,#020d07,#030f08)",
              border:"1px solid #16a34a25", borderRadius:12,
              display:"flex", alignItems:"center",
              flexDirection:isMobile?"column":"row",
              gap:12, justifyContent:"space-between",
              boxShadow:"0 0 32px rgba(52,211,153,.04)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:32, height:32, borderRadius:"50%", background:"#052e16",
                  border:"1px solid #16a34a40", display:"flex", alignItems:"center",
                  justifyContent:"center", flexShrink:0,
                  boxShadow:"0 0 16px rgba(52,211,153,.18)" }}>
                  <span style={{ color:"#4ade80", fontSize:14 }}>✓</span>
                </div>
                <div>
                  <p style={{ fontSize:13, fontWeight:600, color:"#4ade80" }}>
                    Specification generated &amp; saved
                  </p>
                  {projectId && (
                    <p style={{ fontSize:9, color:"#166534", marginTop:3,
                      fontFamily:"'IBM Plex Mono',monospace", wordBreak:"break-all" }}>
                      PROJECT_ID: {projectId}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display:"flex", gap:8, width:isMobile?"100%":"auto",
                flexDirection:isMobile?"column":"row" }}>

                {/* Download report button */}
                <button onClick={() => downloadReport(idea, results)}
                  className="dl-btn"
                  style={{ fontSize:11, padding:"8px 16px", background:"#04081a",
                    border:"1px solid #1e3a5f", color:"#60a5fa", borderRadius:7,
                    cursor:"pointer", fontFamily:"'Inter',sans-serif",
                    transition:"all .15s", display:"inline-flex",
                    alignItems:"center", gap:6,
                    width:isMobile?"100%":"auto",
                    justifyContent:isMobile?"center":"flex-start" }}>
                  ↓ Download Report
                </button>

                <button onClick={reset}
                  style={{ fontSize:11, padding:"8px 20px", background:"transparent",
                    border:"1px solid #16a34a30", color:"#4ade80", borderRadius:7,
                    cursor:"pointer", fontFamily:"'Inter',sans-serif",
                    width:isMobile?"100%":"auto",
                    justifyContent:isMobile?"center":"flex-start",
                    display:"inline-flex", alignItems:"center",
                    transition:"all .15s" }}
                  onMouseEnter={e => { e.currentTarget.style.background="#052e16"; e.currentTarget.style.borderColor="#16a34a60"; }}
                  onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="#16a34a30"; }}>
                  New Analysis →
                </button>
              </div>
            </div>
          </div>

          {/* ── Feature cards ── */}
          <div style={{
            maxHeight:isIdle?600:0, opacity:isIdle?1:0,
            overflow:"hidden", transition:"max-height .6s ease, opacity .4s ease",
          }}>
            <div style={{
              display:"grid",
              gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",
              gap:12, paddingTop:4 }}>
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
                <div key={i} className="card" style={{ padding:"18px 20px" }}>
                  <div style={{ display:"flex", alignItems:"flex-start",
                    justifyContent:"space-between", marginBottom:12 }}>
                    <span style={{ fontSize:20, color:card.color,
                      textShadow:`0 0 18px ${card.color}60` }}>{card.icon}</span>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap", justifyContent:"flex-end" }}>
                      {card.tags.map(t => (
                        <span key={t} style={{ fontSize:7, padding:"2px 6px",
                          background:`${card.color}0d`, border:`1px solid ${card.color}20`,
                          color:card.color, borderRadius:4,
                          fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.06em" }}>{t}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700,
                    fontSize:13, color:"#94a3b8", marginBottom:8 }}>
                    {card.title}
                  </div>
                  <div style={{ fontSize:12, color:"#334155", lineHeight:1.65 }}>
                    {card.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}