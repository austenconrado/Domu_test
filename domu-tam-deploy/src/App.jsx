import React, { useState, useMemo, useRef } from "react";
import Papa from "papaparse";
import { Phone, PhoneCall, AlertTriangle, ShieldAlert, FileText, Wrench, Activity, ChevronRight, Loader2, CheckCircle2, XCircle, Clock, Sparkles, Upload, RotateCcw, Download } from "lucide-react";

// ---------------------------------------------------------------------------
// MOCK DATA — represents the 7 active clients a Domu TAM manages
// ---------------------------------------------------------------------------
const CLIENTS = [
  { id: "meridian", name: "Meridian Credit Union", vertical: "Credit Union", calls: 1842, answered: 1190, paid: 412, failed: 87, flagged: 6 },
  { id: "harborline", name: "Harborline Financial", vertical: "Auto Lending", calls: 2310, answered: 1502, paid: 601, failed: 143, flagged: 11 },
  { id: "brightpay", name: "BrightPay Servicing", vertical: "Medical Debt", calls: 986, answered: 640, paid: 198, failed: 52, flagged: 3 },
  { id: "vantex", name: "Vantex Recovery Group", vertical: "Consumer Debt", calls: 3120, answered: 1998, paid: 733, failed: 201, flagged: 14 },
  { id: "solara", name: "Solara Home Loans", vertical: "Mortgage", calls: 754, answered: 511, paid: 249, failed: 29, flagged: 2 },
  { id: "keystone", name: "Keystone Utilities Billing", vertical: "Utilities", calls: 1655, answered: 1120, paid: 588, failed: 61, flagged: 5 },
  { id: "novapoint", name: "NovaPoint Card Services", vertical: "Credit Card", calls: 2788, answered: 1804, paid: 690, failed: 176, flagged: 9 },
];

const FLAGGED_CALLS = [
  { id: "CL-88213", client: "Vantex Recovery Group", duration: "4:12", excerpt: "Agent recorded outcome as 'Payment Confirmed' but no payment method was captured in the transcript.", category: null },
  { id: "CL-88214", client: "Harborline Financial", duration: "0:38", excerpt: "Call disconnected immediately after the compliance disclosure, before the agent stated the purpose of the call.", category: null },
  { id: "CL-88215", client: "NovaPoint Card Services", duration: "3:05", excerpt: "Agent told the debtor 'this will be reported to your employer if unpaid' — not a valid collections statement.", category: null },
  { id: "CL-88216", client: "Meridian Credit Union", duration: "2:47", excerpt: "Outcome marked 'No Answer' but the transcript shows a full two-minute conversation with the account holder.", category: null },
  { id: "CL-88217", client: "Vantex Recovery Group", duration: "1:02", excerpt: "Call dropped mid-sentence while the agent was reading the required mini-Miranda disclosure.", category: null },
];

const SYSTEM_PROMPT_INTRO = `You are an expert AI voice-agent operations assistant working inside Domu, a platform that builds and manages AI voice agents for debt collection and payment-recovery calls on behalf of lending, healthcare, and utility clients. You assist a Technical Account Manager (TAM) who is responsible for translating client scripts into working voice agent prompts, diagnosing agent performance issues, and drafting compliance responses. Always write in a precise, professional, and actionable tone appropriate for an internal ops team. Never invent client-specific facts you were not given — reason only from the input provided.`;

