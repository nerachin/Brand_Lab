"use client";

import { useState, useEffect, useRef } from "react";
import {
  Play, Check, AlertCircle, Loader2, ChevronDown, ChevronRight,
  Copy, RefreshCw, FileText, Sparkles, Lock, Download, Upload, Trash2,
  ChevronsRight, BookOpen, GraduationCap, Zap, MessageSquare, Crown,
  ArrowLeft, Send, Save, User, Plus, Trophy, Eye, GitBranch, Image as ImageIcon, Wand2,
  Paperclip, X
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

async function callOpenAI(mode, params) {
  return api("/api/openai", { mode, ...params });
}

async function callStorage(action, params = {}) {
  return api("/api/storage", { action, ...params });
}

async function callGamma(action, params = {}) {
  return api("/api/gamma", { action, ...params });
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

function ChatBubble({ role, content, author, timestamp, attachments, isLatest }) {
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
        {/* Attachment chips beneath user messages */}
        {isUser && attachments && attachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5, justifyContent: "flex-end" }}>
            {attachments.map((att, i) => {
              const isImg = att.type?.startsWith("image/");
              const sizeKB = Math.round((att.size || 0) / 1024);
              return (
                <div
                  key={i}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    background: "var(--bone-light)", padding: "2px 6px",
                    border: "1px solid var(--border)", fontSize: 10,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "var(--ink-soft)",
                  }}
                >
                  {isImg ? <ImageIcon size={9} /> : <FileText size={9} />}
                  <span>{att.name}</span>
                  <span style={{ color: "var(--warm-gray)" }}>
                    {sizeKB < 1024 ? `${sizeKB}KB` : `${(sizeKB / 1024).toFixed(1)}MB`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DraftListItem({ draft, isWinner, onLoad, onSetWinner, onDelete, onRemoveImage }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: isWinner ? "var(--olive-soft)" : "var(--paper)", border: `1px solid ${isWinner ? "var(--olive)" : "var(--border)"}`, marginBottom: 6 }}>
      {isWinner && <Crown size={14} color="var(--olive)" style={{ flexShrink: 0 }} />}
      {draft.imageDataUrl && (
        <div style={{ position: "relative", flexShrink: 0, lineHeight: 0 }}>
          <img
            src={draft.imageDataUrl}
            alt={draft.imageDescription || "draft image"}
            title={draft.imageDescription || ""}
            style={{ width: 38, height: 38, objectFit: "cover", border: "1px solid var(--border)", display: "block", background: "var(--bone)" }}
          />
          {onRemoveImage && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveImage(); }}
              title="Remove image (keeps the draft text)"
              style={{
                position: "absolute", top: -6, right: -6,
                width: 18, height: 18, padding: 0,
                background: "var(--ink)", color: "var(--bone)",
                border: "1px solid var(--bone)", borderRadius: "50%",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, lineHeight: 1, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              ×
            </button>
          )}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{draft.name}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--warm-gray)", letterSpacing: "0.04em" }}>
            BY {draft.author.toUpperCase()} · {new Date(draft.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
          {draft.imageDataUrl && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--clay)", letterSpacing: "0.05em", padding: "1px 5px", border: "1px solid var(--clay)" }}>
              + IMAGE
            </span>
          )}
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

/**
 * Cover Image generator for the deck title slide.
 * Single-slot persisted image: generating a new one replaces the existing.
 * Uses the same /api/image + Blob hosting + prompt-builder flow as per-section visuals.
 */
function CoverImageGenerator({ brief, coverImage, onSaveCoverImage, onDeleteCoverImage }) {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1536x1024"); // landscape default — best for title slides
  const [quality, setQuality] = useState("high");
  const [generating, setGenerating] = useState(false);
  const [buildingPrompt, setBuildingPrompt] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);

  const buildPromptFromBrief = async () => {
    if (!brief?.productIdea && !brief?.industry) {
      alert("Fill in the Brief tab first — at minimum product idea and industry.");
      return;
    }
    setBuildingPrompt(true);
    setError(null);
    setWarning(null);
    try {
      // Use a synthetic "COVER" agent context so the prompt builder uses the cover anchor
      const promptText = [
        "## BRAND BRIEF",
        `- Product idea: ${brief.productIdea || "[unspecified]"}`,
        `- Industry: ${brief.industry || "[unspecified]"}`,
        `- Incumbent being disrupted: ${brief.incumbentName || "[unspecified]"}`,
        `- Disruption vector: ${brief.disruptionVector || "[unspecified]"}`,
        `- Geography: ${brief.geography || "[unspecified]"}`,
        brief.founderStory ? `- Founder story: ${brief.founderStory}` : "",
        "",
        "## AGENT / SLIDE TYPE",
        "COVER — hero image for the deck title slide",
        "",
        "## SLIDE CONTENT",
        "# " + (brief.productIdea || "Brand Experience"),
        "",
        brief.incumbentName && brief.industry
          ? `Disrupting ${brief.incumbentName} in ${brief.industry}.`
          : "Title slide of the brand strategy capstone deck.",
        "",
        "## Visual direction",
        "Hero cover image. Must embody the brand's reason for being at a single iconic glance.",
        "Landscape orientation, magazine-cover composition. Strong single subject, generous",
        "negative space (Gamma will overlay the title text). No embedded text.",
        "",
        "Now write the image prompt. Output the prompt text only, nothing else.",
      ].filter(Boolean).join("\n");

      const result = await api("/api/prompt-builder", { promptText });
      const generated = (result.text || "").trim();
      if (!generated) throw new Error("Empty response from prompt builder.");
      setPrompt(generated);
    } catch (e) {
      setError(`Prompt builder failed: ${e.message}`);
    } finally {
      setBuildingPrompt(false);
    }
  };

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError(null);
    setWarning(null);
    try {
      const result = await api("/api/image", { prompt: prompt.trim(), size, quality });
      if (result.error) throw new Error(result.error);

      await onSaveCoverImage({
        prompt: prompt.trim(),
        imageDataUrl: result.image,
        imageUrl: result.imageUrl || null,
        size,
        quality,
      });

      if (!result.imageUrl) {
        setWarning("Image generated and saved locally, but no public URL was created — won't show in Gamma. Check Vercel Blob is enabled as PUBLIC.");
      }
      setPrompt(""); // clear prompt after successful save
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const displaySrc = coverImage?.imageDataUrl || coverImage?.imageUrl;

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--ink)", borderLeft: "4px solid var(--olive)", padding: "24px 28px", marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <ImageIcon size={18} color="var(--olive)" />
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "var(--olive)", fontWeight: 600 }}>
          COVER IMAGE · TITLE SLIDE HERO
        </div>
      </div>
      <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
        The image that opens your deck
      </h3>
      <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 16, lineHeight: 1.6, maxWidth: 720 }}>
        Single hero image that anchors the title slide. Inlined automatically when you generate via Gamma. Landscape orientation works best — leaves room for the title overlay.
      </p>

      {/* Existing cover preview */}
      {coverImage && displaySrc && (
        <div style={{ marginBottom: 18, background: "var(--bone-light)", padding: 12, border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <img
              src={displaySrc}
              alt="Cover image"
              style={{ maxWidth: 320, maxHeight: 220, objectFit: "cover", border: "1px solid var(--border)", flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--warm-gray)", letterSpacing: "0.06em", marginBottom: 6 }}>
                CURRENT COVER · BY {(coverImage.author || "").toUpperCase()}
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55, marginTop: 0, marginBottom: 12, fontStyle: "italic" }}>
                {coverImage.prompt && coverImage.prompt.length > 220
                  ? coverImage.prompt.slice(0, 220) + "…"
                  : coverImage.prompt}
              </p>
              <button
                onClick={onDeleteCoverImage}
                style={{
                  background: "transparent", border: "1px solid var(--rose)", color: "var(--rose)",
                  padding: "5px 10px", cursor: "pointer", fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}
              >
                <Trash2 size={10} /> DELETE COVER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generator */}
      <div style={{ background: "var(--bone-light)", border: "1px solid var(--border)", padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "var(--olive)", fontWeight: 600, textTransform: "uppercase" }}>
            {coverImage ? "Replace cover — image prompt" : "Image prompt"}
          </label>
          <button
            onClick={buildPromptFromBrief}
            disabled={buildingPrompt || generating}
            style={{
              background: "transparent", border: "1px solid var(--border)",
              color: buildingPrompt ? "var(--olive)" : "var(--ink-soft)",
              padding: "3px 8px", cursor: buildingPrompt || generating ? "wait" : "pointer",
              fontSize: 10, letterSpacing: "0.05em",
              fontFamily: "'JetBrains Mono', monospace",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
          >
            {buildingPrompt ? <Loader2 size={10} className="spin-icon" /> : <Sparkles size={10} />}
            {buildingPrompt ? "BUILDING…" : "BUILD PROMPT FROM BRIEF"}
          </button>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the cover. Or click 'Build Prompt from Brief' to have Claude write one for you."
          rows={4}
          disabled={generating}
          style={{ width: "100%", background: "var(--paper)", border: "1px solid var(--border)", padding: "8px 10px", fontSize: 13, fontFamily: "'Newsreader', Georgia, serif", outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={size} onChange={(e) => setSize(e.target.value)} disabled={generating} style={{ background: "var(--paper)", border: "1px solid var(--border)", padding: "6px 8px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
            <option value="1536x1024">1536×1024 ▭ landscape (recommended)</option>
            <option value="1024x1024">1024×1024 ◻ square</option>
            <option value="1024x1536">1024×1536 ▯ portrait</option>
          </select>
          <select value={quality} onChange={(e) => setQuality(e.target.value)} disabled={generating} style={{ background: "var(--paper)", border: "1px solid var(--border)", padding: "6px 8px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
            <option value="medium">Medium quality</option>
            <option value="high">High quality · slow (recommended for cover)</option>
            <option value="low">Low quality · fast</option>
          </select>
          <button
            onClick={generate}
            disabled={!prompt.trim() || generating}
            style={{ marginLeft: "auto", background: prompt.trim() && !generating ? "var(--olive)" : "var(--border)", color: prompt.trim() && !generating ? "var(--bone)" : "var(--warm-gray)", border: "none", padding: "8px 16px", cursor: prompt.trim() && !generating ? "pointer" : "not-allowed", fontSize: 11, display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            {generating ? <Loader2 size={12} className="spin-icon" /> : <Sparkles size={12} />}
            {generating ? "GENERATING…" : (coverImage ? "REPLACE COVER" : "GENERATE COVER")}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 10, color: "var(--rose)", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            ⚠ {error}
          </div>
        )}
        {warning && !error && (
          <div style={{ marginTop: 10, color: "var(--gold)", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
            ⚠ {warning}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--warm-gray)", fontStyle: "italic" }}>
          High quality at 1536×1024 takes 60–120 seconds. The cover is shared across the team and inlined on the title slide every time you regenerate the Gamma deck.
        </div>
      </div>
    </div>
  );
}


function ImageGenerator({ agent, brief, currentDraft, visuals, onSaveVisual, onDeleteVisual }) {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("medium");
  const [generating, setGenerating] = useState(false);
  const [buildingPrompt, setBuildingPrompt] = useState(false);
  const [localImages, setLocalImages] = useState([]); // fallback for when Blob isn't configured
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const seedPrompt = () => {
    if (agent.id === "A6") {
      return `Photograph of the physical brand setting for ${brief.industry || "this brand"}. Describe: interior, lighting, materials, mood, what a customer sees in the first 30 seconds.`;
    }
    if (agent.id === "A9") {
      return `Advertising execution for ${brief.industry || "this brand"}. Describe the scene, subject, lighting, mood, and any text overlay (gpt-image-2 renders text well).`;
    }
    if (agent.id === "A1") {
      return `Conceptual editorial illustration for ${brief.industry || "this brand"} disrupting ${brief.incumbentName || "the incumbent"}.`;
    }
    return `Visual for the ${agent.name} slide. Describe what you want to see.`;
  };

  // Calls Claude to convert the draft + brief into a polished gpt-image-2 prompt
  // (concrete subject, lighting, composition, palette, camera notes, what to avoid).
  const seedFromDraft = async () => {
    if (!currentDraft) {
      alert("No current draft to seed from. Iterate in the chat first or fork a saved draft.");
      return;
    }
    if (buildingPrompt) return;
    setBuildingPrompt(true);
    setError(null);
    setWarning(null);
    try {
      const promptText = [
        "## BRAND BRIEF",
        `- Product idea: ${brief.productIdea || "[unspecified]"}`,
        `- Industry: ${brief.industry || "[unspecified]"}`,
        `- Incumbent being disrupted: ${brief.incumbentName || "[unspecified]"}`,
        `- Disruption vector: ${brief.disruptionVector || "[unspecified]"}`,
        `- Geography: ${brief.geography || "[unspecified]"}`,
        brief.founderStory ? `- Founder story: ${brief.founderStory}` : "",
        "",
        "## AGENT / SLIDE TYPE",
        `${agent.id} — ${agent.name} (${agent.band} band, ${agent.weight})`,
        "",
        "## SLIDE CONTENT",
        currentDraft,
        "",
        "Now write the image prompt. Output the prompt text only, nothing else.",
      ].filter(Boolean).join("\n");

      const result = await api("/api/prompt-builder", { promptText });
      const generated = (result.text || "").trim();
      if (!generated) {
        throw new Error("Empty response from prompt builder. Try again or write one manually.");
      }
      setPrompt(generated);

      // Light warning if the draft had no Visual direction section — the prompt builder
      // still works, but the team's intent might not be captured. Tell them.
      const hasVisualDirection = /##\s+Visual\s+direction/i.test(currentDraft);
      if (!hasVisualDirection) {
        setWarning("Draft had no '## Visual direction' section — Claude inferred one from the must-say and body. Skim it before generating.");
      }
    } catch (e) {
      setError(`Prompt builder failed: ${e.message}`);
    } finally {
      setBuildingPrompt(false);
    }
  };

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError(null);
    setWarning(null);
    try {
      const result = await api("/api/image", { prompt: prompt.trim(), size, quality });
      if (result.error) throw new Error(result.error);

      const visualRecord = {
        prompt: prompt.trim(),
        imageUrl: result.imageUrl || null, // public Blob URL; null if Blob not configured
        imageDataUrl: result.image, // base64 for immediate display
        size,
        quality,
      };

      // If Blob is configured, persist to Redis so teammates and future sessions can see it
      if (onSaveVisual && result.imageUrl) {
        try {
          await onSaveVisual(visualRecord);
          // Saved successfully — relying on `visuals` prop now, clear local fallback
        } catch (saveErr) {
          // Persistence failed — show locally only and warn
          setLocalImages((prev) => [{ ...visualRecord, id: `local_${Date.now()}` }, ...prev]);
          setWarning(`Image generated but not saved to team: ${saveErr.message}`);
        }
      } else {
        // No Blob configured OR no save handler — fall back to browser-only display
        setLocalImages((prev) => [{ ...visualRecord, id: `local_${Date.now()}` }, ...prev]);
        if (result.blobError) {
          setWarning(`Image lives in your browser only — Vercel Blob not configured (${result.blobError}). Enable Blob in Vercel Storage to persist and share.`);
        } else if (!result.imageUrl) {
          setWarning("Image lives in your browser only — couldn't generate a public URL. Won't show up for teammates or in Gamma.");
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const download = (img) => {
    const a = document.createElement("a");
    a.href = img.imageDataUrl || img.imageUrl;
    a.download = `${agent.id}_${img.id || Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = async (visualId) => {
    if (visualId.startsWith && visualId.startsWith("local_")) {
      // Browser-only fallback image, just remove from local state
      setLocalImages((prev) => prev.filter((v) => v.id !== visualId));
      return;
    }
    if (onDeleteVisual) await onDeleteVisual(visualId);
  };

  // Combine persisted visuals (newest first) with any in-session local fallbacks
  const persisted = [...(visuals || [])].sort((a, b) => b.createdAt - a.createdAt);
  const allImages = [...localImages, ...persisted];

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, margin: 0, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
          <Wand2 size={15} color="var(--clay)" /> Visuals
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--warm-gray)", letterSpacing: "0.05em", fontWeight: 400 }}>
            GPT IMAGE 2{allImages.length > 0 ? ` · ${allImages.length} SAVED` : ""}
          </span>
        </h3>
        {expanded ? <ChevronDown size={16} color="var(--warm-gray)" /> : <ChevronRight size={16} color="var(--warm-gray)" />}
      </div>

      {expanded && (
        <>
          {allImages.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
              {allImages.map((img) => {
                const isLocal = String(img.id || "").startsWith("local_");
                const src = img.imageDataUrl || img.imageUrl;
                return (
                  <div key={img.id} style={{ background: "var(--paper)", border: "1px solid var(--border)", padding: 8, position: "relative" }}>
                    <img
                      src={src}
                      alt={img.prompt}
                      style={{
                        width: "100%", display: "block",
                        aspectRatio: img.size === "1024x1024" ? "1/1" : img.size === "1536x1024" ? "3/2" : "2/3",
                        objectFit: "cover",
                      }}
                    />
                    {isLocal && (
                      <div style={{ position: "absolute", top: 12, left: 12, background: "var(--gold)", color: "var(--bone)", padding: "2px 6px", fontSize: 9, letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                        UNSAVED
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "var(--warm-gray)", padding: "6px 2px 4px", fontStyle: "italic", lineHeight: 1.4 }}>
                      {img.prompt.length > 100 ? img.prompt.slice(0, 100) + "…" : img.prompt}
                      {img.author && !isLocal && (
                        <span style={{ display: "block", fontStyle: "normal", fontSize: 10, color: "var(--warm-gray)", marginTop: 2, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>
                          BY {img.author.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => download(img)} style={{ flex: 1, background: "transparent", border: "1px solid var(--border)", color: "var(--ink-soft)", padding: "5px", cursor: "pointer", fontSize: 10, letterSpacing: "0.05em", fontFamily: "'JetBrains Mono', monospace" }}>
                        <Download size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} /> PNG
                      </button>
                      <button
                        onClick={() => handleDelete(img.id)}
                        title="Delete image"
                        style={{ background: "transparent", border: "1px solid var(--rose)", color: "var(--rose)", padding: "5px 8px", cursor: "pointer", fontSize: 10 }}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ background: "var(--paper)", border: "1px solid var(--border)", padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "var(--clay)", fontWeight: 600, textTransform: "uppercase" }}>
                Image Prompt
              </label>
              {currentDraft && (
                <button
                  onClick={seedFromDraft}
                  disabled={buildingPrompt || generating}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: buildingPrompt ? "var(--clay)" : "var(--ink-soft)",
                    padding: "3px 8px",
                    cursor: buildingPrompt || generating ? "wait" : "pointer",
                    fontSize: 10,
                    letterSpacing: "0.05em",
                    fontFamily: "'JetBrains Mono', monospace",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  {buildingPrompt ? <Loader2 size={10} className="spin-icon" /> : <Sparkles size={10} />}
                  {buildingPrompt ? "BUILDING PROMPT…" : "BUILD PROMPT FROM DRAFT"}
                </button>
              )}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={seedPrompt()}
              rows={4}
              disabled={generating}
              style={{ width: "100%", background: "var(--bone-light)", border: "1px solid var(--border)", padding: "8px 10px", fontSize: 13, fontFamily: "'Newsreader', Georgia, serif", outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select value={size} onChange={(e) => setSize(e.target.value)} disabled={generating} style={{ background: "var(--bone-light)", border: "1px solid var(--border)", padding: "6px 8px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                <option value="1024x1024">1024×1024 ◻ square</option>
                <option value="1536x1024">1536×1024 ▭ landscape</option>
                <option value="1024x1536">1024×1536 ▯ portrait</option>
              </select>
              <select value={quality} onChange={(e) => setQuality(e.target.value)} disabled={generating} style={{ background: "var(--bone-light)", border: "1px solid var(--border)", padding: "6px 8px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                <option value="low">Low quality · fast</option>
                <option value="medium">Medium quality</option>
                <option value="high">High quality · slow</option>
              </select>
              <button
                onClick={generate}
                disabled={!prompt.trim() || generating}
                style={{ marginLeft: "auto", background: prompt.trim() && !generating ? "var(--clay)" : "var(--border)", color: prompt.trim() && !generating ? "var(--bone)" : "var(--warm-gray)", border: "none", padding: "8px 16px", cursor: prompt.trim() && !generating ? "pointer" : "not-allowed", fontSize: 11, display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}
              >
                {generating ? <Loader2 size={12} className="spin-icon" /> : <Sparkles size={12} />}
                {generating ? "GENERATING…" : "GENERATE IMAGE"}
              </button>
            </div>
            {error && (
              <div style={{ marginTop: 10, color: "var(--rose)", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                ⚠ {error}
              </div>
            )}
            {warning && !error && (
              <div style={{ marginTop: 10, color: "var(--gold)", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
                ⚠ {warning}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--warm-gray)", fontStyle: "italic" }}>
              High quality at 1024×1024 takes 30–90 seconds. Images persist to the team gallery when Vercel Blob is enabled.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AgentWorkspace({ agent, brief, user, drafts, winnerId, upstreamLocks, workspace, visuals, onBack, onSendMessage, onSaveDraft, onSetWinner, onDeleteDraft, onRemoveImage, onSaveVisual, onDeleteVisual, onLoadDraft, onRunTournament, tournamentResult, isWaiting, refreshing, onRefresh }) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]); // [{ name, type, size, base64 }]
  const [attachError, setAttachError] = useState(null);
  const fileInputRef = useRef(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [includeImage, setIncludeImage] = useState(false);
  const [imageDescription, setImageDescription] = useState("");
  const [imageSize, setImageSize] = useState("1536x1024");
  const [imageQuality, setImageQuality] = useState("medium");
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const chatRef = useRef(null);

  const chatHistory = workspace?.chatHistory || [];
  const lastAssistantMessage = [...chatHistory].reverse().find((m) => m.role === "assistant");
  const currentDraft = lastAssistantMessage?.content;

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatHistory.length]);

  // File attachment limits — Vercel Hobby has 4.5MB body limit; base64 inflates ~33%.
  // Cap per-file generously, then enforce total request budget.
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // 5 MB per image
  const MAX_PDF_BYTES = 10 * 1024 * 1024;    // 10 MB per PDF
  const MAX_TOTAL_BASE64 = 4 * 1024 * 1024;  // ~3 MB raw — keeps request under Vercel limit

  const handleFiles = async (files) => {
    setAttachError(null);
    const newAtts = [];
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";
      if (!isImage && !isPdf) {
        setAttachError(`Skipped ${file.name} — only images and PDFs are supported.`);
        continue;
      }
      const limit = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
      if (file.size > limit) {
        setAttachError(`Skipped ${file.name} — exceeds ${isPdf ? "10MB PDF" : "5MB image"} limit.`);
        continue;
      }
      // Read as base64 (strip the "data:...;base64," prefix)
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Read failed"));
        reader.readAsDataURL(file);
      });
      newAtts.push({ name: file.name, type: file.type, size: file.size, base64 });
    }
    // Enforce total budget across already-attached + new
    const allAtts = [...attachments, ...newAtts];
    const totalBase64 = allAtts.reduce((sum, a) => sum + a.base64.length, 0);
    if (totalBase64 > MAX_TOTAL_BASE64) {
      setAttachError(`Total attached data exceeds the request limit (~3MB raw). Drop some files.`);
      return;
    }
    setAttachments(allAtts);
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
    setAttachError(null);
  };

  const send = async () => {
    if ((!input.trim() && attachments.length === 0) || isWaiting) return;
    const msg = input.trim();
    const atts = attachments;
    setInput("");
    setAttachments([]);
    setAttachError(null);
    await onSendMessage(msg, atts);
  };

  const handleSave = async () => {
    if (!draftName.trim() || !currentDraft) return;
    setSavingDraft(true);
    setSaveError(null);
    try {
      let imageDataUrl = null;
      let imagePublicUrl = null;
      let imageDesc = null;
      if (includeImage && imageDescription.trim()) {
        // Generate image first
        const imgResult = await api("/api/image", {
          prompt: imageDescription.trim(),
          size: imageSize,
          quality: imageQuality,
        });
        if (imgResult.error) throw new Error(`Image generation failed: ${imgResult.error}`);
        imageDataUrl = imgResult.image;
        imagePublicUrl = imgResult.imageUrl || null; // null if Blob not configured
        imageDesc = imageDescription.trim();
      }
      await onSaveDraft(draftName.trim(), currentDraft, imageDataUrl, imageDesc, imagePublicUrl);
      setDraftName("");
      setIncludeImage(false);
      setImageDescription("");
      setShowSaveModal(false);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSavingDraft(false);
    }
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
              onRemoveImage={() => onRemoveImage(d.id)}
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

      <ImageGenerator
        agent={agent}
        brief={brief}
        currentDraft={currentDraft}
        visuals={visuals || []}
        onSaveVisual={onSaveVisual}
        onDeleteVisual={onDeleteVisual}
      />

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
                attachments={m.attachments}
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

        <div style={{ borderTop: "1px solid var(--border)", padding: 14, background: "var(--bone-light)" }}>
          {/* Hidden file input — triggered by paperclip button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFiles(e.target.files);
              }
              e.target.value = ""; // allow re-selecting same file
            }}
          />

          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {attachments.map((att, i) => {
                const isImg = att.type.startsWith("image/");
                const sizeKB = Math.round(att.size / 1024);
                return (
                  <div
                    key={i}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      background: "var(--paper)", padding: "4px 4px 4px 8px",
                      border: "1px solid var(--border)", fontSize: 11,
                      fontFamily: "'JetBrains Mono', monospace",
                      maxWidth: 280,
                    }}
                  >
                    {isImg ? <ImageIcon size={11} color="var(--olive)" /> : <FileText size={11} color="var(--clay)" />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {att.name}
                    </span>
                    <span style={{ color: "var(--warm-gray)", fontSize: 10 }}>
                      {sizeKB < 1024 ? `${sizeKB}KB` : `${(sizeKB / 1024).toFixed(1)}MB`}
                    </span>
                    <button
                      onClick={() => removeAttachment(i)}
                      disabled={isWaiting}
                      title="Remove attachment"
                      style={{
                        background: "transparent", border: "none", cursor: "pointer",
                        color: "var(--warm-gray)", padding: "2px 4px", marginLeft: 2,
                        display: "inline-flex", alignItems: "center",
                      }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {attachError && (
            <div style={{ color: "var(--rose)", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
              ⚠ {attachError}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isWaiting}
              title="Attach images or PDFs (max 5MB image, 10MB PDF, ~3MB total)"
              style={{
                background: "var(--paper)", border: "1px solid var(--border)",
                color: "var(--ink-soft)", padding: "0 12px",
                cursor: isWaiting ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 4,
                flexShrink: 0,
              }}
            >
              <Paperclip size={14} />
            </button>
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
              disabled={(!input.trim() && attachments.length === 0) || isWaiting}
              style={{ background: (input.trim() || attachments.length > 0) && !isWaiting ? "var(--ink)" : "var(--border)", color: (input.trim() || attachments.length > 0) && !isWaiting ? "var(--bone)" : "var(--warm-gray)", border: "none", padding: "0 18px", cursor: (input.trim() || attachments.length > 0) && !isWaiting ? "pointer" : "not-allowed", fontSize: 12, display: "flex", alignItems: "center", gap: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              <Send size={13} /> SEND
            </button>
          </div>
        </div>
      </div>

      {showSaveModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
          <div className="fade-in" style={{ background: "var(--bone)", maxWidth: 540, width: "100%", padding: "28px 32px", border: "1px solid var(--ink)", maxHeight: "90vh", overflowY: "auto" }}>
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
              placeholder="e.g. Bold WWE v1"
              disabled={savingDraft}
              style={{ width: "100%", background: "var(--paper)", border: "1px solid var(--border)", padding: "9px 12px", fontSize: 15, marginBottom: 16, outline: "none", boxSizing: "border-box" }}
            />

            <div style={{ background: "var(--paper)", border: "1px solid var(--border)", padding: 14, marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: includeImage ? 12 : 0 }}>
                <input
                  type="checkbox"
                  checked={includeImage}
                  onChange={(e) => setIncludeImage(e.target.checked)}
                  disabled={savingDraft}
                  style={{ width: 16, height: 16, accentColor: "var(--clay)" }}
                />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.1em", color: "var(--ink)", fontWeight: 600, textTransform: "uppercase" }}>
                  GENERATE & ATTACH IMAGE (gpt-image-2)
                </span>
              </label>
              {includeImage && (
                <>
                  <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "var(--clay)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 5 }}>
                    Describe the image
                  </label>
                  <textarea
                    value={imageDescription}
                    onChange={(e) => setImageDescription(e.target.value)}
                    placeholder={
                      agent.id === "A6" ? "e.g. Editorial photograph of the physical brand setting — interior, lighting, materials, mood..."
                      : agent.id === "A9" ? "e.g. The advertising execution — scene, subject, mood, any text overlay..."
                      : `e.g. Visual for the ${agent.name} slide — what you want to see.`
                    }
                    rows={3}
                    disabled={savingDraft}
                    style={{ width: "100%", background: "var(--bone-light)", border: "1px solid var(--border)", padding: "8px 10px", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 10, fontFamily: "'Newsreader', Georgia, serif" }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select value={imageSize} onChange={(e) => setImageSize(e.target.value)} disabled={savingDraft} style={{ background: "var(--bone-light)", border: "1px solid var(--border)", padding: "5px 8px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                      <option value="1024x1024">Square 1024×1024</option>
                      <option value="1536x1024">Landscape 1536×1024</option>
                      <option value="1024x1536">Portrait 1024×1536</option>
                    </select>
                    <select value={imageQuality} onChange={(e) => setImageQuality(e.target.value)} disabled={savingDraft} style={{ background: "var(--bone-light)", border: "1px solid var(--border)", padding: "5px 8px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                      <option value="low">Low quality · fast</option>
                      <option value="medium">Medium quality</option>
                      <option value="high">High quality · slow</option>
                    </select>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--warm-gray)", fontStyle: "italic" }}>
                    Adds 30–90s to save time. Image stored with the draft, included in the PowerPoint export.
                  </div>
                </>
              )}
            </div>

            {saveError && (
              <div style={{ color: "var(--rose)", fontSize: 12, marginBottom: 12, fontFamily: "'JetBrains Mono', monospace", padding: "8px 10px", border: "1px solid var(--rose)" }}>
                ⚠ {saveError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowSaveModal(false)} disabled={savingDraft} style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--ink-soft)", padding: "9px 16px", cursor: savingDraft ? "not-allowed" : "pointer", fontSize: 11, letterSpacing: "0.06em" }}>
                CANCEL
              </button>
              <button onClick={handleSave} disabled={!draftName.trim() || savingDraft || (includeImage && !imageDescription.trim())} style={{ background: draftName.trim() && !savingDraft ? "var(--clay)" : "var(--border)", color: draftName.trim() && !savingDraft ? "var(--bone)" : "var(--warm-gray)", border: "none", padding: "9px 18px", cursor: draftName.trim() && !savingDraft ? "pointer" : "not-allowed", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
                {savingDraft && <Loader2 size={11} className="spin-icon" />}
                {savingDraft ? (includeImage ? "GENERATING IMAGE…" : "SAVING…") : "SAVE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportView({ brief, draftsByAgent, winners }) {
  const [ashleyReview, setAshleyReview] = useState(null);
  const [runningAshley, setRunningAshley] = useState(false);
  const [ashleyError, setAshleyError] = useState(null);
  const [pptStatus, setPptStatus] = useState("idle");

  // Gamma generation state
  const [gammaStatus, setGammaStatus] = useState("idle"); // idle | starting | polling | done | error
  const [gammaError, setGammaError] = useState(null);
  const [gammaResult, setGammaResult] = useState(null); // { gammaUrl, exportUrl, credits }
  const [gammaProgress, setGammaProgress] = useState({ attempt: 0, elapsed: 0 });

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

  const getWinningDrafts = () => {
    const result = {};
    for (const agent of AGENTS) {
      const agentDrafts = draftsByAgent[agent.id] || [];
      const winnerId = winners[agent.id];
      const winning = winnerId ? agentDrafts.find((d) => d.id === winnerId) : agentDrafts[agentDrafts.length - 1];
      if (winning) result[agent.id] = winning;
    }
    return result;
  };

  const runAshleyFinalReview = async () => {
    setRunningAshley(true);
    setAshleyError(null);
    setAshleyReview(null);
    try {
      const winning = getWinningDrafts();
      if (Object.keys(winning).length === 0) {
        throw new Error("No drafts to review yet. Save at least one draft per section first.");
      }
      let promptText = "## THE DECK FOR YOUR FINAL READ\n\n";
      promptText += "### Brief\n";
      promptText += `- Product: ${brief.productIdea || "[unspecified]"}\n`;
      promptText += `- Industry: ${brief.industry || "[unspecified]"}\n`;
      promptText += `- Incumbent being disrupted: ${brief.incumbentName || "[unspecified]"}\n`;
      promptText += `- Disruption vector: ${brief.disruptionVector || "[unspecified]"}\n`;
      promptText += `- Geography: ${brief.geography || "[unspecified]"}\n`;
      if (brief.founderStory) promptText += `- Founder story: ${brief.founderStory}\n`;
      promptText += "\n";
      for (const agent of AGENTS) {
        const draft = winning[agent.id];
        if (draft) {
          promptText += `### ${agent.id} — ${agent.name} (${agent.weight}, ${agent.band} band)\n`;
          promptText += `*Author: ${draft.author}${draft.id === winners[agent.id] ? " · TOURNAMENT WINNER" : " · most recent (no tournament run)"}*\n\n`;
          promptText += draft.content + "\n\n";
          if (draft.imageDescription) {
            promptText += `*Slide image: "${draft.imageDescription}"*\n\n`;
          }
          promptText += "---\n\n";
        } else {
          promptText += `### ${agent.id} — ${agent.name} (${agent.weight})\n*No draft saved for this section.*\n\n---\n\n`;
        }
      }
      promptText += "\nNow give me your final read, Ashley. Don't soften.";

      const { text } = await callOpenAI("ashley_final", { promptText });
      setAshleyReview(text);
    } catch (e) {
      setAshleyError(e.message);
    } finally {
      setRunningAshley(false);
    }
  };

  const generatePowerPoint = async () => {
    setPptStatus("generating");
    try {
      // Dynamic import to keep client bundle slim
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pptx = new PptxGenJS();

      pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5"
      pptx.title = `${brief.productIdea?.slice(0, 60) || "Brand Experience Deck"}`;

      // Colors aligned with the app's design tokens
      const INK = "1A1A1A";
      const CLAY = "B8472A";
      const BONE = "F4EFE6";
      const WARM_GRAY = "8A8478";

      // ===== Title slide =====
      const title = pptx.addSlide();
      title.background = { color: BONE };
      title.addText("Designing Brand Experiences", {
        x: 0.7, y: 1.2, w: 12, h: 0.5,
        fontFace: "Calibri",
        fontSize: 14, color: CLAY, bold: true,
      });
      title.addText(brief.productIdea?.slice(0, 100) || "[Product idea]", {
        x: 0.7, y: 1.9, w: 12, h: 2.5,
        fontFace: "Georgia",
        fontSize: 44, color: INK, bold: true, italic: false,
      });
      title.addText(
        [
          { text: "Disrupting ", options: { color: INK } },
          { text: brief.incumbentName || "[incumbent]", options: { color: CLAY, bold: true } },
          { text: " in ", options: { color: INK } },
          { text: brief.industry || "[industry]", options: { color: INK, bold: true } },
          { text: ` via ${brief.disruptionVector || "[vector]"}`, options: { color: INK } },
        ],
        { x: 0.7, y: 5.0, w: 12, h: 0.7, fontFace: "Georgia", fontSize: 22, italic: true }
      );
      title.addText("KELLOGG–SCHULICH EMBA · DESIGNING BRAND EXPERIENCES", {
        x: 0.7, y: 6.7, w: 12, h: 0.3, fontFace: "Calibri",
        fontSize: 10, color: WARM_GRAY, charSpacing: 4,
      });

      // ===== Helper: parse a slide block into title + body =====
      const parseSlideContent = (content) => {
        // Split into slide blocks (separated by --- standalone lines)
        const blocks = content.split(/^---$/m).map((s) => s.trim()).filter(Boolean);
        return blocks.map((block) => {
          const lines = block.split("\n");
          let slideTitle = "";
          let mustSay = "";
          let body = block;
          for (const line of lines) {
            const t = line.trim();
            if (t.startsWith("# ")) {
              slideTitle = t.slice(2).replace(/^Slide\s*[A-Z]*\s*[:\-]*\s*/i, "").trim();
              break;
            }
          }
          const mustSayMatch = block.match(/\*\*Must-say:\*\*\s*(.+)/i);
          if (mustSayMatch) mustSay = mustSayMatch[1].trim();
          return { title: slideTitle || "Slide", mustSay, body };
        });
      };

      // Clean markdown for rendering on slides — keep things tight
      const stripMarkdown = (s) => {
        return s
          .replace(/^#+\s+/gm, "")
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/\*(.+?)\*/g, "$1")
          .replace(/^\s*-\s+/gm, "• ")
          .replace(/^\s*\|.*\|$/gm, "") // strip table rows (handled separately if needed)
          .replace(/\n{3,}/g, "\n\n");
      };

      const winningDrafts = getWinningDrafts();

      for (const agent of AGENTS) {
        const draft = winningDrafts[agent.id];
        if (!draft) continue;

        const blocks = parseSlideContent(draft.content);

        for (let bi = 0; bi < blocks.length; bi++) {
          const block = blocks[bi];
          const slide = pptx.addSlide();
          slide.background = { color: "FFFFFF" };

          // Header bar
          slide.addText(`${agent.id} · ${agent.name.toUpperCase()} · ${agent.weight}`, {
            x: 0.5, y: 0.3, w: 12.3, h: 0.3,
            fontFace: "Calibri", fontSize: 10, color: CLAY, bold: true, charSpacing: 3,
          });

          // Title
          slide.addText(block.title, {
            x: 0.5, y: 0.65, w: 12.3, h: 0.7,
            fontFace: "Georgia", fontSize: 28, color: INK, bold: true,
          });

          // Divider
          slide.addShape("line", {
            x: 0.5, y: 1.5, w: 1.0, h: 0,
            line: { color: CLAY, width: 2 },
          });

          // Layout: text on left, image on right if available
          const hasImage = !!(draft.imageDataUrl && bi === 0);
          const textW = hasImage ? 7.0 : 12.3;

          // Strip out the heading and metadata lines for the body
          let bodyText = block.body;
          // Remove the first heading line
          bodyText = bodyText.replace(/^#.+\n/, "");
          // Remove the metadata lines (Rubric, Must-say, Talk time) — but keep the must-say as a callout
          bodyText = bodyText.replace(/^\*\*Rubric:\*\*.*\n/gm, "");
          bodyText = bodyText.replace(/^\*\*Talk time:\*\*.*\n/gm, "");
          bodyText = bodyText.replace(/^\*\*Must-say:\*\*.*\n/gm, "");
          // Remove "Speaker notes" and "Visual direction" sections — they go to notes
          bodyText = bodyText.split(/##\s+(Speaker notes|Visual direction|Risks)/i)[0];

          if (block.mustSay) {
            slide.addText(`"${block.mustSay}"`, {
              x: 0.5, y: 1.7, w: textW, h: 0.6,
              fontFace: "Georgia", fontSize: 14, color: CLAY, italic: true,
            });
          }

          slide.addText(stripMarkdown(bodyText).slice(0, 1800), {
            x: 0.5, y: block.mustSay ? 2.4 : 1.7, w: textW, h: block.mustSay ? 4.5 : 5.2,
            fontFace: "Calibri", fontSize: 12, color: INK, valign: "top",
            paraSpaceAfter: 4,
          });

          if (hasImage) {
            try {
              // pptxgenjs accepts the full data URL ("data:image/png;base64,...")
              // — but NOT a `sizing` parameter combined with explicit w/h, which
              // silently drops the image in some versions. Use plain w/h.
              slide.addImage({
                data: draft.imageDataUrl,
                x: 7.7,
                y: 1.7,
                w: 5.2,
                h: 5.0,
              });
              if (draft.imageDescription) {
                slide.addText(draft.imageDescription, {
                  x: 7.7, y: 6.75, w: 5.2, h: 0.3,
                  fontFace: "Calibri", fontSize: 8, color: WARM_GRAY,
                  italic: true, align: "center",
                });
              }
            } catch (e) {
              console.error(`Failed to embed image for ${agent.id}:`, e);
            }
          }

          // Speaker notes — extract the "Speaker notes" section
          const speakerNotesMatch = draft.content.match(/##\s+Speaker notes\s*\n([\s\S]+?)(?=\n##|$)/i);
          if (speakerNotesMatch) {
            slide.addNotes(stripMarkdown(speakerNotesMatch[1].trim()));
          }

          // Footer
          slide.addText(`${agent.band} band · ${agent.weight} of grade`, {
            x: 0.5, y: 7.1, w: 12.3, h: 0.3,
            fontFace: "Calibri", fontSize: 9, color: WARM_GRAY, charSpacing: 2,
          });
        }
      }

      // ===== Closing slide =====
      const closing = pptx.addSlide();
      closing.background = { color: INK };
      closing.addText("Thank you.", {
        x: 0.7, y: 3, w: 12, h: 1.5,
        fontFace: "Georgia", fontSize: 60, color: BONE, italic: true,
      });
      closing.addText("Questions?", {
        x: 0.7, y: 4.5, w: 12, h: 0.5,
        fontFace: "Calibri", fontSize: 18, color: CLAY,
      });

      await pptx.writeFile({ fileName: `brand_lab_deck_${Date.now()}.pptx` });
      setPptStatus("done");
      setTimeout(() => setPptStatus("idle"), 4000);
    } catch (e) {
      console.error(e);
      alert("PowerPoint generation failed: " + e.message);
      setPptStatus("idle");
    }
  };

  // ===== Gamma generation =====
  const generateViaGamma = async () => {
    setGammaStatus("starting");
    setGammaError(null);
    setGammaResult(null);
    setGammaProgress({ attempt: 0, elapsed: 0 });
    const startTime = Date.now();

    try {
      // Step 1: kick off the generation (server resolves images, builds markdown,
      // POSTs to Gamma). The start response carries image-resolution diagnostics.
      const startRes = await callGamma("start", {});
      if (startRes.error) throw new Error(startRes.error);
      const { generationId, imagesResolved, imagesPossible, imageDiagnostics } = startRes;
      if (!generationId) throw new Error("No generationId returned from Gamma");

      // Step 2: poll on the client. Vercel Hobby caps functions at 60s; Gamma
      // generations take 2-3 minutes, so we MUST poll from the browser, not the server.
      setGammaStatus("polling");
      const MAX_ATTEMPTS = 60; // 60 × 5s = 5 minutes ceiling
      const POLL_INTERVAL = 5000;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        setGammaProgress({
          attempt,
          elapsed: Math.round((Date.now() - startTime) / 1000),
        });
        const statusRes = await callGamma("status", { generationId });
        if (statusRes.error) throw new Error(statusRes.error);

        if (statusRes.status === "completed") {
          setGammaResult({
            gammaUrl: statusRes.gammaUrl,
            exportUrl: statusRes.exportUrl,
            credits: statusRes.credits,
            imagesResolved,
            imagesPossible,
            imageDiagnostics,
          });
          setGammaStatus("done");
          return;
        }
        if (statusRes.status === "failed") {
          throw new Error(
            `Gamma generation failed: ${
              statusRes.error?.message || JSON.stringify(statusRes.error)
            }`
          );
        }
        // status === "pending" — keep polling
      }
      throw new Error("Gamma generation timed out after 5 minutes. Check your Gamma dashboard — it may have completed there.");
    } catch (e) {
      console.error("Gamma error:", e);
      setGammaError(e.message);
      setGammaStatus("error");
    }
  };

  const fullMd = buildDeck();
  const winnerCount = Object.keys(winners).length;
  const draftedCount = AGENTS.filter((a) => (draftsByAgent[a.id] || []).length > 0).length;

  return (
    <div className="fade-in" style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 28px 80px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--clay)", letterSpacing: "0.2em", marginBottom: 8, textTransform: "uppercase" }}>
          STEP 03 · EXPORT & FINAL REVIEW
        </div>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 600, margin: "0 0 10px", letterSpacing: "-0.01em" }}>
          Ship the deck. <em style={{ color: "var(--clay)" }}>Or hand it to Ashley first.</em>
        </h2>
        <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
          {winnerCount} winners picked · {draftedCount} of {AGENTS.length} sections drafted.
        </p>
      </div>

      {/* === Ashley's Final Read === */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--ink)", borderLeft: "4px solid var(--clay)", padding: "24px 28px", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <GraduationCap size={18} color="var(--clay)" />
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "var(--clay)", fontWeight: 600 }}>
            ASHLEY KONSON · PROFESSOR MODE
          </div>
        </div>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
          Ashley's Final Read
        </h3>
        <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 16, lineHeight: 1.6, maxWidth: 720 }}>
          Send the entire winning deck — all nine sections — to Ashley for a holistic review. He'll check narrative coherence across the brand promise, run the iceberg test (does the visible experience anchor to the strategic foundation?), score every section against the rubric, pick his favorite element of your work, give you the live-pitch question he'd ask, and predict a letter grade.
        </p>
        <button
          onClick={runAshleyFinalReview}
          disabled={runningAshley || draftedCount === 0}
          style={{
            background: !runningAshley && draftedCount > 0 ? "var(--ink)" : "var(--border)",
            color: !runningAshley && draftedCount > 0 ? "var(--bone)" : "var(--warm-gray)",
            border: "none", padding: "11px 22px",
            cursor: !runningAshley && draftedCount > 0 ? "pointer" : "not-allowed",
            fontSize: 12, display: "inline-flex", alignItems: "center", gap: 8,
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}
        >
          {runningAshley ? <Loader2 size={13} className="spin-icon" /> : <Sparkles size={13} />}
          {runningAshley ? "ASHLEY IS READING THE DECK…" : "RUN ASHLEY'S FINAL READ"}
        </button>
        {draftedCount === 0 && (
          <span style={{ marginLeft: 12, fontSize: 12, color: "var(--warm-gray)", fontStyle: "italic" }}>
            Save at least one draft first.
          </span>
        )}
        {draftedCount > 0 && draftedCount < AGENTS.length && (
          <span style={{ marginLeft: 12, fontSize: 12, color: "var(--warm-gray)", fontStyle: "italic" }}>
            {AGENTS.length - draftedCount} sections still empty — Ashley will note them as missing.
          </span>
        )}
        {ashleyError && (
          <div style={{ marginTop: 14, color: "var(--rose)", fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
            ⚠ {ashleyError}
          </div>
        )}
        {ashleyReview && (
          <div style={{ marginTop: 22, background: "var(--bone-light)", border: "1px solid var(--border)", padding: "24px 28px" }}>
            <MarkdownView content={ashleyReview} />
            <button
              onClick={() => navigator.clipboard.writeText(ashleyReview)}
              style={{ marginTop: 14, background: "transparent", border: "1px solid var(--border)", color: "var(--ink-soft)", padding: "6px 12px", cursor: "pointer", fontSize: 10, letterSpacing: "0.05em", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Copy size={10} /> COPY ASHLEY'S REVIEW
            </button>
          </div>
        )}
      </div>

      {/* === Storage maintenance — emergency Upstash bandwidth recovery === */}
      <div style={{ background: "var(--bone-light)", border: "1px solid var(--border)", padding: "12px 16px", marginBottom: 20, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ color: "var(--ink-soft)", fontSize: 11, letterSpacing: "0.04em" }}>
            STORAGE MAINTENANCE · Run if saving fails or you hit Upstash quota
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={runHealthCheck}
              disabled={healthResult === "running"}
              style={{
                background: "transparent", border: "1px solid var(--ink-soft)", color: "var(--ink-soft)",
                padding: "5px 12px", cursor: healthResult === "running" ? "wait" : "pointer",
                fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              {healthResult === "running" ? <Loader2 size={11} className="spin-icon" /> : <AlertCircle size={11} />}
              {healthResult === "running" ? "CHECKING…" : "HEALTH CHECK"}
            </button>
            <button
              onClick={compactStorage}
              disabled={compactStatus === "running"}
              style={{
                background: "transparent", border: "1px solid var(--ink-soft)", color: "var(--ink-soft)",
                padding: "5px 12px", cursor: compactStatus === "running" ? "wait" : "pointer",
                fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              {compactStatus === "running" ? <Loader2 size={11} className="spin-icon" /> : <Zap size={11} />}
              {compactStatus === "running" ? "COMPACTING…" : "COMPACT STORAGE"}
            </button>
          </div>
        </div>
        {compactStatus && compactStatus !== "running" && (
          <div style={{ marginTop: 8, fontSize: 11, color: compactStatus.startsWith("Failed") ? "var(--rose)" : "var(--olive)", lineHeight: 1.5 }}>
            {compactStatus.startsWith("Failed") ? "⚠ " : "✓ "}{compactStatus}
          </div>
        )}
        {healthResult && healthResult !== "running" && (
          <div style={{ marginTop: 10, padding: 10, background: "var(--paper)", border: "1px solid var(--border)", fontSize: 11, lineHeight: 1.6 }}>
            {healthResult.error ? (
              <div style={{ color: "var(--rose)" }}>⚠ Health check failed: {healthResult.error}</div>
            ) : (
              <>
                <div style={{
                  color: healthResult.readAfterWrite?.ok ? "var(--olive)" : "var(--rose)",
                  fontWeight: 700, marginBottom: 6,
                }}>
                  {healthResult.readAfterWrite?.ok ? "✓ WRITE→READ OK" : "✗ SPLIT-BRAIN DETECTED"}
                </div>
                <div style={{ color: "var(--ink-soft)", marginBottom: 6 }}>
                  {healthResult.readAfterWrite?.note}
                </div>
                <div style={{ color: "var(--ink-soft)" }}>
                  <strong>Env vars in this Vercel deployment:</strong><br />
                  &nbsp;&nbsp;UPSTASH_REDIS_REST_URL: {healthResult.envVars.UPSTASH_REDIS_REST_URL ? "✓ set" : "✗ missing"}<br />
                  &nbsp;&nbsp;UPSTASH_REDIS_REST_TOKEN: {healthResult.envVars.UPSTASH_REDIS_REST_TOKEN ? "✓ set" : "✗ missing"}<br />
                  &nbsp;&nbsp;KV_REST_API_URL: {healthResult.envVars.KV_REST_API_URL ? "✓ set" : "✗ missing"}<br />
                  &nbsp;&nbsp;KV_REST_API_TOKEN: {healthResult.envVars.KV_REST_API_TOKEN ? "✓ set" : "✗ missing"}<br />
                  &nbsp;&nbsp;<em>Using: {healthResult.envVars.usingDirect ? "UPSTASH direct" : healthResult.envVars.usingMarketplace ? "Vercel KV marketplace" : "unknown"}</em>
                </div>
                <div style={{ color: "var(--ink-soft)", marginTop: 6 }}>
                  <strong>Redis contents right now:</strong><br />
                  &nbsp;&nbsp;Brief present: {healthResult.brief.present ? `✓ yes (productIdea: "${healthResult.brief.summary?.productIdeaPreview || "—"}…", last edit by ${healthResult.brief.summary?.lastEditedBy || "?"})` : "✗ NO — brief is missing from Redis"}<br />
                  &nbsp;&nbsp;Drafts: {healthResult.keyCounts.drafts}<br />
                  &nbsp;&nbsp;Winners: {healthResult.keyCounts.winners}<br />
                  &nbsp;&nbsp;Visuals: {healthResult.keyCounts.visuals}<br />
                  &nbsp;&nbsp;Cover image: {healthResult.coverImage.present ? "✓ yes" : "—"}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* === Cover Image — title slide hero === */}
      <CoverImageGenerator
        brief={brief}
        coverImage={coverImage}
        onSaveCoverImage={saveCoverImage}
        onDeleteCoverImage={deleteCoverImage}
      />

      {/* === Generate via Gamma === */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--ink)", borderLeft: "4px solid var(--gold)", padding: "24px 28px", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Sparkles size={18} color="var(--gold)" />
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "var(--gold)", fontWeight: 600 }}>
            GENERATE VIA GAMMA · DESIGNED DECK
          </div>
        </div>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
          Ship the deck through Gamma
        </h3>
        <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 16, lineHeight: 1.6, maxWidth: 720 }}>
          Sends every winning section (plus attached images) to Gamma's Generate API. Gamma applies an editorial layout, then exports a real .pptx. Takes 2–3 minutes. Requires Gamma Pro plan and Vercel Blob enabled.
        </p>

        {/* Image-backfill warning */}
        {(() => {
          const allDrafts = Object.values(draftsByAgent).flat();
          const imagesNeedingBackfill = allDrafts.filter(
            (d) => d.imageDataUrl && !d.imagePublicUrl
          ).length;
          if (imagesNeedingBackfill === 0) return null;
          return (
            <div style={{ background: "var(--bone-light)", border: "1px solid var(--gold)", padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5 }}>
              <strong>{imagesNeedingBackfill}</strong> image{imagesNeedingBackfill === 1 ? "" : "s"} {imagesNeedingBackfill === 1 ? "was" : "were"} generated before Blob hosting was enabled. Gamma will auto-upload {imagesNeedingBackfill === 1 ? "it" : "them"} on first run — adds ~5 seconds.
            </div>
          );
        })()}

        <button
          onClick={generateViaGamma}
          disabled={gammaStatus === "starting" || gammaStatus === "polling" || draftedCount === 0}
          style={{
            background: gammaStatus === "done" ? "var(--olive)" : gammaStatus === "error" ? "var(--rose)" : (gammaStatus === "starting" || gammaStatus === "polling") ? "var(--gold)" : "var(--ink)",
            color: "var(--bone)", border: "none", padding: "12px 24px",
            cursor: (gammaStatus === "starting" || gammaStatus === "polling" || draftedCount === 0) ? "not-allowed" : "pointer",
            fontSize: 12, display: "inline-flex", alignItems: "center", gap: 8,
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}
        >
          {(gammaStatus === "starting" || gammaStatus === "polling") ? <Loader2 size={13} className="spin-icon" /> : gammaStatus === "done" ? <Check size={13} /> : <Sparkles size={13} />}
          {gammaStatus === "idle" && "GENERATE VIA GAMMA"}
          {gammaStatus === "starting" && "STARTING GENERATION…"}
          {gammaStatus === "polling" && `GENERATING (${gammaProgress.elapsed}s)…`}
          {gammaStatus === "done" && "GENERATED · SEE BELOW"}
          {gammaStatus === "error" && "FAILED · TRY AGAIN"}
        </button>
        {draftedCount === 0 && (
          <span style={{ marginLeft: 12, fontSize: 12, color: "var(--warm-gray)", fontStyle: "italic" }}>
            Save at least one draft first.
          </span>
        )}

        {/* Status detail during polling */}
        {gammaStatus === "polling" && (
          <div style={{ marginTop: 14, fontSize: 12, color: "var(--ink-soft)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>
            Poll {gammaProgress.attempt} · {gammaProgress.elapsed}s elapsed · Gamma typically completes in 90–180s
          </div>
        )}

        {/* Error display */}
        {gammaError && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--bone-light)", border: "1px solid var(--rose)", color: "var(--rose)", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5, wordBreak: "break-word" }}>
            ⚠ {gammaError}
          </div>
        )}

        {/* Result links */}
        {gammaResult && (
          <div style={{ marginTop: 18, padding: "18px 22px", background: "var(--bone-light)", border: "1px solid var(--olive)", borderLeft: "4px solid var(--olive)" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--olive)", letterSpacing: "0.1em", marginBottom: 10, fontWeight: 600 }}>
              ✓ READY TO DOWNLOAD
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {gammaResult.exportUrl && (
                <a
                  href={gammaResult.exportUrl}
                  download="brand_lab_deck.pptx"
                  style={{
                    background: "var(--ink)", color: "var(--bone)",
                    padding: "10px 18px", textDecoration: "none",
                    fontSize: 12, display: "inline-flex", alignItems: "center", gap: 8,
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                  }}
                >
                  <Download size={13} /> DOWNLOAD .PPTX
                </a>
              )}
              {gammaResult.gammaUrl && (
                <a
                  href={gammaResult.gammaUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: "transparent", border: "1px solid var(--ink)", color: "var(--ink)",
                    padding: "9px 16px", textDecoration: "none",
                    fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6,
                    letterSpacing: "0.06em", textTransform: "uppercase",
                  }}
                >
                  EDIT IN GAMMA →
                </a>
              )}
              {gammaResult.credits && (
                <span style={{ fontSize: 11, color: "var(--warm-gray)", fontFamily: "'JetBrains Mono', monospace", marginLeft: 6 }}>
                  {gammaResult.credits.deducted} credits used · {gammaResult.credits.remaining} remaining
                </span>
              )}
            </div>

            {/* Image diagnostics — shows which sections got images, where they came from */}
            {gammaResult.imageDiagnostics && gammaResult.imageDiagnostics.length > 0 && (
              <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--paper)", border: "1px solid var(--border)" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "var(--ink-soft)", marginBottom: 8, fontWeight: 600 }}>
                  IMAGES SHIPPED: {gammaResult.imagesResolved}/{gammaResult.imagesPossible}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                  {gammaResult.imageDiagnostics.map((d) => {
                    const ok = d.source !== "none";
                    const fromGallery = d.source === "gallery" || d.source === "gallery-cached";
                    return (
                      <div
                        key={d.agentId}
                        title={d.error || d.source}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          color: ok ? "var(--ink-soft)" : "var(--warm-gray)",
                        }}
                      >
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: ok ? (fromGallery ? "var(--gold)" : "var(--olive)") : "var(--rose)",
                          flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 10, letterSpacing: "0.04em" }}>
                          {d.agentId} {d.agentName.toUpperCase().slice(0, 14)}
                        </span>
                        <span style={{ fontSize: 9, color: "var(--warm-gray)", marginLeft: "auto" }}>
                          {d.source === "draft" ? "DRAFT" : d.source === "draft-cached" ? "DRAFT*" : d.source === "gallery" ? "GALLERY" : d.source === "gallery-cached" ? "GALLERY*" : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {gammaResult.imagesResolved < gammaResult.imagesPossible && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-soft)", lineHeight: 1.5, fontFamily: "'Newsreader', Georgia, serif", fontStyle: "italic" }}>
                    Sections without images: generate one via the Visuals panel inside that agent's workspace, then re-run.
                  </div>
                )}
              </div>
            )}

            <p style={{ fontSize: 11, color: "var(--warm-gray)", marginTop: 12, marginBottom: 0, lineHeight: 1.5 }}>
              Export URL expires in ~1 week. Download promptly. Open in PowerPoint and expect ~15 min of polish (Gamma's card layouts don't always map cleanly to 16:9 — text may need nudging).
            </p>
          </div>
        )}
      </div>

      {/* === Export buttons === */}
      <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, margin: "0 0 14px", letterSpacing: "-0.01em" }}>
        Export
      </h3>
      <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
        <button
          onClick={generatePowerPoint}
          disabled={pptStatus === "generating" || draftedCount === 0}
          style={{
            background: pptStatus === "done" ? "var(--olive)" : pptStatus === "generating" ? "var(--clay)" : "var(--ink)",
            color: "var(--bone)", border: "none", padding: "11px 20px",
            cursor: pptStatus === "generating" || draftedCount === 0 ? "not-allowed" : "pointer",
            fontSize: 12, display: "flex", alignItems: "center", gap: 8,
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}
        >
          {pptStatus === "generating" ? <Loader2 size={13} className="spin-icon" /> : pptStatus === "done" ? <Check size={13} /> : <FileText size={13} />}
          {pptStatus === "generating" ? "BUILDING DECK…" : pptStatus === "done" ? "DOWNLOADED" : "DOWNLOAD POWERPOINT"}
        </button>
        <button onClick={() => navigator.clipboard.writeText(fullMd)} style={{ background: "transparent", border: "1px solid var(--ink)", color: "var(--ink)", padding: "10px 18px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          <Copy size={13} /> COPY MARKDOWN
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
  const [visualsByAgent, setVisualsByAgent] = useState({});
  const [coverImage, setCoverImage] = useState(null);
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
      setVisualsByAgent(data.visualsByAgent || {});
      setCoverImage(data.coverImage || null);
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

  const sendAgentMessage = async (agentId, userMessage, attachments = []) => {
    const agent = AGENTS.find((a) => a.id === agentId);
    const ws = workspaces[agentId] || { chatHistory: [] };
    const upstreamLocks = getUpstreamLocks(agentId);

    // Store attachment metadata in the chat log (not the base64 — too big for localStorage)
    const attachmentsMeta = (attachments || []).map((a) => ({
      name: a.name,
      type: a.type,
      size: a.size,
    }));

    const newUserMsg = {
      role: "user",
      content: userMessage,
      author: user.handle,
      timestamp: Date.now(),
      ...(attachmentsMeta.length > 0 ? { attachments: attachmentsMeta } : {}),
    };
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
        // Full base64 attachments go to Claude for this turn only
        attachments: attachments || [],
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

  const saveDraft = async (agentId, name, content, imageDataUrl, imageDescription, imagePublicUrl) => {
    const draftId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const draft = {
      id: draftId,
      agentId,
      name,
      content,
      author: user.handle,
      createdAt: Date.now(),
    };
    if (imageDataUrl) {
      draft.imageDataUrl = imageDataUrl;
      draft.imageDescription = imageDescription || "";
      if (imagePublicUrl) {
        draft.imagePublicUrl = imagePublicUrl;
      }
    }
    try {
      await callStorage("saveDraft", { draft });
      setDraftsByAgent((prev) => ({
        ...prev,
        [agentId]: [...(prev[agentId] || []), draft],
      }));
    } catch (e) {
      // Re-throw so the modal can show it
      throw new Error("Failed to save draft: " + e.message);
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

  const removeImageFromDraft = async (agentId, draftId) => {
    if (!window.confirm("Remove the image from this draft? The text content stays. This affects everyone.")) return;
    try {
      const result = await callStorage("removeImage", { agentId, draftId });
      // Server returns the cleaned draft; mirror locally
      setDraftsByAgent((prev) => ({
        ...prev,
        [agentId]: (prev[agentId] || []).map((d) =>
          d.id === draftId ? (result.draft || (() => {
            const { imageDataUrl, imageDescription, ...rest } = d;
            return rest;
          })()) : d
        ),
      }));
    } catch (e) {
      alert("Failed to remove image: " + e.message);
    }
  };

  const saveVisual = async (agentId, visual) => {
    // Visual is built by ImageGenerator: { prompt, imageUrl, imageDataUrl?, size, quality }
    const visualId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      id: visualId,
      agentId,
      prompt: visual.prompt,
      imageUrl: visual.imageUrl, // public Blob URL; null if Blob not configured
      imageDataUrl: visual.imageDataUrl || null, // kept only if no public URL (fallback)
      size: visual.size,
      quality: visual.quality,
      author: user.handle,
      createdAt: Date.now(),
    };
    try {
      await callStorage("saveVisual", { visual: record });
      setVisualsByAgent((prev) => ({
        ...prev,
        [agentId]: [...(prev[agentId] || []), record],
      }));
      return record;
    } catch (e) {
      // Re-throw so caller can show error
      throw new Error("Failed to save visual: " + e.message);
    }
  };

  const deleteVisual = async (agentId, visualId) => {
    if (!window.confirm("Delete this image? This affects everyone.")) return;
    try {
      await callStorage("deleteVisual", { agentId, visualId });
      setVisualsByAgent((prev) => ({
        ...prev,
        [agentId]: (prev[agentId] || []).filter((v) => v.id !== visualId),
      }));
    } catch (e) {
      alert("Failed to delete visual: " + e.message);
    }
  };

  const saveCoverImage = async ({ prompt, imageDataUrl, imageUrl, size, quality }) => {
    const record = {
      prompt,
      imageDataUrl,
      imageUrl: imageUrl || null,
      size,
      quality,
      author: user.handle,
      createdAt: Date.now(),
    };
    try {
      await callStorage("saveCoverImage", { coverImage: record });
      setCoverImage(record);
      return record;
    } catch (e) {
      throw new Error("Failed to save cover image: " + e.message);
    }
  };

  const deleteCoverImage = async () => {
    if (!window.confirm("Delete the cover image? This affects everyone.")) return;
    try {
      await callStorage("deleteCoverImage");
      setCoverImage(null);
    } catch (e) {
      alert("Failed to delete cover image: " + e.message);
    }
  };

  const [compactStatus, setCompactStatus] = useState(null); // null | "running" | string
  const compactStorage = async () => {
    if (!window.confirm(
      "Compact storage will strip the base64 image data from any saved drafts, visuals, and covers " +
      "that already have public URLs. This saves Upstash bandwidth dramatically. Safe to run — your " +
      "images stay accessible via their public URLs. Continue?"
    )) return;
    setCompactStatus("running");
    try {
      const result = await callStorage("compactStorage");
      setCompactStatus(
        `Compacted: ${result.draftsCompacted} drafts, ${result.visualsCompacted} visuals` +
        (result.coverCompacted ? ", 1 cover" : "") +
        `. Freed ${result.mbFreed} MB. Refresh to load the lighter records.`
      );
    } catch (e) {
      setCompactStatus("Failed: " + e.message);
    }
  };

  const [healthResult, setHealthResult] = useState(null); // null | "running" | object
  const runHealthCheck = async () => {
    setHealthResult("running");
    try {
      const result = await callStorage("healthCheck");
      setHealthResult(result);
    } catch (e) {
      setHealthResult({ error: e.message });
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

      const { text } = await callOpenAI("tournament", { promptText });

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
              visuals={visualsByAgent[openAgentId] || []}
              onBack={() => setOpenAgentId(null)}
              onSendMessage={(msg, atts) => sendAgentMessage(openAgentId, msg, atts)}
              onSaveDraft={(name, content, imgUrl, imgDesc, imgPublicUrl) => saveDraft(openAgentId, name, content, imgUrl, imgDesc, imgPublicUrl)}
              onSetWinner={(draftId) => setDraftAsWinner(openAgentId, draftId)}
              onDeleteDraft={(draftId) => deleteDraft(openAgentId, draftId)}
              onRemoveImage={(draftId) => removeImageFromDraft(openAgentId, draftId)}
              onSaveVisual={(visual) => saveVisual(openAgentId, visual)}
              onDeleteVisual={(visualId) => deleteVisual(openAgentId, visualId)}
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
