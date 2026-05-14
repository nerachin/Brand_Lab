"use client";

import { useState, useEffect, useRef } from "react";
import {
  Play, Check, AlertCircle, Loader2, ChevronDown, ChevronRight,
  Copy, RefreshCw, FileText, Sparkles, Lock, Download, Upload, Trash2,
  ChevronsRight, BookOpen, GraduationCap, Zap, MessageSquare, Crown,
  ArrowLeft, Send, Save, User, Plus, Trophy, Eye, GitBranch
} from "lucide-react";
import { AGENTS, buildBriefBlock } from "@/lib/agents";

// =============================================================
// API CLIENT HELPERS
// =============================================================

function getStoredPassword() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("brandlab_password") || "";
}

async function api(path, body) {
  const password = getStoredPassword();
  const headers = { "Content-Type": "application/json" };
  if (password) headers["x-team-password"] = password;
  const res = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    throw new Error("AUTH_REQUIRED");
  }
  if (!res.ok) {
    const text = await res.text();
    let msg;
    try { msg = JSON.parse(text).error; } catch { msg = text; }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

async function callClaude(mode, params) {
  return api("/api/claude", { mode, ...params });
}

async function callStorage(action, params = {}) {
  return api("/api/storage", { action, ...params });
}

// =============================================================
// MARKDOWN RENDERER
// =============================================================

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineFormat(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code style="font-family: \'JetBrains Mono\', monospace; background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 3px; font-size: 0.9em;">$1</code>');
}

function MarkdownView({ content }) {
  if (!content) return null;
  const lines = content.split("\n");
  const elements = [];
  let listBuffer = [];
  let tableBuffer = [];
  let inTable = false;

  const flushList = () => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} style={{ listStyle: "disc", paddingLeft: 20, marginBottom: 12 }}>
          {listBuffer.map((item, i) => (
            <li key={i} style={{ marginBottom: 5, lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
          ))}
        </ul>
      );
      listBuffer = [];
    }
  };

  const flushTable = () => {
    if (tableBuffer.length > 0) {
      const [headerRow, _sep, ...bodyRows] = tableBuffer;
      const headers = headerRow.split("|").map((s) => s.trim()).filter((s) => s.length > 0);
      const rows = bodyRows
        .filter((r) => r.includes("|"))
        .map((r) => r.split("|").map((s) => s.trim()).filter((s, idx, arr) => !(idx === 0 && s === "") && !(idx === arr.length - 1 && s === "")));
      elements.push(
        <div key={`tbl-${elements.length}`} style={{ overflowX: "auto", marginBottom: 16 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9em" }}>
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i} style={{ borderBottom: "2px solid var(--ink)", padding: "8px 10px", textAlign: "left", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.82em", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }} dangerouslySetInnerHTML={{ __html: inlineFormat(h) }} />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ borderBottom: "1px solid var(--border)", padding: "8px 10px", verticalAlign: "top", lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: inlineFormat(cell) }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableBuffer = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList();
      tableBuffer.push(trimmed);
      inTable = true;
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(<h1 key={i} style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "1.55rem", fontWeight: 600, marginTop: "1.5rem", marginBottom: "0.65rem", color: "var(--ink)", letterSpacing: "-0.01em" }} dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />);
    } else if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(<h2 key={i} style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "1.18rem", fontWeight: 600, marginTop: "1.15rem", marginBottom: "0.45rem", color: "var(--ink)" }} dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(3)) }} />);
    } else if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(<h3 key={i} style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "1.02rem", fontWeight: 600, marginTop: "0.95rem", marginBottom: "0.35rem", color: "var(--clay)" }} dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(4)) }} />);
    } else if (trimmed.startsWith("> ")) {
      flushList();
      elements.push(<blockquote key={i} style={{ borderLeft: "3px solid var(--clay)", paddingLeft: "0.9rem", fontStyle: "italic", margin: "0.65rem 0", color: "var(--ink-soft)", fontSize: "1.04em", lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />);
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listBuffer.push(trimmed.slice(2));
    } else if (trimmed === "---") {
      flushList();
      elements.push(<hr key={i} style={{ border: 0, borderTop: "1px solid var(--border)", margin: "1.5rem 0" }} />);
    } else if (trimmed === "") {
      flushList();
    } else {
      flushList();
      elements.push(<p key={i} style={{ marginBottom: "0.55rem", lineHeight: 1.6, color: "var(--ink-soft)" }} dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed) }} />);
    }
  }
  flushList();
  flushTable();
  return <div>{elements}</div>;
}

// =============================================================
// COMPONENTS
// =============================================================