// ---------------------------------------------------------------------------
// Claude API helper
// ---------------------------------------------------------------------------
async function callClaude(userPrompt, system) {
  // Calls our own /api/claude serverless function, which holds the real
  // Anthropic API key server-side and forwards the request. This keeps the
  // key out of client-side code entirely.
  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: system || SYSTEM_PROMPT_INTRO,
      prompt: userPrompt,
    }),
  });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API error: ${response.status} — ${errBody}`);
  }
  const data = await response.json();
  return data.text;
}

// ---------------------------------------------------------------------------
// Small UI primitives
// ---------------------------------------------------------------------------
function StatusDot({ tone }) {
  const colors = { good: "#5FD98A", warn: "#F2A93C", bad: "#EF6461", idle: "#4B5164" };
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: colors[tone] || colors.idle,
        boxShadow: tone === "good" ? "0 0 8px #5FD98A88" : tone === "bad" ? "0 0 8px #EF646188" : "none",
        flexShrink: 0,
      }}
    />
  );
}

function Mono({ children, style }) {
  return <span style={{ fontFamily: "'IBM Plex Mono', monospace", ...style }}>{children}</span>;
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#7C8CF8",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div
      style={{
        background: "#171B26",
        border: "1px solid #262B3A",
        borderRadius: 10,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Button({ children, onClick, disabled, variant = "primary", style }) {
  const base = {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    fontWeight: 500,
    padding: "10px 16px",
    borderRadius: 7,
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    transition: "opacity 0.15s ease",
    opacity: disabled ? 0.5 : 1,
  };
  const variants = {
    primary: { background: "#7C8CF8", color: "#0D0F16" },
    ghost: { background: "transparent", color: "#B8BCC8", border: "1px solid #2E3345" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// TASK 1 — Script to Voice Agent Prompt Converter
// ---------------------------------------------------------------------------
function ScriptConverter() {
  const [rawScript, setRawScript] = useState(
    `Hi, this is [AGENT NAME] calling from Vantex Recovery on behalf of [CLIENT NAME] regarding your account ending in [LAST4]. This call is an attempt to collect a debt. Can I confirm I'm speaking with [DEBTOR NAME]?\n\nIf yes: Your current balance is [BALANCE], which was due on [DUE DATE]. We'd like to help you resolve this today. Are you able to make a payment now?\n\nIf yes: Great, I can take a card payment or set up a payment plan. Which would you prefer?\nIf no / can't pay: I understand. Can we schedule a call back for a better time, or discuss a payment plan that works for your budget?\nIf hostile / requests no contact: I'll note that on the account and remove you from our calling list. Have a good day.`
  );
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const convert = async () => {
    setLoading(true);
    setError("");
    setOutput("");
    try {
      const prompt = `A client has sent us their existing human agent call script below. Convert it into a structured voice-agent call flow AND a working system prompt for an AI voice agent.

Return your answer in this exact format with these exact headers:

## CALL FLOW
A numbered, branching flow (states, transitions, and conditions) that a developer could implement as a state machine.

## VOICE AGENT SYSTEM PROMPT
A complete, ready-to-use system prompt for the voice agent, written in second person ("You are..."), including: identity/role, required compliance disclosures, conversation states, tone guidance, escalation/opt-out handling, and explicit instructions never to state anything not supported by account data provided at runtime.

Keep both sections concise but complete enough to deploy as-is.

