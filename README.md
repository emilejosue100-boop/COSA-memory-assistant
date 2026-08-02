# Kumbuka

**Kumbuka** — an AI agent with persistent, auditable memory for microfinance cooperative loan officers, built on CockroachDB and Claude via Amazon Bedrock.

*Kumbuka* means “remember” in Swahili.

---

## Try It Yourself

A live demo is deployed at: **https://kumbuka.vercel.app**

**Committee Admin login** (full access: Memory Assistant, Cooperative Risk Watch, approvals, settings)

| Field | Value |
|-------|-------|
| Phone | `0788123456` |
| PIN | `1234` |

**Sample Member login** (member dashboard, loan requests, payment updates)

| Field | Value |
|-------|-------|
| Phone | `0788111111` |
| PIN | `1234` |

These are seeded demo accounts on a test dataset, not real cooperative data. Use the **Committee** tab on the login screen for admin access.

> **Note:** After the Terura → Kumbuka rename, JWT storage uses `kumbuka_token` in `localStorage`. If you had an old session, log out and sign in again.

---

## Background: Why This Project Builds on Terura

This project began as an **independent, disconnected copy** of **Terura** — a bilingual (English / French) cooperative savings and lending platform for informal savings groups (*Ikimina*), originally built with a MongoDB/Mongoose backend.

Rather than build a memory assistant from scratch with fabricated demo data, this hackathon submission adapted Terura’s real member, loan, and savings structure as its foundation:

1. **Migrated the entire database layer** from MongoDB to **CockroachDB** (PostgreSQL wire protocol, Drizzle ORM).
2. **Added an AI memory layer** on top: vector-indexed officer notes, grounded Q&A, audit logging, and cooperative-wide risk scanning.
3. **Renamed the project to Kumbuka** to reflect its distinct identity and purpose.

This repository has **no shared git history** and **no runtime dependency** on the original Terura codebase. Terura provided the cooperative domain model and UI shell; Kumbuka is the memory-and-risk layer built for the CockroachDB × AWS Hackathon.

---

## The Problem This Solves

Loan officers at cooperatives manage many members and lose track of behavioral history, repayment patterns, and warnings over time — especially across officer turnover. Notes end up in notebooks, WhatsApp threads, or one officer’s memory.

**Kumbuka** gives the cooperative a persistent, honest, auditable memory system that:

- Grounds every answer in **real records** (notes, loans, timeline events)
- **Never invents** member facts — citations and compliance flags are explicit
- Logs every officer question and answer to an **immutable audit trail**
- **Proactively surfaces** cooperative-wide risk patterns (unresolved flags, broken repayment promises)
- Distinguishes **officer notes** from **member-reported payment updates**

---

## What Was Built

| Feature | Description |
|---------|-------------|
| **Per-member Q&A** | Officers ask natural-language questions; Claude answers using retrieved notes, loans, timeline, and payment updates, with citation chips. |
| **Compliance flag detection** | Notes can carry `compliance_flag` + summary; flagged context is surfaced in answers and risk scans. |
| **Immutable audit log** | Every Memory Assistant Q&A is persisted to `audit_log` (question, answer, notes used). |
| **Cross-member pattern search** | Cooperative-wide semantic search finds similar historical cases and how they resolved. |
| **Loan outcome feedback loop** | Officers record `final_outcome` on resolved loans; flag accuracy stats compare flagged vs unflagged outcomes. |
| **Unified member timeline** | Chronological view: notes, deposits, loan requests, repayments (`member_timeline` view). |
| **Session conversation memory** | Last 3 Q&A pairs per member sent as context for follow-up questions (in-memory per session). |
| **Read-only tool-use (MCP-style)** | When enabled, Claude invokes server-side read-only SQL tools against CockroachDB for open-ended cooperative queries. |
| **Cooperative Risk Watch** | On-demand proactive scan across all members for unresolved flags and broken promises not reviewed in 60 days. |
| **Voice question input** | Officers dictate questions via mic; **Groq Whisper API** transcribes into the text field (review before send). |
| **Member payment updates** | Members self-report payment intent via `POST /api/payment-update`; stored as tagged notes, visually distinct from officer notes. |
| **Admin exchange rate settings** | Committee manages USD/CDF rate; amounts stored internally in USD. RWF was removed to keep rate management simple. |

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐
│  React / Vite   │────▶│  Express API     │
│  (Kumbuka UI)   │     │  (Node 20)       │
└─────────────────┘     └────────┬─────────┘
                                 │
         ┌───────────────────────┴───────────────────────┐
         │                                               │
         │  PATH (a) — Standard Q&A & pattern search    │  PATH (b) — MCP tool-use
         │                                               │  (open-ended Q&A, Risk Watch)
         ▼                                               ▼
  ┌─────────────┐                                 ┌───────────────┐
  │  Gemini     │                                 │ Amazon Bedrock│
  │  (embed Q)  │                                 │ Claude        │
  └──────┬──────┘                                 └───────┬───────┘
         │                                                 │
         │ vector search                                   │ invokes read-only tools
         ▼                                                 ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                         CockroachDB                              │
  │              notes.embedding  │  members, loans, audit_log, …     │
  └──────────────────────────────┬───────────────────────────────────┘
                                 │
                                 │  PATH (b) queries via
                                 ▼
                    ┌────────────────────────────┐
                    │ CockroachDB Managed          │
                    │ MCP Server                   │
                    │ (read-only cooperative SQL)  │
                    └──────────────┬─────────────────┘
                                   │
                                   └──▶ results ──▶ Bedrock/Claude ──▶ answer
                                                    (Risk Watch → risk_scan_log)

  Voice input (parallel):  Mic ──▶ Groq Whisper ──▶ transcribed text ──▶ Express API
