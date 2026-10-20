# PanelReady

**Practice before the panel.** A local thesis-defense rehearsal workspace for reading a paper, grounding questions in its source, and practising typed answers. Version **0.2.0** · React + TypeScript · Node.js

The included sample is a fictional teaching paper with explicitly scripted rehearsal cues. Sample coaching does not assess your answers. Live Groq inference requires your own local configuration and explicit session consent. On October 20, 2026, the configured Groq model completed a synthetic question-and-feedback flow with exact source quotes. No real thesis or private answers were tested. See [PanelReady validation](docs/VALIDATION_PANELREADY_2026-10-20.md).

## Watch the ad

**Know your why** · 23 seconds

<a href="https://raw.githubusercontent.com/FrancisGiann/Defense-Studio/main/docs/media/ads/Defense-Studio-know-your-why.mp4">
  <img src="docs/media/ads/Defense-Studio-know-your-why-cover.jpg" alt="Defense Studio — Know your why. Open the 23-second ad (MP4)." width="280">
</a>

[Watch or download the ad (MP4)](https://raw.githubusercontent.com/FrancisGiann/Defense-Studio/main/docs/media/ads/Defense-Studio-know-your-why.mp4) · [View file on GitHub](docs/media/ads/Defense-Studio-know-your-why.mp4) · [Caption and credits](docs/media/ads/Defense-Studio-caption-and-credits.txt)

Recorded before the PanelReady rename: Defense Studio 0.2.0 screens use a fictional teaching paper, a staged typed answer and scripted sample cues.

Music: [Emotional Piano Vol. 1](https://ende.app/en/song/13051-emotional-piano-vol-1) by Sascha Ende, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Excerpted, faded, gain adjusted, normalized and mixed with sound accents. Full credits are linked above.

## Included

- Local PDF ingestion, retained source excerpts, and citations to physical PDF pages.
- Proposal/final modes, guided practice, and timed mock defense.
- Typed English or Tagalog answers, autosaved drafts, session history, and focus areas.
- An evidence notebook, source review, deletion, and local workspace export.
- A fictional sample that works without a key, account, or external AI request.

## Run locally

Requires **Node.js 24 or newer** and npm. Start from a fresh checkout:

```sh
git clone https://github.com/FrancisGiann/Defense-Studio.git
cd Defense-Studio
npm ci
npm run dev
```

Open **http://127.0.0.1:4317**. Stop with Ctrl+C. A new installation starts with an empty local paper library; choose **Explore a sample** to try the fictional teaching paper.

For production assets on the same local computer:

```sh
npm run build
NODE_ENV=production npm start
```

The app binds only to `127.0.0.1`. Personal mode uses a local browser trust boundary, not production multi-user authentication. Keep it local; public hosting would require a separate authentication and deployment design. See [security boundaries](docs/SECURITY.md).

## Optional Groq setup

The default configuration disables Groq and contains no API key. To configure your own key locally:

```sh
cp .env.example .env
# Edit .env locally: set GROQ_API_KEY and GROQ_ENABLED=true.
npm run dev
```

Both `npm run dev` and `npm start` automatically load a local `.env` file through `server/index.ts`. Restart after configuration changes. Never commit the file or paste a key into chat. Before any provider request, the app asks for consent for the selected paper's excerpts and session answers. The original PDF is not sent to Groq. Provider behavior, account costs, and data policies depend on your account and current Groq terms. The application's mock transport tests are not evidence of successful live inference.

## Storage and document limits

`.data/studio.sqlite` contains extracted paper text, sessions, answers, drafts, consent scope, and quota counters. It is local private storage and is excluded from Git. Raw uploaded PDF bytes are discarded after extraction. Workspace exports contain private source text and answers; store them privately. Keep original PDFs separately.

PDF limits are 10 MB, 120 physical pages, and 600,000 extracted characters. Scanned-only and password-protected PDFs are rejected; there is no OCR, DOCX, handwriting, audio-answer, or backup-import UI. Citation checks validate page/source identity and exact quotes, not the truth of model commentary. No grade or readiness score is produced.

## Development checks

```sh
npm run check
npm test
npm run build
```

`npm run test:ui` additionally requires Chrome at `/usr/bin/google-chrome` and a separate local QA server, normally port 4318, with isolated throwaway storage. The UI script resets its workspace; use synthetic QA data, never your personal paper library.

`src/` holds the React interface, `shared/` the types and fictional sample, `server/` the local service/provider boundaries, and `tests/` deterministic ingestion, evidence, repository, transport, and HTTP tests. The only published PDF is the verified fictional teaching sample. Private databases, papers, keys, development captures, build outputs, and the owner-private hosted preview are not included.

Instrument Serif and DM Sans are installed as font packages under their SIL Open Font Licenses; Lucide icons use ISC. The ad's full third-party attributions remain in its caption/credits file. PanelReady was previously named Defense Studio. The repository URL, historical ad filenames, `DEFENSE_DATA_DIR` setting, and `.data/studio.sqlite` path are retained for compatibility.