CLIENT'S RAW SCRIPT:
"""
${rawScript}
"""`;
      const result = await callClaude(prompt);
      setOutput(result);
    } catch (e) {
      setError("Could not reach the Claude API from this environment. In a deployed build, this calls api.anthropic.com directly. Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <Card>
        <SectionLabel>Client's raw call script (input)</SectionLabel>
        <textarea
          value={rawScript}
          onChange={(e) => setRawScript(e.target.value)}
          style={{
            width: "100%",
            height: 320,
            background: "#0D0F16",
            border: "1px solid #262B3A",
            borderRadius: 8,
            color: "#D8DAE3",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12.5,
            lineHeight: 1.6,
            padding: 14,
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <div style={{ marginTop: 14 }}>
          <Button onClick={convert} disabled={loading || !rawScript.trim()}>
            {loading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            {loading ? "Generating call flow..." : "Convert to voice agent prompt"}
          </Button>
        </div>
        {error && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: "#F2A93C", lineHeight: 1.5 }}>{error}</div>
        )}
      </Card>
      <Card>
        <SectionLabel>Structured call flow + agent system prompt (output)</SectionLabel>
        {!output && !loading && (
          <div style={{ color: "#565C70", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
            Output will appear here once generated.
          </div>
        )}
        {loading && (
          <div style={{ color: "#565C70", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
            Calling Claude to structure the flow...
          </div>
        )}
        {output && (
          <div
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: 1.65,
              color: "#D8DAE3",
              maxHeight: 380,
              overflowY: "auto",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {output}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TASK 2 — Call Outcomes Dashboard (mock data, computed client-side)
// ---------------------------------------------------------------------------
// Anchor date for the mock dataset — CLIENTS totals represent the 7-day
// period ending on this date. Adjusting the date range scales the mock
// numbers proportionally so the dashboard reacts to the selected window.
const DATA_ANCHOR_DATE = new Date("2026-07-13T00:00:00");
const DATA_BASE_DAYS = 7;

const DATE_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 14 days", days: 14 },
  { label: "Last 30 days", days: 30 },
];

function toDateInputValue(d) {
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Expected CSV columns (case-insensitive, flexible on naming):
// client/name, calls, answered, paid, failed, flagged
const REQUIRED_CSV_FIELDS = {
  name: ["client", "name", "client name"],
  calls: ["calls", "total calls"],
  answered: ["answered", "calls answered"],
  paid: ["paid", "payments", "led to payment"],
  failed: ["failed", "failures"],
  flagged: ["flagged", "flagged for qa", "qa flagged"],
};

function findField(row, aliases) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const match = keys.find((k) => k.trim().toLowerCase() === alias);
    if (match) return match;
  }
  return null;
}

function parseClientCSV(rows) {
  if (!rows.length) throw new Error("The CSV file appears to be empty.");
  const sample = rows[0];
  const fieldMap = {};
  for (const [field, aliases] of Object.entries(REQUIRED_CSV_FIELDS)) {
    const match = findField(sample, aliases);
    if (!match) {
      throw new Error(
        `Could not find a column for "${field}". Expected one of: ${aliases.join(", ")}.`
      );
    }
    fieldMap[field] = match;
  }

  return rows.map((row, i) => {
    const name = String(row[fieldMap.name] ?? "").trim();
    if (!name) throw new Error(`Row ${i + 1} is missing a client name.`);

    const nums = {};
    for (const field of ["calls", "answered", "paid", "failed", "flagged"]) {
      const raw = row[fieldMap[field]];
      const val = Number(String(raw).replace(/,/g, "").trim());
      if (raw === undefined || raw === "" || Number.isNaN(val)) {
        throw new Error(`Row ${i + 1} ("${name}") has an invalid value for "${field}": "${raw}"`);
      }
      nums[field] = val;
    }

    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      vertical: "",
      calls: nums.calls,
      answered: nums.answered,
      paid: nums.paid,
      failed: nums.failed,
      flagged: nums.flagged,
    };
  });
}

const SAMPLE_CSV = `client,calls,answered,paid,failed,flagged
Meridian Credit Union,1842,1190,412,87,6
Harborline Financial,2310,1502,601,143,11
BrightPay Servicing,986,640,198,52,3
Vantex Recovery Group,3120,1998,733,201,14
Solara Home Loans,754,511,249,29,2
Keystone Utilities Billing,1655,1120,588,61,5
NovaPoint Card Services,2788,1804,690,176,9
`;

function downloadSampleCSV() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "domu-call-outcomes-sample.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function OutcomesDashboard() {
  const [endDate, setEndDate] = useState(toDateInputValue(DATA_ANCHOR_DATE));
  const [startDate, setStartDate] = useState(
    toDateInputValue(new Date(DATA_ANCHOR_DATE.getTime() - (DATA_BASE_DAYS - 1) * 86400000))
  );
  const [activePreset, setActivePreset] = useState(7);

  const [csvClients, setCsvClients] = useState(null); // null = using sample data
  const [csvFileName, setCsvFileName] = useState("");
  const [csvError, setCsvError] = useState("");
  const fileInputRef = useRef(null);

  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError("");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const parsed = parseClientCSV(results.data);
          setCsvClients(parsed);
          setCsvFileName(file.name);
        } catch (err) {
          setCsvError(err.message);
          setCsvClients(null);
          setCsvFileName("");
        }
      },
      error: (err) => {
        setCsvError("Could not read the file: " + err.message);
      },
    });
    // allow re-uploading the same filename later
    e.target.value = "";
  };

  const clearCSV = () => {
    setCsvClients(null);
    setCsvFileName("");
    setCsvError("");
  };

  const applyPreset = (days) => {
    const end = DATA_ANCHOR_DATE;
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    setStartDate(toDateInputValue(start));
    setEndDate(toDateInputValue(end));
    setActivePreset(days);
  };

  const dayCount = useMemo(() => {
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const diff = Math.round((end - start) / 86400000) + 1;
    return diff > 0 ? diff : 1;
  }, [startDate, endDate]);

  const scale = dayCount / DATA_BASE_DAYS;
  const usingCSV = csvClients !== null;

  // Scaled per-client rows for the selected date range. Mock data only
  // stores one 7-day snapshot, so we scale proportionally to approximate
  // what a real query against a call log warehouse would return. Uploaded
  // CSV data is treated as real/authoritative and is shown as-is, without
  // date-range scaling.
  const scaledClients = useMemo(() => {
    if (usingCSV) return csvClients;
    return CLIENTS.map((c) => ({
      ...c,
      calls: Math.round(c.calls * scale),
      answered: Math.round(c.answered * scale),
      paid: Math.round(c.paid * scale),
      failed: Math.round(c.failed * scale),
      flagged: Math.round(c.flagged * scale),
    }));
  }, [scale, usingCSV, csvClients]);

  const totals = useMemo(() => {
    return scaledClients.reduce(
      (acc, c) => {
        acc.calls += c.calls;
        acc.answered += c.answered;
        acc.paid += c.paid;
        acc.failed += c.failed;
        acc.flagged += c.flagged;
        return acc;
      },
      { calls: 0, answered: 0, paid: 0, failed: 0, flagged: 0 }
    );
  }, [scaledClients]);

  const answerRate = ((totals.answered / totals.calls) * 100).toFixed(1);
  const conversionRate = ((totals.paid / totals.answered) * 100).toFixed(1);
  const failRate = ((totals.failed / totals.calls) * 100).toFixed(1);

  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  const generateSummary = async () => {
    setLoading(true);
    setSummary("");
    try {
      const table = scaledClients.map(
        (c) => `${c.name}: ${c.calls} calls, ${c.answered} answered, ${c.paid} paid, ${c.failed} failed, ${c.flagged} flagged for QA`
      ).join("\n");
      const periodLabel = usingCSV
        ? `the uploaded file "${csvFileName}"`
        : `${formatDateLabel(new Date(startDate + "T00:00:00"))} – ${formatDateLabel(new Date(endDate + "T00:00:00"))} (${dayCount} days)`;
      const prompt = `Here is call outcome data across our active clients for ${periodLabel}:\n\n${table}\n\nAggregate totals: ${totals.calls} calls, ${totals.answered} answered (${answerRate}%), ${totals.paid} led to payment (${conversionRate}% of answered), ${totals.failed} failed (${failRate}%).\n\nWrite a concise executive summary (5-7 sentences) for an ops review covering this data. Call out the strongest and weakest performing clients by conversion rate, any client with a fail rate that stands out, and one clear recommendation.`;
      const result = await callClaude(prompt);
      setSummary(result);
    } catch (e) {
      setSummary("Could not reach the Claude API from this environment. In a deployed build this calls api.anthropic.com directly.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Card style={{ marginBottom: 20 }}>
        <SectionLabel>Data source</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCSVUpload}
            style={{ display: "none" }}
          />
          <Button onClick={() => fileInputRef.current?.click()} style={{ padding: "8px 14px" }}>
            <Upload size={14} /> Upload CSV
          </Button>
          <Button variant="ghost" onClick={downloadSampleCSV} style={{ padding: "8px 14px" }}>
            <Download size={14} /> Download sample CSV
          </Button>
          {usingCSV && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <StatusDot tone="good" />
                <Mono style={{ fontSize: 12, color: "#D8DAE3" }}>{csvFileName}</Mono>
                <span style={{ fontSize: 11.5, color: "#565C70" }}>({csvClients.length} clients loaded)</span>
              </div>
              <Button variant="ghost" onClick={clearCSV} style={{ padding: "6px 12px", fontSize: 12 }}>
                <RotateCcw size={13} /> Revert to sample data
              </Button>
            </>
          )}
        </div>
        {csvError && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: "#EF6461", lineHeight: 1.5 }}>{csvError}</div>
        )}
        {!usingCSV && !csvError && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#565C70", lineHeight: 1.5 }}>
            Expected columns: <Mono>client, calls, answered, paid, failed, flagged</Mono>. Download the sample above to see the exact format.
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 20, opacity: usingCSV ? 0.5 : 1 }}>
        <SectionLabel>Date range {usingCSV && "(disabled — showing uploaded CSV totals as-is)"}</SectionLabel>
        <fieldset disabled={usingCSV} style={{ border: "none", padding: 0, margin: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          {DATE_PRESETS.map((p) => (
            <Button
              key={p.label}
              variant={activePreset === p.days ? "primary" : "ghost"}
              onClick={() => applyPreset(p.days)}
              style={{ padding: "7px 12px", fontSize: 12 }}
            >
              {p.label}
            </Button>
          ))}
          <div style={{ width: 1, height: 22, background: "#262B3A", margin: "0 4px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setActivePreset(null);
              }}
              style={{
                background: "#0D0F16",
                border: "1px solid #262B3A",
                borderRadius: 6,
                color: "#D8DAE3",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                padding: "7px 10px",
              }}
            />
            <span style={{ color: "#565C70", fontSize: 12 }}>to</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setActivePreset(null);
              }}
              style={{
                background: "#0D0F16",
                border: "1px solid #262B3A",
                borderRadius: 6,
                color: "#D8DAE3",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                padding: "7px 10px",
              }}
            />
          </div>
          <Mono style={{ fontSize: 11.5, color: "#565C70", marginLeft: "auto" }}>{dayCount} day{dayCount !== 1 ? "s" : ""} selected</Mono>
        </div>
        </fieldset>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total calls", value: totals.calls.toLocaleString(), tone: "idle" },
          { label: "Answer rate", value: `${answerRate}%`, tone: "good" },
          { label: "Conversion (paid / answered)", value: `${conversionRate}%`, tone: "good" },
          { label: "Fail rate", value: `${failRate}%`, tone: "bad" },
        ].map((s) => (
          <Card key={s.label} style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <StatusDot tone={s.tone} />
              <span style={{ fontSize: 11.5, color: "#8A8FA3", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</span>
            </div>
            <Mono style={{ fontSize: 26, color: "#EDEEF0", fontWeight: 600 }}>{s.value}</Mono>
          </Card>
        ))}
      </div>

      <Card style={{ marginBottom: 20 }}>
        <SectionLabel>Per-client breakdown</SectionLabel>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #262B3A" }}>
                {["Client", "Calls", "Answered", "Paid", "Failed", "Flagged", "Conv %"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "#8A8FA3", fontWeight: 500, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scaledClients.map((c) => {
                const conv = ((c.paid / c.answered) * 100).toFixed(1);
                const convTone = conv > 33 ? "good" : conv > 28 ? "warn" : "bad";
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid #1D2130" }}>
                    <td style={{ padding: "10px", color: "#D8DAE3" }}>{c.name}</td>
                    <td style={{ padding: "10px" }}><Mono style={{ color: "#B8BCC8" }}>{c.calls}</Mono></td>
                    <td style={{ padding: "10px" }}><Mono style={{ color: "#B8BCC8" }}>{c.answered}</Mono></td>
                    <td style={{ padding: "10px" }}><Mono style={{ color: "#5FD98A" }}>{c.paid}</Mono></td>
                    <td style={{ padding: "10px" }}><Mono style={{ color: "#EF6461" }}>{c.failed}</Mono></td>
                    <td style={{ padding: "10px" }}><Mono style={{ color: c.flagged > 8 ? "#F2A93C" : "#8A8FA3" }}>{c.flagged}</Mono></td>
                    <td style={{ padding: "10px", display: "flex", alignItems: "center", gap: 6 }}>
                      <StatusDot tone={convTone} /> <Mono style={{ color: "#D8DAE3" }}>{conv}%</Mono>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <SectionLabel>AI-generated summary for selected range</SectionLabel>
          <Button onClick={generateSummary} disabled={loading} variant="ghost">
            {loading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            {loading ? "Writing..." : "Generate summary"}
          </Button>
        </div>
        {summary ? (
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.7, color: "#D8DAE3" }}>{summary}</div>
        ) : (
          <div style={{ color: "#565C70", fontSize: 13 }}>Click "Generate summary" to have Claude draft the summary for the selected date range.</div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TASK 3-lite is folded into flagged call triage below (categorization)
// ---------------------------------------------------------------------------
// Manual category options a TAM can pick by hand, each with its own color.
// "source" tracks whether a call's category came from Claude or a human,
// shown as a small label next to the category tag.
const MANUAL_CATEGORIES = [
  { label: "Wrong outcome recorded", color: "#F2A93C" },
  { label: "Agent said something incorrect", color: "#EF6461" },
  { label: "Call dropped too early", color: "#7C8CF8" },
];

function FlaggedCallTriage() {
  const [calls, setCalls] = useState(FLAGGED_CALLS);
  const [loadingId, setLoadingId] = useState(null);
  const [pickerOpenId, setPickerOpenId] = useState(null);
  const [customText, setCustomText] = useState("");

  const categorize = async (call) => {
    setLoadingId(call.id);
    setPickerOpenId(null);
    try {
      const prompt = `A voice agent call was flagged for QA review. Categorize what went wrong into exactly one of these three categories: "Wrong outcome recorded", "Agent said something incorrect", or "Call dropped too early". Respond with ONLY the category label, nothing else.

