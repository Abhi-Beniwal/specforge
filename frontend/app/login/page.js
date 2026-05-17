"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #05050a; font-family: 'Inter', sans-serif; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) forwards; }
        .dot-bg {
          background-image: radial-gradient(circle, #1e293b 1px, transparent 1px);
          background-size: 28px 28px;
        }
        input:focus { outline: none; }
        button:focus { outline: none; }
      `}</style>

      <div className="dot-bg" style={{ minHeight:"100vh", display:"flex",
        alignItems:"center", justifyContent:"center", padding:24 }}>

        {/* Ambient glow */}
        <div style={{ position:"fixed", top:"20%", left:"50%", transform:"translateX(-50%)",
          width:500, height:400, pointerEvents:"none",
          background:"radial-gradient(ellipse, rgba(99,102,241,0.08) 0%, transparent 70%)" }} />

        <div className="fade-up" style={{ width:"100%", maxWidth:400, position:"relative" }}>

          {/* Logo */}
          <div style={{ textAlign:"center", marginBottom:32 }}>
            <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800,
              fontSize:24, letterSpacing:"-0.025em" }}>
              Spec<span style={{ color:"#6366f1",
                textShadow:"0 0 24px rgba(99,102,241,0.5)" }}>Forge</span>
            </span>
            <p style={{ fontSize:13, color:"#475569", marginTop:6 }}>
              Sign in to your account
            </p>
          </div>

          {/* Card */}
          <div style={{ background:"#07070f", border:"1px solid #0f0f1c",
            borderRadius:16, padding:32 }}>

            <form onSubmit={handleLogin}>
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                {/* Email */}
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:"#475569",
                    textTransform:"uppercase", letterSpacing:"0.08em",
                    display:"block", marginBottom:6 }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    style={{ width:"100%", background:"#05050a",
                      border:"1px solid #0f0f1c", borderRadius:8,
                      padding:"10px 14px", fontSize:13, color:"#e2e8f0",
                      transition:"border-color 0.2s" }}
                    onFocus={e => e.target.style.borderColor = "#4338ca"}
                    onBlur={e => e.target.style.borderColor = "#0f0f1c"}
                  />
                </div>

                {/* Password */}
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:"#475569",
                    textTransform:"uppercase", letterSpacing:"0.08em",
                    display:"block", marginBottom:6 }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{ width:"100%", background:"#05050a",
                      border:"1px solid #0f0f1c", borderRadius:8,
                      padding:"10px 14px", fontSize:13, color:"#e2e8f0",
                      transition:"border-color 0.2s" }}
                    onFocus={e => e.target.style.borderColor = "#4338ca"}
                    onBlur={e => e.target.style.borderColor = "#0f0f1c"}
                  />
                </div>

                {/* Error */}
                {error && (
                  <div style={{ padding:"10px 14px", background:"#0f0008",
                    border:"1px solid #7f1d1d", borderRadius:8,
                    fontSize:12, color:"#fca5a5" }}>
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button type="submit" disabled={loading}
                  style={{ width:"100%", padding:"11px",
                    background: loading
                      ? "#0d0a28"
                      : "linear-gradient(135deg, #4338ca, #6d28d9)",
                    border:"1px solid #5b4dcc", borderRadius:8,
                    color: loading ? "#4338ca" : "#fff",
                    fontSize:13, fontWeight:600, cursor: loading ? "not-allowed" : "pointer",
                    transition:"all 0.2s", marginTop:4,
                    boxShadow: loading ? "none" : "0 0 20px rgba(99,102,241,0.25)" }}>
                  {loading ? "Signing in..." : "Sign In →"}
                </button>

              </div>
            </form>

            {/* Divider */}
            <div style={{ display:"flex", alignItems:"center", gap:12, margin:"20px 0" }}>
              <div style={{ flex:1, height:1, background:"#0f0f1c" }} />
              <span style={{ fontSize:11, color:"#1e293b" }}>OR</span>
              <div style={{ flex:1, height:1, background:"#0f0f1c" }} />
            </div>

            {/* Link to signup */}
            <p style={{ textAlign:"center", fontSize:12, color:"#475569" }}>
              Don&apos;t have an account?{" "}
              <a href="/signup" style={{ color:"#818cf8", textDecoration:"none",
                fontWeight:500 }}
                onMouseEnter={e => e.target.style.textDecoration = "underline"}
                onMouseLeave={e => e.target.style.textDecoration = "none"}>
                Create one
              </a>
            </p>

          </div>
        </div>
      </div>
    </>
  );
}