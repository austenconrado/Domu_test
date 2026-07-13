# Domu TAM Console

An internal ops tool for a Technical Account Manager overseeing Domu's AI
voice agents across multiple active clients. Built for the TAM take-home
assignment.

## What it does

- **Call Outcomes** — aggregates call outcome data (answered / paid / failed)
  across all active clients, with an AI-generated weekly exec summary.
- **Script → Agent** — converts a client's raw human-agent call script into a
  structured call flow and a deployable voice-agent system prompt.
- **Flagged Call Triage** — categorizes QA-flagged calls (wrong outcome
  recorded, agent said something incorrect, call dropped too early).
- **Objection Handling** — diagnoses a reported agent performance issue
  against its current prompt and generates a fixed version.
- **Compliance** — investigates an escalated compliance concern and drafts
  both an internal writeup and a client-facing response.
- **Roadmap** — notes on how the remaining checklist items (engineering
  ticket generation, calling-hours/holiday compliance checks) would be built.

Client and call data in this build is mock data for demo purposes. The AI
workflows (script conversion, categorization, diagnosis, compliance writeup)
call the real Claude API through a serverless proxy.

## Architecture

- **Frontend**: React + Vite, single page, no client-side router needed.
- **Backend**: one Vercel serverless function (`/api/claude.js`) that holds
  the Anthropic API key server-side and proxies requests. The frontend never
  touches the API key directly.

## Local development

```bash
npm install
npm run dev          # frontend only, http://localhost:5173
```

To test the AI features locally you need the Vercel CLI, since `/api`
functions don't run under plain `vite dev`:

```bash
npm install -g vercel
cp .env.example .env   # fill in your real ANTHROPIC_API_KEY
vercel dev
```

## Deploying to Vercel

1. Push this folder to a GitHub repo.
2. Go to https://vercel.com/new and import the repo.
3. In the project's **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your real Anthropic API key
4. Deploy. Vercel auto-detects the Vite build and the `/api` function.

No other configuration is needed — `vercel.json` handles SPA routing so
client-side navigation doesn't 404 on refresh.

## Notes on scope

Per the assignment, this doesn't automate every item on the TAM checklist —
it builds four end-to-end (script conversion, call outcomes, objection
diagnosis, compliance investigation) plus flagged-call triage, and the
Roadmap tab explains how the remaining two (engineering ticket generation,
calling-hours compliance) would be built, including why the compliance check
is deliberately scoped as a deterministic rules job rather than an LLM task.