Call ID: ${call.id}
Client: ${call.client}
Duration: ${call.duration}
QA note: ${call.excerpt}`;
      const result = await callClaude(prompt);
      setCalls((prev) => prev.map((c) => (c.id === call.id ? { ...c, category: result.trim(), source: "ai" } : c)));
    } catch (e) {
      setCalls((prev) => prev.map((c) => (c.id === call.id ? { ...c, category: "API unreachable", source: "ai" } : c)));
    } finally {
      setLoadingId(null);
    }
  };

  const categorizeAll = async () => {
    for (const call of calls) {
      if (!call.category) await categorize(call);
    }
  };

  const setManualCategory = (call, label) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setCalls((prev) => prev.map((c) => (c.id === call.id ? { ...c, category: trimmed, source: "manual" } : c)));
    setPickerOpenId(null);
    setCustomText("");
  };

  const clearCategory = (call) => {
    setCalls((prev) => prev.map((c) => (c.id === call.id ? { ...c, category: null, source: null } : c)));
    setPickerOpenId(null);
  };

  const categoryTone = (cat) => {
    if (!cat) return "idle";
    if (cat.includes("dropped")) return "bad";
    if (cat.includes("incorrect")) return "bad";
    if (cat.includes("outcome")) return "warn";
    return "idle";
  };

  const categoryColor = (cat) => {
    const match = MANUAL_CATEGORIES.find((m) => m.label === cat);
    return match ? match.color : "#8A8FA3";
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <SectionLabel>Flagged calls awaiting QA triage ({calls.length})</SectionLabel>
        <Button onClick={categorizeAll} variant="ghost" disabled={loadingId !== null}>
          <Sparkles size={14} /> Categorize all
        </Button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {calls.map((call) => (
          <div key={call.id} style={{ border: "1px solid #262B3A", borderRadius: 8, padding: 14, background: "#12151F", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Mono style={{ color: "#7C8CF8", fontSize: 12.5 }}>{call.id}</Mono>
                <span style={{ color: "#8A8FA3", fontSize: 12.5 }}>{call.client}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#565C70", fontSize: 12 }}>
                  <Clock size={11} /> {call.duration}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                {call.category ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: categoryColor(call.category),
                        flexShrink: 0,
                      }}
                    />
                    <Mono style={{ fontSize: 11.5, color: "#D8DAE3" }}>{call.category}</Mono>
                    <span style={{ fontSize: 10, color: "#565C70", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {call.source === "manual" ? "· manual" : call.source === "ai" ? "· ai" : ""}
                    </span>
                    <button
                      onClick={() => clearCategory(call)}
                      title="Clear category"
                      style={{ background: "none", border: "none", color: "#565C70", cursor: "pointer", padding: 2, display: "flex" }}
                    >
                      <XCircle size={13} />
                    </button>
                  </div>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => categorize(call)} disabled={loadingId === call.id} style={{ padding: "5px 10px", fontSize: 11.5 }}>
                      {loadingId === call.id ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
                      {loadingId === call.id ? "..." : "AI categorize"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setCustomText("");
                        setPickerOpenId(pickerOpenId === call.id ? null : call.id);
                      }}
                      style={{ padding: "5px 10px", fontSize: 11.5 }}
                    >
                      Set manually
                    </Button>
                  </>
                )}

                {pickerOpenId === call.id && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      marginTop: 6,
                      background: "#1B1F2E",
                      border: "1px solid #2E3345",
                      borderRadius: 8,
                      padding: 6,
                      zIndex: 10,
                      minWidth: 240,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                    }}
                  >
                    {MANUAL_CATEGORIES.map((opt) => (
                      <div
                        key={opt.label}
                        onClick={() => setManualCategory(call, opt.label)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 10px",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 12.5,
                          color: "#D8DAE3",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#262B3A")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: opt.color, flexShrink: 0 }} />
                        {opt.label}
                      </div>
                    ))}
                    <div style={{ borderTop: "1px solid #2E3345", marginTop: 4, paddingTop: 8, paddingLeft: 10, paddingRight: 10, paddingBottom: 8 }}>
                      <div style={{ fontSize: 10.5, color: "#565C70", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                        Or type a custom category
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          type="text"
                          value={customText}
                          onChange={(e) => setCustomText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setManualCategory(call, customText);
                          }}
                          placeholder="e.g. Consent not confirmed"
                          autoFocus
                          style={{
                            flex: 1,
                            background: "#0D0F16",
                            border: "1px solid #262B3A",
                            borderRadius: 6,
                            color: "#D8DAE3",
                            fontSize: 12.5,
                            padding: "6px 8px",
                            minWidth: 0,
                          }}
                        />
                        <Button
                          onClick={() => setManualCategory(call, customText)}
                          disabled={!customText.trim()}
                          style={{ padding: "6px 10px", fontSize: 11.5 }}
                        >
                          Set
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#B8BCC8", lineHeight: 1.5 }}>{call.excerpt}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TASK 4 — Objection Handling Diagnosis + Prompt Fix
// ---------------------------------------------------------------------------
function ObjectionDiagnosis() {
  const [complaint, setComplaint] = useState(
    "The agent is folding immediately whenever a debtor says they can't afford to pay. It just says 'I understand, have a good day' instead of offering a payment plan or partial payment. We're losing conversions we used to get with our human agents."
  );
  const [currentPrompt, setCurrentPrompt] = useState(
    `You are a payment collection voice agent for Harborline Financial. When the debtor says they cannot pay, acknowledge their situation and end the call politely. Always remain professional.`
  );
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  const diagnose = async () => {
    setLoading(true);
    setOutput("");
    try {
      const prompt = `A client reported this issue with their voice agent:\n"${complaint}"\n\nHere is the agent's current relevant system prompt section:\n"""${currentPrompt}"""\n\nRespond in this exact format:\n\n## DIAGNOSIS\n2-3 sentences on the root cause in the prompt.\n\n## REVISED PROMPT SECTION\nA rewritten version of the prompt section that fixes the issue — should instruct the agent to offer a payment plan, partial payment, or reschedule before ending the call, while staying compliant (no pressure tactics, respects opt-out requests).`;
      const result = await callClaude(prompt);
      setOutput(result);
    } catch (e) {
      setOutput("Could not reach the Claude API from this environment. In a deployed build this calls api.anthropic.com directly.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <Card>
        <SectionLabel>Client complaint</SectionLabel>
        <textarea
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          style={{ width: "100%", height: 90, background: "#0D0F16", border: "1px solid #262B3A", borderRadius: 8, color: "#D8DAE3", fontFamily: "'Inter', sans-serif", fontSize: 13, padding: 12, resize: "vertical", boxSizing: "border-box", marginBottom: 16 }}
        />
        <SectionLabel>Current agent prompt (relevant section)</SectionLabel>
        <textarea
          value={currentPrompt}
          onChange={(e) => setCurrentPrompt(e.target.value)}
          style={{ width: "100%", height: 110, background: "#0D0F16", border: "1px solid #262B3A", borderRadius: 8, color: "#D8DAE3", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, padding: 12, resize: "vertical", boxSizing: "border-box" }}
        />
        <div style={{ marginTop: 14 }}>
          <Button onClick={diagnose} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : <Wrench size={14} />}
            {loading ? "Diagnosing..." : "Diagnose & fix prompt"}
          </Button>
        </div>
      </Card>
      <Card>
        <SectionLabel>Diagnosis + revised prompt</SectionLabel>
        {!output && !loading && <div style={{ color: "#565C70", fontSize: 13, padding: "40px 0", textAlign: "center" }}>Output will appear here.</div>}
        {output && (
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.65, color: "#D8DAE3", maxHeight: 380, overflowY: "auto" }}>{output}</div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TASK 6 — Compliance Investigation
// ---------------------------------------------------------------------------
function ComplianceInvestigation() {
  const [statement, setStatement] = useState(
    `"If you don't pay this today, we'll have to let your employer know about this outstanding debt."`
  );
  const [clientContext, setClientContext] = useState("NovaPoint Card Services — consumer credit card debt, debtor located in Illinois.");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  const investigate = async () => {
    setLoading(true);
    setOutput("");
    try {
      const prompt = `A client has escalated a compliance concern because their voice agent said the following on a live collections call:\n\n${statement}\n\nContext: ${clientContext}\n\nYou are investigating this on behalf of Domu. Write a professional compliance investigation summary in this format:\n\n## WHAT HAPPENED\nBrief factual restatement.\n\n## REGULATORY CONCERN\nIdentify what general FDCPA-style principle this statement likely conflicts with (e.g. third-party disclosure, threats of action not intended/legally permitted). Be precise but note this is not legal advice and outside counsel should confirm.\n\n## IMMEDIATE ACTIONS TAKEN\nWhat Domu would do right now (e.g. pull the agent's calls, patch the prompt to remove the language).\n\n## CLIENT-FACING RESPONSE\nA short, professional message (3-4 sentences) to send to the client acknowledging the issue and next steps.`;
      const result = await callClaude(prompt);
      setOutput(result);
    } catch (e) {
      setOutput("Could not reach the Claude API from this environment. In a deployed build this calls api.anthropic.com directly.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <Card>
        <SectionLabel>Flagged agent statement</SectionLabel>
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          style={{ width: "100%", height: 80, background: "#0D0F16", border: "1px solid #262B3A", borderRadius: 8, color: "#D8DAE3", fontFamily: "'Inter', sans-serif", fontSize: 13, padding: 12, resize: "vertical", boxSizing: "border-box", marginBottom: 16 }}
        />
        <SectionLabel>Context</SectionLabel>
        <textarea
          value={clientContext}
          onChange={(e) => setClientContext(e.target.value)}
          style={{ width: "100%", height: 60, background: "#0D0F16", border: "1px solid #262B3A", borderRadius: 8, color: "#D8DAE3", fontFamily: "'Inter', sans-serif", fontSize: 13, padding: 12, resize: "vertical", boxSizing: "border-box" }}
        />
        <div style={{ marginTop: 14 }}>
          <Button onClick={investigate} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : <ShieldAlert size={14} />}
            {loading ? "Investigating..." : "Investigate & draft response"}
          </Button>
        </div>
      </Card>
      <Card>
        <SectionLabel>Investigation writeup</SectionLabel>
        {!output && !loading && <div style={{ color: "#565C70", fontSize: 13, padding: "40px 0", textAlign: "center" }}>Output will appear here.</div>}
        {output && (
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.65, color: "#D8DAE3", maxHeight: 380, overflowY: "auto" }}>{output}</div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roadmap for remaining tasks (3-lite is built; 5 and 7 shown as roadmap)
// ---------------------------------------------------------------------------
function Roadmap() {
  const items = [
    {
      title: "Feature request → engineering ticket",
      desc: "Works the same way as the Compliance tab: a TAM pastes in the client's raw feature request (e.g. \"add Apple Pay as a payment option\") plus any relevant context, and Claude turns it into a structured ticket — title, description, acceptance criteria, affected client(s), and priority — formatted as plain text that pastes directly into a Jira card or kanban board column, no reformatting needed. Same underlying pattern as the compliance writeup, just pointed at a different prompt.",
    },
    {
      title: "Calling hours & holiday check",
      desc: "In plain terms: every state has its own rules about what hours of the day (and which holidays) it's legal to call someone about a debt. This feature would automatically check every call Domu's agents make against those rules — comparing the time the call was placed, the debtor's state, and a maintained calendar of holidays — and flag any call that happened outside the allowed window, before it becomes a compliance problem. Unlike the other AI-powered features in this tool, this one doesn't need Claude at all — it's just a checklist of rules being checked automatically, so it runs on its own schedule in the background and any flagged calls would show up right in the Flagged Call Triage tab alongside everything else.",
    },
  ];
  return (
    <Card>
      <SectionLabel>Not built end-to-end — here's how I'd extend this</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items.map((it) => (
          <div key={it.title} style={{ borderLeft: "2px solid #2E3345", paddingLeft: 16 }}>
            <div style={{ color: "#EDEEF0", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{it.title}</div>
            <div style={{ color: "#B8BCC8", fontSize: 13, lineHeight: 1.6 }}>{it.desc}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------
const TABS = [
  { id: "outcomes", label: "Call Outcomes", icon: Activity },
  { id: "script", label: "Script → Agent", icon: FileText },
  { id: "flagged", label: "Flagged Call Triage", icon: AlertTriangle },
  { id: "objection", label: "Objection Handling", icon: Wrench },
  { id: "compliance", label: "Compliance", icon: ShieldAlert },
  { id: "roadmap", label: "Roadmap", icon: ChevronRight },
];

export default function DomuTAMConsole() {
  const [tab, setTab] = useState("outcomes");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0D0F16",
        color: "#EDEEF0",
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #262B3A; border-radius: 4px; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1D2130", padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: "#7C8CF8", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <PhoneCall size={16} color="#0D0F16" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Domu TAM Console</div>
            <Mono style={{ fontSize: 11, color: "#565C70" }}>week of jul 07 &middot; 7 active clients</Mono>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusDot tone="good" />
          <Mono style={{ fontSize: 11.5, color: "#8A8FA3" }}>all systems live</Mono>
        </div>
      </div>

      <div style={{ display: "flex" }}>
        {/* Left nav */}
        <div style={{ width: 220, borderRight: "1px solid #1D2130", padding: "20px 14px", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "#565C70", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 10px 10px" }}>Workflows</div>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <div
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: 7,
                  cursor: "pointer",
                  fontSize: 13.5,
                  color: active ? "#EDEEF0" : "#8A8FA3",
                  background: active ? "#1B1F2E" : "transparent",
                  marginBottom: 2,
                }}
              >
                <Icon size={15} color={active ? "#7C8CF8" : "#565C70"} />
                {t.label}
              </div>
            );
          })}

          <div style={{ fontSize: 11, color: "#565C70", textTransform: "uppercase", letterSpacing: "0.08em", padding: "20px 10px 10px" }}>Active clients</div>
          {CLIENTS.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 12.5, color: "#8A8FA3" }}>
              <StatusDot tone={c.flagged > 8 ? "warn" : "good"} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            </div>
          ))}
        </div>

        {/* Main panel */}
        <div style={{ flex: 1, padding: 28, maxWidth: 1200 }}>
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{TABS.find((t) => t.id === tab)?.label}</div>
            <div style={{ fontSize: 13, color: "#8A8FA3" }}>
              {tab === "outcomes" && "Call outcome data pulled and aggregated across all 7 active clients."}
              {tab === "script" && "Paste a client's raw human-agent call script — get a structured call flow and a deployable voice-agent system prompt."}
              {tab === "flagged" && "Calls flagged by QA, categorized by what went wrong."}
              {tab === "objection" && "Diagnose a reported agent performance issue and generate a fixed prompt section."}
              {tab === "compliance" && "Investigate an escalated compliance concern and draft a client-facing response."}
              {tab === "roadmap" && "How the remaining items on the TAM checklist would be built out."}
            </div>
          </div>

          {tab === "outcomes" && <OutcomesDashboard />}
          {tab === "script" && <ScriptConverter />}
          {tab === "flagged" && <FlaggedCallTriage />}
          {tab === "objection" && <ObjectionDiagnosis />}
          {tab === "compliance" && <ComplianceInvestigation />}
          {tab === "roadmap" && <Roadmap />}
        </div>
      </div>
    </div>
  );
}