```

**Path (a) — Standard Q&A & pattern search (Memory Assistant):**

1. Officer question → Express API → **Gemini** embeds the question.
2. **CockroachDB** vector search on `notes.embedding` (`embedding <-> query`) retrieves relevant notes.
3. Retrieved notes + member context + loans + timeline → **Amazon Bedrock / Claude** → grounded answer + citations.
4. Q&A persisted to `audit_log`.

**Path (b) — MCP tool-use (open-ended questions & Cooperative Risk Watch):**

1. Officer question or **Run new scan** trigger → Express API → **Amazon Bedrock / Claude**.
2. Claude invokes **CockroachDB Managed MCP Server** read-only tools (`get_flagged_notes`, `get_broken_promise_notes`, `get_member_audit_activity`, `get_cooperative_loan_risks`).
3. **Managed MCP Server** queries **CockroachDB** → results returned to Claude.
4. Claude synthesizes final answer (Memory Assistant) or cooperative risk summary → **`risk_scan_log`** (Risk Watch).

**Voice input (parallel):** Mic audio → **Groq Whisper** → transcribed text fills the question field; officer reviews and submits via Path (a) or (b).

---

## CockroachDB Tools Used (Hackathon)

### Distributed vector indexing

Officer and member notes are embedded with **Gemini `gemini-embedding-001`** (768 dimensions via `outputDimensionality`) and stored in CockroachDB’s native **`VECTOR(768)`** column on `notes.embedding`.

Semantic retrieval uses CockroachDB’s distance operator:

```sql
ORDER BY embedding <-> '[...]'::vector
LIMIT 5
```

This powers **per-member Q&A** (notes scoped to one member) and **cooperative-wide pattern search** (notes across all members).

### Read-only tool-use against live cooperative data

When `ENABLE_MCP_TOOL_USE=true`, Claude (via Bedrock tool-use) invokes **read-only server-side tools** that run parameterized SQL against CockroachDB:

| Tool | Purpose |
|------|---------|
| `get_flagged_notes` | Unresolved compliance-flagged notes |
| `get_broken_promise_notes` | Notes tagged with broken repayment promises |
| `get_member_audit_activity` | Recent officer review activity per member |
| `get_cooperative_loan_risks` | Active loans with elevated risk signals |

These tools power the **MCP fallback path** for open-ended questions and **Cooperative Risk Watch** scans. All tools are read-only — they never mutate member or loan data.

---

## AWS Services Used (Hackathon)

| Service | Role in Kumbuka |
|---------|-----------------|
| **Amazon Bedrock** | Hosts **Claude** for grounded answering, pattern search analysis, and tool-use orchestration via the Bedrock Runtime API (`InvokeModel`, Anthropic messages format). |

### Honest substitutions

During development we evaluated additional AWS services that were **blocked by account-level activation or billing verification** outside our control:

| Evaluated | Blocker | Substitute used |
|-----------|---------|-----------------|
| **Amazon Titan Embeddings** | Service activation / billing delay | **Google Gemini** (`gemini-embedding-001`, 768-dim) for note embeddings |
| **Voyage AI** (`voyage-2`) | 403 IP blocked from cloud hosts (Render) | **Cohere** → then **Gemini** (Cohere also 403 in production) |
| **Amazon Transcribe** | `SubscriptionRequiredException` on new account | **Groq Whisper API** (`whisper-large-v3`) for voice question input |

Bedrock + Claude is the core AWS integration and is live in production paths.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Backend | Express, Node 20 |
| Database | CockroachDB, Drizzle ORM |
| Embeddings | Google Gemini (`gemini-embedding-001`, 768-dim) |
| LLM | Claude via Amazon Bedrock |
| Voice transcription | Groq Whisper API |
| Auth | JWT (bcrypt PIN hashes) |
| Deploy | Vercel (frontend), Render (API) |

---

## Setup & Local Development

### Prerequisites

- Node.js 20+
- CockroachDB cluster ([CockroachDB Cloud](https://cockroachlabs.cloud/) free tier works)
- API keys: Gemini, Groq, AWS (Bedrock)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure backend

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

| Variable | Example / placeholder | Purpose |
|----------|----------------------|---------|
| `COCKROACH_DB_URL` | `postgresql://user:pass@host:26257/defaultdb?sslmode=verify-full` | CockroachDB connection string |
| `GEMINI_API_KEY` | `AIza...` | Note + question embeddings and legacy Terura tips/opportunities ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) |
| `AWS_ACCESS_KEY_ID` | `AKIA...` | Bedrock authentication |
| `AWS_SECRET_ACCESS_KEY` | `...` | Bedrock authentication |
| `AWS_REGION` | `us-east-1` | Bedrock region (must match enabled models) |
| `BEDROCK_MODEL_ID` | `anthropic.claude-opus-4-6-v1` | Claude model ID enabled in your Bedrock console |
| `GROQ_API_KEY` | `gsk_...` | Voice question transcription ([console.groq.com](https://console.groq.com)) |
| `ENABLE_MCP_TOOL_USE` | `true` | Enables read-only tool-use + Cooperative Risk Watch |
| `JWT_SECRET` | long random string | Signs session tokens |
| `FRONTEND_URL` | `http://localhost:5173` | CORS allowed origin (no trailing slash) |
| `ADMIN_PHONE` | `0788123456` | Phone allowed for first committee bootstrap |
| `FIRECRAWL_API_KEY` | `fc-...` | Optional — live Rwanda finance scraping |

### 3. Initialize database

```bash
cd backend && npm run db:setup
```

Creates tables, vector column, `member_timeline` view, and supporting schema patches on startup. Migrates `notes.embedding` to **VECTOR(768)** when upgrading from older dimensions.

After upgrading embeddings, re-embed existing notes once:

```bash
cd backend && npm run reembed-notes
```

### 4. Seed demo accounts

```bash
npm run seed
```

Creates cooperative **Kumbuka** with demo admin (`0788123456`) and member (`0788111111`), PIN **`1234`** for both.

Optional — richer outcome/flag demo data:

```bash
cd backend && npm run seed:outcomes
```

### 5. Run locally

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:5000 |
| Health | http://localhost:5000/health |

Log in via the **Committee** tab (admin) or **Sign In** tab (member) using the credentials above.

### Frontend production override

For Vercel deploys, set `BACKEND_URL` to your Render API URL (e.g. `https://kumbuka-api.onrender.com`). See `frontend/.env.example`.

---

## Database Schema Summary

| Table | Purpose |
|-------|---------|
| `members` | Cooperative members and committee admins (phone + PIN auth) |
| `loan_requests` | Loan applications, approval status, repayment tracking, `final_outcome` |
| `transactions` | Savings deposits, withdrawals, loan repayments |
| `notes` | Officer notes and member payment updates; **`embedding VECTOR(768)`** for semantic search |
| `audit_log` | Immutable log of every Memory Assistant Q&A (question, answer, notes cited) |
| `risk_scan_log` | Cooperative Risk Watch scan results + officer review status |
| `exchange_rates` | Admin-managed USD/CDF conversion rates |

Supporting tables: `cooperatives`, `opportunities` (legacy Terura investment feed).

---

## Project Structure

```
kumbuka/
├── frontend/          React UI (Vite, Tailwind)
├── backend/
│   ├── src/
│   │   ├── db/        Drizzle schema + CockroachDB client
│   │   ├── routes/    REST API (assistant, notes, loans, risk-scan, …)
│   │   ├── services/  bedrock, embeddings, mcpReadOnlyTools, timeline, …
│   │   └── seed/      Demo cooperative + accounts
│   └── scripts/       Schema apply, reembed-notes, seed-outcomes
├── render.yaml        Render Blueprint (kumbuka-api)
└── README.md
```

---

## Known Limitations & Next Steps

- **Memory consolidation at scale** — no automatic summarization of old notes into durable member profiles yet; retrieval is per-query vector search.
- **Risk scanning is on-demand** — Cooperative Risk Watch runs when an officer clicks “Run new scan”; scheduled daily cron/Lambda is a natural next step.
- **RWF removed** — only USD (internal storage) + CDF (display) via admin-managed exchange rate, to keep conversion logic simple.
- **AWS service gaps** — Titan Embeddings and Transcribe were planned but replaced by Gemini and Groq; Voyage and Cohere were tried first but blocked or failed from Render production IPs.
- **Session memory is ephemeral** — conversation history resets on page refresh (by design for demo privacy).

---

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for the full text.

Private hackathon submission — Kumbuka cooperative memory platform.