function Header({ user, onSignOut }) {
  return (
    <header style={{ background: "var(--ink)", color: "var(--bone)", padding: "18px 28px", borderBottom: "1px solid var(--ink)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.2em", color: "var(--clay-soft)", marginBottom: 4, textTransform: "uppercase" }}>
            KELLOGG–SCHULICH EMBA · DESIGNING BRAND EXPERIENCES
          </div>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1, margin: 0, color: "var(--bone)" }}>
            Brand <span style={{ fontStyle: "italic", color: "var(--clay-soft)" }}>Lab</span>
          </h1>
          <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontStyle: "italic", fontSize: 14, color: "var(--clay-soft)", marginTop: 6 }}>
            Your team optimizes each section. The professor picks what ships.
          </div>
        </div>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13, color: "var(--clay-soft)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: "0.05em" }}>
              <User size={13} /> {user.handle}
            </div>
            <button
              onClick={onSignOut}
              style={{ background: "transparent", border: "1px solid var(--warm-gray)", color: "var(--clay-soft)", padding: "5px 10px", cursor: "pointer", fontSize: 10, letterSpacing: "0.06em" }}
            >
              CHANGE
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function PasswordGate({ onSubmit, error }) {
  const [password, setPassword] = useState("");
  return (
    <div style={{ minHeight: "100vh", background: "var(--bone)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="fade-in" style={{ background: "var(--paper)", maxWidth: 420, width: "100%", padding: "32px 36px", border: "1px solid var(--ink)" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.2em", color: "var(--clay)", marginBottom: 12, textTransform: "uppercase" }}>
          TEAM ACCESS
        </div>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 26, fontWeight: 600, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
          Enter team password
        </h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
          Your team set a shared password to keep this workspace private. Get it from whoever deployed the app.
        </p>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && password.trim()) onSubmit(password.trim()); }}
          placeholder="Team password"
          style={{ width: "100%", background: "var(--bone)", border: "1px solid var(--border)", padding: "10px 12px", fontSize: 16, color: "var(--ink)", outline: "none", marginBottom: 14 }}
        />
        {error && (
          <div style={{ color: "var(--rose)", fontSize: 13, marginBottom: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>
            {error}
          </div>
        )}
        <button
          onClick={() => password.trim() && onSubmit(password.trim())}
          disabled={!password.trim()}
          style={{ background: password.trim() ? "var(--ink)" : "var(--border)", color: password.trim() ? "var(--bone)" : "var(--warm-gray)", border: "none", padding: "11px 22px", cursor: password.trim() ? "pointer" : "not-allowed", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", width: "100%" }}
        >
          UNLOCK
        </button>
      </div>
    </div>
  );
}

function OnboardingModal({ onSubmit }) {
  const [handle, setHandle] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div className="fade-in" style={{ background: "var(--bone)", maxWidth: 460, width: "100%", padding: "32px 36px", border: "1px solid var(--ink)" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.2em", color: "var(--clay)", marginBottom: 12, textTransform: "uppercase" }}>
          WELCOME TO THE STUDIO
        </div>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 26, fontWeight: 600, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
          What's your name?
        </h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
          Your name gets attached to drafts you save, so the team can see who contributed what. First name or handle — your call.
        </p>
        <input
          autoFocus
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && handle.trim()) onSubmit(handle.trim()); }}
          placeholder="e.g. Sarah"
          style={{ width: "100%", background: "var(--paper)", border: "1px solid var(--border)", padding: "10px 12px", fontSize: 16, color: "var(--ink)", outline: "none", marginBottom: 16 }}
        />
        <button
          onClick={() => handle.trim() && onSubmit(handle.trim())}
          disabled={!handle.trim()}
          style={{ background: handle.trim() ? "var(--ink)" : "var(--border)", color: handle.trim() ? "var(--bone)" : "var(--warm-gray)", border: "none", padding: "11px 22px", cursor: handle.trim() ? "pointer" : "not-allowed", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", width: "100%" }}
        >
          ENTER THE LAB →
        </button>
      </div>
    </div>
  );
}

function TabNav({ active, onChange, briefReady, anyDrafts }) {
  const tabs = [
    { id: "brief", label: "01 / Brief", icon: FileText, disabled: false },
    { id: "pipeline", label: "02 / Run Agents", icon: Zap, disabled: !briefReady },
    { id: "export", label: "03 / Export Deck", icon: BookOpen, disabled: !anyDrafts }
  ];

  return (
    <nav style={{ background: "var(--bone-light)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", padding: "0 28px" }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => !t.disabled && onChange(t.id)}
              disabled={t.disabled}
              style={{ padding: "15px 18px", background: "transparent", border: "none", borderBottom: isActive ? "2px solid var(--clay)" : "2px solid transparent", color: t.disabled ? "var(--border)" : isActive ? "var(--ink)" : "var(--ink-soft)", cursor: t.disabled ? "not-allowed" : "pointer", fontSize: 12, fontWeight: isActive ? 600 : 500, display: "flex", alignItems: "center", gap: 8, marginRight: 6, letterSpacing: "0.04em" }}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function BriefForm({ brief, briefMeta, user, onSave, onContinue }) {
  const [local, setLocal] = useState(brief);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(brief); }, [brief]);

  const labelStyle = { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)", fontWeight: 600, marginBottom: 5, display: "block" };
  const inputStyle = { width: "100%", background: "var(--paper)", border: "1px solid var(--border)", padding: "10px 12px", fontSize: 15, color: "var(--ink)", outline: "none", boxSizing: "border-box" };

  const update = (field) => (e) => setLocal({ ...local, [field]: e.target.value });
  const ready = local.productIdea && local.industry && local.incumbentName && local.disruptionVector;
  const dirty = JSON.stringify(local) !== JSON.stringify(brief);

  const save = async () => {
    setSaving(true);
    try { await onSave(local); }
    catch (e) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fade-in" style={{ maxWidth: 880, margin: "0 auto", padding: "36px 28px" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--clay)", letterSpacing: "0.2em", marginBottom: 8, textTransform: "uppercase" }}>
          STEP 01 · LOCK THE SHARED BRIEF
        </div>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 600, margin: "0 0 10px", letterSpacing: "-0.01em" }}>
          One brief. <em style={{ color: "var(--clay)" }}>Everybody reads it.</em>
        </h2>
        <p style={{ fontSize: 16, color: "var(--ink-soft)", maxWidth: 640, lineHeight: 1.6 }}>
          This is the single source of truth. Every agent — and every teammate working with them — reads this. Industry drift here cascades into nine confused slides.
        </p>
        {briefMeta?.lastEditedBy && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--warm-gray)", marginTop: 14, letterSpacing: "0.05em" }}>
            LAST EDITED BY <span style={{ color: "var(--clay)", fontWeight: 600 }}>{briefMeta.lastEditedBy}</span> · {new Date(briefMeta.lastEditedAt).toLocaleString()}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 22 }}>
        <div>
          <label style={labelStyle}>Product idea *</label>
          <textarea value={local.productIdea || ""} onChange={update("productIdea")} rows={3} placeholder="One paragraph: what it is, who it's for, why now." style={inputStyle} />
        </div>

        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label style={labelStyle}>Industry *</label>
            <input value={local.industry || ""} onChange={update("industry")} placeholder="e.g. Premium fruit juice" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Named incumbent *</label>
            <input value={local.incumbentName || ""} onChange={update("incumbentName")} placeholder="e.g. Tropicana" style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Disruption vector *</label>
          <select value={local.disruptionVector || ""} onChange={update("disruptionVector")} style={inputStyle}>
            <option value="">Choose one…</option>
            <option value="cost">Cost</option>
            <option value="access">Access</option>
            <option value="experience">Experience</option>
            <option value="ethics">Ethics</option>
            <option value="distribution">Distribution</option>
            <option value="business model">Business model</option>
          </select>
        </div>

        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label style={labelStyle}>Launch market / geography</label>
            <input value={local.geography || ""} onChange={update("geography")} placeholder="e.g. Canada · launch year" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Horizon</label>
            <input value={local.horizon || ""} onChange={update("horizon")} placeholder="e.g. Launch year + 3-year outlook" style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Founder story <span style={{ color: "var(--warm-gray)", textTransform: "none", letterSpacing: 0 }}>(optional, feeds the Credo)</span></label>
          <textarea value={local.founderStory || ""} onChange={update("founderStory")} rows={4} placeholder="The lived tension: frustration, gap, conviction that something better was possible." style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Additional context <span style={{ color: "var(--warm-gray)", textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
          <textarea value={local.notes || ""} onChange={update("notes")} rows={2} placeholder="Anything else agents should know — competitive context, regulatory constraints, brand name preferences." style={inputStyle} />
        </div>
      </div>

      <div style={{ marginTop: 28, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--warm-gray)", fontStyle: "italic" }}>
          {!ready ? "Fill the four required fields to continue." : dirty ? "You have unsaved changes." : "Brief saved. Ready to run agents."}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {dirty && (
            <button
              onClick={save}
              disabled={!ready || saving}
              style={{ background: ready ? "var(--clay)" : "var(--border)", color: ready ? "var(--bone)" : "var(--warm-gray)", border: "none", padding: "11px 22px", cursor: ready && !saving ? "pointer" : "not-allowed", fontSize: 12, display: "flex", alignItems: "center", gap: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              {saving ? <Loader2 size={13} className="spin-icon" /> : <Save size={13} />}
              {saving ? "SAVING…" : "SAVE BRIEF FOR EVERYONE"}
            </button>
          )}
          <button
            onClick={onContinue}
            disabled={!ready || dirty}
            style={{ background: ready && !dirty ? "var(--ink)" : "var(--border)", color: ready && !dirty ? "var(--bone)" : "var(--warm-gray)", border: "none", padding: "11px 22px", cursor: ready && !dirty ? "pointer" : "not-allowed", fontSize: 12, display: "flex", alignItems: "center", gap: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            CONTINUE TO AGENTS <ChevronsRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentCard({ agent, drafts, winnerId, depsReady, onOpen }) {
  const draftCount = drafts.length;
  const winnerDraft = drafts.find((d) => d.id === winnerId);
  const hasWinner = !!winnerDraft;
  const authors = [...new Set(drafts.map((d) => d.author))];

  return (
    <div className="fade-in" style={{ background: "var(--paper)", border: hasWinner ? "1px solid var(--olive)" : "1px solid var(--border)", marginBottom: 10, position: "relative" }}>
      <div onClick={onOpen} style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: "var(--clay)", minWidth: 28, letterSpacing: "0.05em" }}>
          {agent.id}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 19, fontWeight: 600, margin: 0, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              {agent.name}
            </h3>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--warm-gray)", letterSpacing: "0.04em" }}>
              {agent.weight} · {agent.slidesProduced}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 2, fontStyle: "italic" }}>
            {agent.description}
          </div>
          {agent.deps.length > 0 && (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: depsReady ? "var(--warm-gray)" : "var(--rose)", marginTop: 4, letterSpacing: "0.04em" }}>
              READS FROM: {agent.deps.join(", ")} {!depsReady && "· UPSTREAM INCOMPLETE"}
            </div>
          )}
        </div>

        {draftCount > 0 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--warm-gray)", letterSpacing: "0.05em" }}>
              DRAFTS
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>
              {draftCount}
            </div>
            {authors.length > 0 && (
              <div style={{ fontSize: 10, color: "var(--warm-gray)", fontStyle: "italic", marginTop: -2 }}>
                {authors.slice(0, 3).join(", ")}{authors.length > 3 ? ` +${authors.length - 3}` : ""}
              </div>
            )}
          </div>
        )}

        {hasWinner && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--olive)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
            <Crown size={14} />
            WINNER
          </div>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          style={{ background: "var(--ink)", color: "var(--bone)", border: "none", padding: "8px 14px", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}
        >
          <MessageSquare size={12} /> {draftCount > 0 ? "OPEN" : "START"}
        </button>
      </div>
    </div>
  );
}

