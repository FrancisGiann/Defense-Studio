# PanelReady validation — October 20, 2026

Defense Studio is now named **PanelReady**. The existing GitHub repository, database filename, data-directory configuration, local cookie/header names, and orientation preference are retained for compatibility. Historical ad assets and attribution remain intact.

## Local verification

- `npm run check`: passed.
- `npm test`: 15 tests passed. Includes HTTP security, consent, persistence, drafts, quotas, PDF ingestion, source validation, and mocked provider failures. HTTP tests require loopback access; an initial restricted-sandbox run failed, then the suite passed with loopback access enabled.
- `npm run build`: passed; production assets rebuilt with the PanelReady identity.
- Production delivery smoke: passed for the page title, local cookie, health endpoint, sample paper, and sample session, using throwaway storage with Groq disabled.
- Headless Chromium UI QA: passed at desktop, 768px and 375px widths. All 16 accessibility scans reported zero violations, and there were no browser errors or horizontal overflows. The updated title and accessible home-button identity were checked. Draft persistence, evidence navigation, focus return, mock-feedback privacy, reduced motion, and synthetic PDF upload passed. Physical devices were not tested.

## Actual Groq inference

Existing local configuration was used without credential changes. Model: `openai/gpt-oss-20b`. Only the included fictional five-page library-study PDF and a synthetic typed answer were used. Private storage was not opened. The HTTP test used an isolated temporary database and removed it afterward.

Three real model calls completed, with no automatic retries:

1. HTTP session creation generated a question in approximately 951 ms: “How will you address potential bias introduced by voluntary participation in your purposive sampling strategy?” It cited retained source `p2-s1`.
2. HTTP answer submission generated feedback in approximately 736 ms. Its cited quote matched the synthetic source exactly.
3. After refining the prompt, the same synthetic question and answer produced feedback in approximately 862 ms, again with an exact source quote.

The first response suggested statistical representativeness and quantitative sensitivity analysis for a qualitative purposive study. The system instruction now explicitly asks for coaching consistent with the stated design, prioritizing depth, relevance, reflexivity, and transferability for qualitative purposive samples. The follow-up response recognized depth rather than statistical representativeness and stopped requesting sensitivity analysis. It still suggested nonparticipant/recruitment comparisons; these remain tentative coaching that requires methodological and ethics review, not requirements or evidence of study readiness. Quote validation establishes structural grounding, not semantic correctness.

## Failure and cost boundaries

The synthetic HTTP flow rejected missing consent with `403 CONSENT_REQUIRED`. An immediate answer attempt returned `429 REQUEST_GAP` without a provider call and preserved the draft. Submission after the configured 30-second gap succeeded. Repeating the completed answer request returned the saved result without another model call. Session completion succeeded.

The provider uses a 40-second abort signal, no automatic retries, and the existing daily/session limits. Deterministic transport tests cover timeout/network failure (`PROVIDER_UNAVAILABLE`), authorization failures (`PROVIDER_KEY`), server errors (`PROVIDER_ERROR`), malformed responses (`PROVIDER_FORMAT`), and quota errors (`PROVIDER_QUOTA`). These failure scenarios were simulated; no deliberate live outage or quota exhaustion was attempted.

No keys, environment files, databases, uploads, private papers, answers, or generated build assets are included in the source publication. No website deployment was performed.
