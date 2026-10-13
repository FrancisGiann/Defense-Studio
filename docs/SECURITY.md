# Security and deployment design

## Current trust boundary

The server only listens on loopback, validates exact loopback Host/Origin values, rejects cross-site requests, requires a custom header for mutations, and issues an ephemeral HttpOnly SameSite=Strict cookie from the local home-page bootstrap. API responses are no-store, content is escaped by React, production script CSP forbids inline scripts, and provider requests use one fixed HTTPS origin. Development CSP permits Vite’s local inline refresh preamble. The local owner identity is injected by the server and never accepted from request input.

This protects a single-user local installation against unrelated websites and remote callers. Another process/user with access to this computer can bootstrap local access; this is not a public authentication scheme. `HOST=0.0.0.0` or another remote bind is refused. No persistent authentication/account/security settings were modified during development.

PDF extraction accepts at most one bounded file into memory, checks PDF magic and extension, and forks a reader with text/page/heap/time limits. It extracts text only, does not execute PDF scripts, does not render/upload the original PDF, and discards bytes afterward. Native allocations are not an OS memory sandbox; hostile upload exposure requires stronger container/OS process limits before public deployment. Partial extraction and scanned pages are explicitly flagged.

Every outgoing Groq request rechecks environment opt-in, a nonblank key, matching session/paper identity, and exact selected-paper/session consent scope. Disabled restarts block previously saved sessions before any provider call or quota reservation. Secret values stay on the server. The repository keeps quota reservations across restarts. Concurrent session mutation is locked, answers have idempotent request IDs, drafts have optimistic revisions, and mock coaching is withheld from every active-session API view and active-session export. Quota/network/format/grounding failures retain submitted text as a draft and do not switch providers.

Prompt injection remains a model-level risk: document/answer content is encoded in a data role, labelled untrusted, and cannot authorize tools, outbound destinations, or settings changes. No tools are exposed to the model. Validation enforces evidence ID membership, meaningful normalized source quotes (minimum 20 characters), a final six-excerpt context cap, schemas, field lengths, and app-rendered physical page references. It cannot prove that every model sentence is semantically entailed. The interface makes that limitation explicit.

## Before multi-user deployment

Repository methods already take an owner ID, and database keys/foreign keys include owner. Tests demonstrate owner isolation. Replace the personal bootstrap with a verified identity service and derive the owner exclusively from that session. Add signed secure cookies over HTTPS, real CSRF protection, account-scoped rate limits, organization budget/token accounting, per-user retention and deletion, encrypted storage/backups, and infrastructure upload/extraction resource limits.

Move the SQLite repository behind a durable store suitable for multiple processes (Postgres or authenticated D1), use migrations and transactions for distributed concurrency/idempotency, and use private object storage for original files only if a supported viewer needs them. Keep the `PanelProvider` interface; replace Groq with another adapter only through explicit configuration and user consent. Test cross-owner access on all routes and exercise backup restoration before hosting.

The owner-private Sites deployment is a separate static synthetic preview. It contains no backend, key, thesis data, local database, or real-paper upload path. Do not turn it into the personal app by embedding secrets or private text in assets.