function PipelineView({ brief, draftsByAgent, winners, onOpenAgent, onRefresh, refreshing }) {
  return (
    <div className="fade-in" style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 28px 80px" }}>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--clay)", letterSpacing: "0.2em", marginBottom: 8, textTransform: "uppercase" }}>
            STEP 02 · COLLABORATE ON EACH SECTION
          </div>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
            Pick an agent. <em style={{ color: "var(--clay)" }}>Iterate. Save drafts. Run the tournament.</em>
          </h2>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--ink-soft)", padding: "9px 14px", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.05em" }}
        >
          {refreshing ? <Loader2 size={12} className="spin-icon" /> : <RefreshCw size={12} />}
          REFRESH (PULL TEAM'S DRAFTS)
        </button>
      </div>

      {["Market", "Strategy", "Execution"].map((band) => {
        const bandAgents = AGENTS.filter((a) => a.band === band);
        const bandWeight = band === "Market" ? "30%" : band === "Strategy" ? "30%" : "40%";
        return (
          <div key={band} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid var(--ink)" }}>
              <h3 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 600, margin: 0, color: "var(--ink)", letterSpacing: "-0.01em" }}>
                {band} band
              </h3>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--clay)", letterSpacing: "0.1em", fontWeight: 600 }}>
                {bandWeight} OF GRADE
              </span>
            </div>
            {bandAgents.map((agent) => {
              const agentDrafts = draftsByAgent[agent.id] || [];
              const winnerId = winners[agent.id];
              const depsReady = agent.deps.every((d) => (draftsByAgent[d] || []).length > 0);
              return (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  drafts={agentDrafts}
                  winnerId={winnerId}
                  depsReady={depsReady}
                  onOpen={() => onOpenAgent(agent.id)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function ChatBubble({ role, content, author, timestamp, isLatest }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", flexDirection: isUser ? "row-reverse" : "row", marginBottom: 14, gap: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: isUser ? "var(--clay)" : "var(--ink)", color: "var(--bone)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, flexShrink: 0 }}>
        {isUser ? (author ? author.slice(0, 1).toUpperCase() : "Y") : "A"}
      </div>
      <div style={{ maxWidth: "75%", flex: 1 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--warm-gray)", letterSpacing: "0.05em", marginBottom: 3, textAlign: isUser ? "right" : "left" }}>
          {isUser ? (author || "YOU").toUpperCase() : "AGENT"}{timestamp ? ` · ${new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
        </div>
        <div style={{ background: isUser ? "var(--clay)" : "var(--paper)", color: isUser ? "var(--bone)" : "var(--ink)", padding: isUser ? "10px 14px" : "14px 18px", border: isUser ? "none" : "1px solid var(--border)", fontSize: isUser ? 14 : 13, lineHeight: 1.5 }}>
          {isUser ? content : (
            isLatest ? <MarkdownView content={content} /> : (
              <details>
                <summary style={{ cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--clay)", letterSpacing: "0.05em" }}>
                  ▸ Slide draft ({content.length} chars) — click to expand
                </summary>
                <div style={{ marginTop: 10 }}>
                  <MarkdownView content={content} />
                </div>
              </details>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function DraftListItem({ draft, isWinner, onLoad, onSetWinner, onDelete }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: isWinner ? "var(--olive-soft)" : "var(--paper)", border: `1px solid ${isWinner ? "var(--olive)" : "var(--border)"}`, marginBottom: 6 }}>
      {isWinner && <Crown size={14} color="var(--olive)" style={{ flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{draft.name}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--warm-gray)", letterSpacing: "0.04em" }}>
            BY {draft.author.toUpperCase()} · {new Date(draft.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={onLoad} title="Load into your workspace to iterate" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--ink-soft)", padding: "5px 10px", cursor: "pointer", fontSize: 10, letterSpacing: "0.05em" }}>
          <GitBranch size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} /> FORK
        </button>
        {!isWinner && (
          <button onClick={onSetWinner} title="Mark as winner" style={{ background: "transparent", border: "1px solid var(--olive)", color: "var(--olive)", padding: "5px 10px", cursor: "pointer", fontSize: 10, letterSpacing: "0.05em" }}>
            <Crown size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} /> WIN
          </button>
        )}
        <button onClick={onDelete} title="Delete draft" style={{ background: "transparent", border: "1px solid var(--rose)", color: "var(--rose)", padding: "5px 8px", cursor: "pointer", fontSize: 10 }}>
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
}

function AgentWorkspace({ agent, brief, user, drafts, winnerId, upstreamLocks, workspace, onBack, onSendMessage, onSaveDraft, onSetWinner, onDeleteDraft, onLoadDraft, onRunTournament, tournamentResult, isWaiting, refreshing, onRefresh }) {
  const [input, setInput] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [draftName, setDraftName] = useState("");
  const chatRef = useRef(null);

  const chatHistory = workspace?.chatHistory || [];
  const lastAssistantMessage = [...chatHistory].reverse().find((m) => m.role === "assistant");
  const currentDraft = lastAssistantMessage?.content;

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatHistory.length]);

  const send = async () => {
    if (!input.trim() || isWaiting) return;
    const msg = input.trim();
    setInput("");
    await onSendMessage(msg);
  };

  const handleSave = async () => {
    if (!draftName.trim() || !currentDraft) return;
    await onSaveDraft(draftName.trim(), currentDraft);
    setDraftName("");
    setShowSaveModal(false);
  };

  const upstreamReady = agent.deps.every((d) => upstreamLocks[d]);

  return (
    <div className="fade-in" style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 28px 80px" }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: "var(--ink-soft)", padding: "6px 0", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.05em", marginBottom: 16 }}>
        <ArrowLeft size={14} /> BACK TO PIPELINE
      </button>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--clay)", letterSpacing: "0.2em", marginBottom: 6, textTransform: "uppercase" }}>
          AGENT {agent.id} · {agent.band.toUpperCase()} BAND · {agent.weight} OF GRADE
        </div>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 600, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
          {agent.name}
        </h2>
        <p style={{ fontSize: 15, color: "var(--ink-soft)", fontStyle: "italic", margin: 0 }}>
          {agent.description}
        </p>
      </div>

      {!upstreamReady && (
        <div style={{ background: "transparent", border: "1px dashed var(--rose)", padding: 14, marginBottom: 20, fontSize: 13, color: "var(--rose)", display: "flex", alignItems: "center", gap: 8 }}>
          <Lock size={14} />
          <span>This agent needs upstream drafts: <strong>{agent.deps.filter((d) => !upstreamLocks[d]).join(", ")}</strong>. You can still iterate, but the agent will work from the brief alone.</span>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, margin: 0, color: "var(--ink)" }}>
            Team drafts ({drafts.length})
          </h3>
          <button onClick={onRefresh} disabled={refreshing} style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--ink-soft)", padding: "5px 10px", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", gap: 5, letterSpacing: "0.05em" }}>
            {refreshing ? <Loader2 size={10} className="spin-icon" /> : <RefreshCw size={10} />}
            REFRESH
          </button>
        </div>

        {drafts.length === 0 ? (
          <div style={{ background: "var(--bone-light)", border: "1px dashed var(--border)", padding: 16, textAlign: "center", fontSize: 13, color: "var(--warm-gray)", fontStyle: "italic" }}>
            No drafts yet. Iterate in the chat below, then click "Save Draft" to make your version available to the team.
          </div>
        ) : (
          drafts.map((d) => (
            <DraftListItem
              key={d.id}
              draft={d}
              isWinner={d.id === winnerId}
              onLoad={() => onLoadDraft(d)}
              onSetWinner={() => onSetWinner(d.id)}
              onDelete={() => onDeleteDraft(d.id)}
            />
          ))
        )}

        {drafts.length >= 2 && (
          <button
            onClick={onRunTournament}
            disabled={isWaiting}
            style={{ marginTop: 12, background: "var(--gold)", color: "var(--bone)", border: "none", padding: "10px 18px", cursor: isWaiting ? "not-allowed" : "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            <Trophy size={13} /> RUN PROFESSOR TOURNAMENT ON {drafts.length} DRAFTS
          </button>
        )}
      </div>

      {tournamentResult && (
        <div style={{ marginBottom: 24, background: "var(--bone-light)", border: "1px solid var(--gold)", borderLeft: "4px solid var(--gold)", padding: "20px 24px" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--gold)", letterSpacing: "0.15em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <Trophy size={13} /> PROFESSOR'S RULING
          </div>
          <MarkdownView content={tournamentResult.content} />
        </div>
      )}

      <div style={{ background: "var(--paper)", border: "1px solid var(--border)" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "var(--bone-light)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--clay)", letterSpacing: "0.1em", fontWeight: 600 }}>
            <MessageSquare size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
            YOUR ITERATION WORKSPACE
          </div>
          {currentDraft && (
            <button
              onClick={() => setShowSaveModal(true)}
              style={{ background: "var(--clay)", color: "var(--bone)", border: "none", padding: "6px 12px", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.05em" }}
            >
              <Save size={11} /> SAVE CURRENT AS DRAFT
            </button>
          )}
        </div>

        <div ref={chatRef} style={{ maxHeight: 600, overflowY: "auto", padding: "18px 22px" }}>
          {chatHistory.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--warm-gray)", fontStyle: "italic", fontSize: 14 }}>
              Start by typing "generate first draft" — or give the agent a specific direction like "start with a punchy disruption thesis."
            </div>
          ) : (
            chatHistory.map((m, i) => (
              <ChatBubble
                key={i}
                role={m.role}
                content={m.content}
                author={m.author || user.handle}
                timestamp={m.timestamp}
                isLatest={m.role === "assistant" && i === chatHistory.length - 1}
              />
            ))
          )}
          {isWaiting && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", color: "var(--clay)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: "0.05em" }}>
              <Loader2 size={14} className="spin-icon" /> AGENT IS WRITING…
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", padding: 14, display: "flex", gap: 10, background: "var(--bone-light)" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={chatHistory.length === 0 ? "e.g. Generate first draft" : "e.g. Make the TTR more emotional. Or: tighten the values section."}
            disabled={isWaiting}
            rows={2}
            style={{ flex: 1, background: "var(--paper)", border: "1px solid var(--border)", padding: "8px 12px", fontSize: 14, color: "var(--ink)", outline: "none", resize: "none", fontFamily: "'Newsreader', Georgia, serif" }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || isWaiting}
            style={{ background: input.trim() && !isWaiting ? "var(--ink)" : "var(--border)", color: input.trim() && !isWaiting ? "var(--bone)" : "var(--warm-gray)", border: "none", padding: "0 18px", cursor: input.trim() && !isWaiting ? "pointer" : "not-allowed", fontSize: 12, display: "flex", alignItems: "center", gap: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            <Send size={13} /> SEND
          </button>
        </div>
      </div>

      {showSaveModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
          <div className="fade-in" style={{ background: "var(--bone)", maxWidth: 460, width: "100%", padding: "28px 32px", border: "1px solid var(--ink)" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.2em", color: "var(--clay)", marginBottom: 10, textTransform: "uppercase" }}>
              SAVE DRAFT TO TEAM POOL
            </div>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, margin: "0 0 14px" }}>
              Name this draft
            </h3>
            <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 16, lineHeight: 1.55 }}>
              Once saved, your teammates can see, fork, and compare this version. Suggest something descriptive — "Bold WWE v1", "Tightened values", etc.
            </p>
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && draftName.trim()) handleSave(); }}
              placeholder="e.g. Bold WWE v1"
              style={{ width: "100%", background: "var(--paper)", border: "1px solid var(--border)", padding: "9px 12px", fontSize: 15, marginBottom: 14, outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowSaveModal(false)} style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--ink-soft)", padding: "9px 16px", cursor: "pointer", fontSize: 11, letterSpacing: "0.06em" }}>
                CANCEL
              </button>
              <button onClick={handleSave} disabled={!draftName.trim()} style={{ background: draftName.trim() ? "var(--clay)" : "var(--border)", color: draftName.trim() ? "var(--bone)" : "var(--warm-gray)", border: "none", padding: "9px 18px", cursor: draftName.trim() ? "pointer" : "not-allowed", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                SAVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportView({ brief, draftsByAgent, winners }) {
  const buildDeck = () => {
    let md = `# Brand Experience Deck\n\n## Brief\n`;
    md += `- **Product:** ${brief.productIdea || "—"}\n`;
    md += `- **Industry:** ${brief.industry || "—"}\n`;
    md += `- **Incumbent:** ${brief.incumbentName || "—"}\n`;
    md += `- **Disruption vector:** ${brief.disruptionVector || "—"}\n`;
    md += `- **Geography:** ${brief.geography || "—"}\n\n---\n\n`;
    for (const agent of AGENTS) {
      const agentDrafts = draftsByAgent[agent.id] || [];
      const winnerId = winners[agent.id];
      const winningDraft = winnerId ? agentDrafts.find((d) => d.id === winnerId) : agentDrafts[agentDrafts.length - 1];
      if (winningDraft) {
        md += `# ━━━ ${agent.id} · ${agent.name} (${agent.weight}) ━━━\n`;
        md += `*Author: ${winningDraft.author} · ${winnerId === winningDraft.id ? "PROFESSOR'S PICK" : "most recent draft (no winner picked)"}*\n\n`;
        md += winningDraft.content + "\n\n---\n\n";
      } else {
        md += `# ━━━ ${agent.id} · ${agent.name} (${agent.weight}) ━━━\n\n*No drafts saved yet for this section.*\n\n---\n\n`;
      }
    }
    return md;
  };

  const fullMd = buildDeck();
  const winnerCount = Object.keys(winners).length;
  const draftedCount = AGENTS.filter((a) => (draftsByAgent[a.id] || []).length > 0).length;

  return (
    <div className="fade-in" style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 28px 80px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--clay)", letterSpacing: "0.2em", marginBottom: 8, textTransform: "uppercase" }}>
          STEP 03 · EXPORT
        </div>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 600, margin: "0 0 10px", letterSpacing: "-0.01em" }}>
          The winning drafts, <em style={{ color: "var(--clay)" }}>compiled.</em>
        </h2>
        <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
          {winnerCount} winners picked · {draftedCount} of {AGENTS.length} sections drafted. Copy this into PowerPoint, Google Slides, or Keynote.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        <button onClick={() => navigator.clipboard.writeText(fullMd)} style={{ background: "var(--ink)", color: "var(--bone)", border: "none", padding: "10px 18px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          <Copy size={13} /> COPY ENTIRE DECK
        </button>
        <button
          onClick={() => {
            const blob = new Blob([fullMd], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `brand_lab_deck_${Date.now()}.md`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--ink-soft)", padding: "10px 16px", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.05em" }}
        >
          <Download size={12} /> DOWNLOAD .MD
        </button>
      </div>

      <div style={{ background: "var(--paper)", border: "1px solid var(--border)", padding: "26px 30px", maxHeight: 700, overflowY: "auto" }}>
        <MarkdownView content={fullMd} />
      </div>
    </div>
  );
}

// =============================================================
// MAIN APP
// =============================================================

export default function Page() {
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("brief");
  const [openAgentId, setOpenAgentId] = useState(null);

  const [brief, setBrief] = useState({});
  const [briefMeta, setBriefMeta] = useState({});
  const [draftsByAgent, setDraftsByAgent] = useState({});
  const [winners, setWinners] = useState({});
  const [tournaments, setTournaments] = useState({});
  const [workspaces, setWorkspaces] = useState({});

  const [refreshing, setRefreshing] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ---------- Load on mount ----------
  useEffect(() => {
    (async () => {
      // local user
      try {
        const u = localStorage.getItem("brandlab_user");
        if (u) setUser(JSON.parse(u));
      } catch (e) {}

      // local workspaces
      try {
        const ws = localStorage.getItem("brandlab_workspaces");
        if (ws) setWorkspaces(JSON.parse(ws));
      } catch (e) {}

      // shared state
      await refreshSharedState();
      setLoaded(true);
    })();
  }, []);

  // ---------- Refresh shared state ----------
  const refreshSharedState = async () => {
    setRefreshing(true);
    try {
      const data = await callStorage("loadAll");
      setBrief(data.brief || {});
      setBriefMeta(data.briefMeta || {});
      setDraftsByAgent(data.draftsByAgent || {});
      setWinners(data.winners || {});
      setTournaments(data.tournaments || {});
      setNeedsPassword(false);
      setPasswordError("");
    } catch (e) {
      if (e.message === "AUTH_REQUIRED") {
        setNeedsPassword(true);
      } else {
        console.error("Refresh failed:", e);
      }
    } finally {
      setRefreshing(false);
    }
  };

  // ---------- Persist personal workspaces ----------
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("brandlab_workspaces", JSON.stringify(workspaces)); } catch (e) {}
  }, [workspaces, loaded]);

  // ---------- Password gate ----------
  const handlePasswordSubmit = async (pw) => {
    localStorage.setItem("brandlab_password", pw);
    setPasswordError("");
    try {
      await refreshSharedState();
    } catch (e) {
      setPasswordError("That password didn't work.");
      localStorage.removeItem("brandlab_password");
    }
  };

  // ---------- Onboarding ----------
  const handleOnboard = (handle) => {
    const u = { handle, joinedAt: Date.now() };
    setUser(u);
    try { localStorage.setItem("brandlab_user", JSON.stringify(u)); } catch (e) {}
  };

  const handleSignOut = () => {
    if (!window.confirm("Change handle? Your personal iteration chats will clear (team drafts stay intact).")) return;
    setUser(null);
    setWorkspaces({});
    try {
      localStorage.removeItem("brandlab_user");
      localStorage.removeItem("brandlab_workspaces");
    } catch (e) {}
  };

  // ---------- Save brief ----------
  const saveBrief = async (newBrief) => {
    const meta = { lastEditedBy: user.handle, lastEditedAt: Date.now() };
    setBrief(newBrief);
    setBriefMeta(meta);
    await callStorage("saveBrief", { brief: newBrief, meta });
  };

  // ---------- Agent operations ----------
  const getUpstreamLocks = (agentId) => {
    const agent = AGENTS.find((a) => a.id === agentId);
    const locks = {};
    for (const dep of agent.deps) {
      const winnerId = winners[dep];
      const agentDrafts = draftsByAgent[dep] || [];
      let chosen = null;
      if (winnerId) chosen = agentDrafts.find((d) => d.id === winnerId);
      if (!chosen) chosen = agentDrafts[agentDrafts.length - 1];
      if (chosen) locks[dep] = chosen.content;
    }
    return locks;
  };

  const sendAgentMessage = async (agentId, userMessage) => {
    const agent = AGENTS.find((a) => a.id === agentId);
    const ws = workspaces[agentId] || { chatHistory: [] };
    const upstreamLocks = getUpstreamLocks(agentId);

    const newUserMsg = { role: "user", content: userMessage, author: user.handle, timestamp: Date.now() };
    const newHistory = [...ws.chatHistory, newUserMsg];

    setWorkspaces((prev) => ({ ...prev, [agentId]: { ...ws, chatHistory: newHistory } }));
    setIsWaiting(true);

    try {
      const { text } = await callClaude("agent_chat", {
        agentId,
        brief,
        upstreamLocks,
        chatHistory: ws.chatHistory.map((m) => ({ role: m.role, content: m.content })),
        newUserMessage: userMessage,
      });
      const newAssistantMsg = { role: "assistant", content: text, timestamp: Date.now() };
      setWorkspaces((prev) => ({
        ...prev,
        [agentId]: { ...ws, chatHistory: [...newHistory, newAssistantMsg] }
      }));
    } catch (e) {
      const errMsg = { role: "assistant", content: `**Error:** ${e.message}`, timestamp: Date.now(), error: true };
      setWorkspaces((prev) => ({
        ...prev,
        [agentId]: { ...ws, chatHistory: [...newHistory, errMsg] }
      }));
    } finally {
      setIsWaiting(false);
    }
  };

  const saveDraft = async (agentId, name, content) => {
    const draftId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const draft = {
      id: draftId,
      agentId,
      name,
      content,
      author: user.handle,
      createdAt: Date.now(),
    };
    try {
      await callStorage("saveDraft", { draft });
      setDraftsByAgent((prev) => ({
        ...prev,
        [agentId]: [...(prev[agentId] || []), draft],
      }));
    } catch (e) {
      alert("Failed to save draft: " + e.message);
    }
  };

  const deleteDraft = async (agentId, draftId) => {
    if (!window.confirm("Delete this draft? This affects everyone.")) return;
    try {
      await callStorage("deleteDraft", { agentId, draftId });
      setDraftsByAgent((prev) => ({
        ...prev,
        [agentId]: (prev[agentId] || []).filter((d) => d.id !== draftId),
      }));
      if (winners[agentId] === draftId) {
        setWinners((prev) => {
          const n = { ...prev };
          delete n[agentId];
          return n;
        });
      }
    } catch (e) {
      alert("Failed to delete: " + e.message);
    }
  };

  const setDraftAsWinner = async (agentId, draftId) => {
    try {
      await callStorage("setWinner", { agentId, draftId });
      setWinners((prev) => ({ ...prev, [agentId]: draftId }));
    } catch (e) {
      alert("Failed to set winner: " + e.message);
    }
  };

  const loadDraftIntoWorkspace = (agentId, draft) => {
    if (!window.confirm(`Fork "${draft.name}" into your workspace? Your current chat will be replaced.`)) return;
    const seedHistory = [
      { role: "user", content: `(Loaded "${draft.name}" by ${draft.author} as starting point)`, author: user.handle, timestamp: Date.now() },
      { role: "assistant", content: draft.content, timestamp: Date.now() }
    ];
    setWorkspaces((prev) => ({ ...prev, [agentId]: { chatHistory: seedHistory } }));
  };

  const runTournament = async (agentId) => {
    const agent = AGENTS.find((a) => a.id === agentId);
    const agentDrafts = draftsByAgent[agentId] || [];
    if (agentDrafts.length < 2) return;

    setIsWaiting(true);
    try {
      const upstreamLocks = getUpstreamLocks(agentId);
      let promptText = `## AGENT: ${agent.id} — ${agent.name}\n## RUBRIC: "${agent.description}" (${agent.weight})\n\n`;
      promptText += buildBriefBlock(brief) + "\n";
      if (Object.keys(upstreamLocks).length > 0) {
        promptText += "\n## UPSTREAM LOCKS\n\n";
        for (const [depId, depContent] of Object.entries(upstreamLocks)) {
          promptText += `### ${depId}\n${depContent}\n\n`;
        }
      }
      promptText += `\n## ${agentDrafts.length} DRAFTS TO JUDGE\n\n`;
      agentDrafts.forEach((d, i) => {
        promptText += `### Draft ${i + 1}: "${d.name}" (by ${d.author})\n\n${d.content}\n\n---\n\n`;
      });
      promptText += "\nNow grade each, pick the winner, and explain why.";

      const { text } = await callClaude("tournament", { promptText });

      const winnerMatch = text.match(/##\s*Winner\s*\n+\s*Draft\s+(\d+)/i);
      let pickedId = null;
      if (winnerMatch) {
        const idx = parseInt(winnerMatch[1]) - 1;
        if (idx >= 0 && idx < agentDrafts.length) pickedId = agentDrafts[idx].id;
      }

      const record = {
        content: text,
        runAt: Date.now(),
        byUser: user.handle,
        pickedDraftId: pickedId,
      };

      await callStorage("saveTournament", { agentId, record });
      setTournaments((prev) => ({ ...prev, [agentId]: record }));

      if (pickedId) {
        await callStorage("setWinner", { agentId, draftId: pickedId });
        setWinners((prev) => ({ ...prev, [agentId]: pickedId }));
      }
    } catch (e) {
      alert("Tournament failed: " + e.message);
    } finally {
      setIsWaiting(false);
    }
  };

  // ---------- Derived state ----------
  const briefReady = !!(brief.productIdea && brief.industry && brief.incumbentName && brief.disruptionVector);
  const anyDrafts = Object.values(draftsByAgent).some((arr) => arr.length > 0);

  // ---------- Render ----------
  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bone)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={28} className="spin-icon" color="#b8472a" />
      </div>
    );
  }

  if (needsPassword) {
    return <PasswordGate onSubmit={handlePasswordSubmit} error={passwordError} />;
  }

  if (!user) {
    return <OnboardingModal onSubmit={handleOnboard} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bone)" }}>
      <Header user={user} onSignOut={handleSignOut} />
      {!openAgentId && (
        <TabNav active={activeTab} onChange={setActiveTab} briefReady={briefReady} anyDrafts={anyDrafts} />
      )}

      {openAgentId ? (
        (() => {
          const agent = AGENTS.find((a) => a.id === openAgentId);
          return (
            <AgentWorkspace
              agent={agent}
              brief={brief}
              user={user}
              drafts={draftsByAgent[openAgentId] || []}
              winnerId={winners[openAgentId]}
              upstreamLocks={getUpstreamLocks(openAgentId)}
              workspace={workspaces[openAgentId]}
              onBack={() => setOpenAgentId(null)}
              onSendMessage={(msg) => sendAgentMessage(openAgentId, msg)}
              onSaveDraft={(name, content) => saveDraft(openAgentId, name, content)}
              onSetWinner={(draftId) => setDraftAsWinner(openAgentId, draftId)}
              onDeleteDraft={(draftId) => deleteDraft(openAgentId, draftId)}
              onLoadDraft={(draft) => loadDraftIntoWorkspace(openAgentId, draft)}
              onRunTournament={() => runTournament(openAgentId)}
              tournamentResult={tournaments[openAgentId]}
              isWaiting={isWaiting}
              refreshing={refreshing}
              onRefresh={refreshSharedState}
            />
          );
        })()
      ) : (
        <>
          {activeTab === "brief" && (
            <BriefForm
              brief={brief}
              briefMeta={briefMeta}
              user={user}
              onSave={saveBrief}
              onContinue={() => setActiveTab("pipeline")}
            />
          )}
          {activeTab === "pipeline" && (
            <PipelineView
              brief={brief}
              draftsByAgent={draftsByAgent}
              winners={winners}
              onOpenAgent={(id) => setOpenAgentId(id)}
              onRefresh={refreshSharedState}
              refreshing={refreshing}
            />
          )}
          {activeTab === "export" && (
            <ExportView brief={brief} draftsByAgent={draftsByAgent} winners={winners} />
          )}
        </>
      )}

      <footer style={{ padding: "28px", borderTop: "1px solid var(--border)", background: "var(--bone-light)", textAlign: "center" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--warm-gray)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          BRAND LAB · POWERED BY CLAUDE · SHARED VIA UPSTASH REDIS
        </div>
        <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 13, color: "var(--warm-gray)", fontStyle: "italic", marginTop: 6 }}>
          Brief, drafts, and tournament rulings are shared across everyone with the URL · Your iteration chat is your own
        </div>
      </footer>
    </div>
  );
}
