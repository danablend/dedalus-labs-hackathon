# Santa's World Delivery

Ho-ho-hack your way through Christmas Eve logistics. This Next.js app runs an autopiloted Santa sleigh across a stylized world map while an AI elf desk drafts festive airspace compliance memos whenever regulators flag the flight.

## What you can do
- Watch Santa auto-route through 200 land-placed houses, lighting each drop-off green.
- Follow the live flight log and current target while snow drifts over a candy-striped UI.
- Handle surprise compliance stops: regulators pause the sleigh, an AI desk (powered by Dedalus MCP) streams a memo draft with live web/semantic search, and you submit to resume flight.
- Validate drafts through a playful “elf review” before submitting the case.

## How it works
- **Autopilot loop:** Santa continuously selects a random undelivered house, eases toward it, and marks it delivered on arrival. Positions are clamped to map bounds to prevent runaway reindeer.
- **Map + placement:** A simplified world map mask ensures houses spawn on land; 200 are generated deterministically for consistent runs.
- **Compliance events:** A timer triggers regulator alerts (FAA, EASA, NORAD, etc.). The sleigh pauses, chat state is reset, and a modal opens for drafting.
- **AI drafting:** The `/api/compliance/draft` route uses `DedalusRunner` with MCP servers (`joerup/exa-mcp` for semantic search, `simon-liang/brave-search-mcp` for web search). Streaming SSE pushes tool calls and the evolving memo into the UI transcript.
- **Validation:** `/api/compliance/validate` waits 3 seconds and returns an approval string, moving the modal to “ready.” Submit resumes deliveries.
- **Atmospherics:** `react-snowfall`, layered gradients, and holiday art assets (`/public/*.png`) keep things merry.

## Quick start
1) Install: `npm install`
2) Env: create `.env.local` with at least `DEDALUS_API_KEY=...` (get from Dedalus Labs). Optional: `DEDALUS_ENV=development|production`, `DEDALUS_PROVIDER_MODEL=openai/gpt-4o-mini` (defaults shown in code).
3) Run dev server: `npm run dev`
4) Open: http://localhost:3000 — Santa starts flying instantly; compliance may trigger within a few seconds.

## Controls and tips
- The sleigh is hands-free—no manual steering. Focus on the compliance desk.
- Use the chat box in the modal to add context; Cmd/Ctrl + Enter sends.
- References appear as the AI streams; submit once the elves validate.

## Tech stack
- Next.js 16 (App Router), React 19
- Dedalus Labs SDK + `dedalus-react` chat transport
- Tailwind CSS 4, custom gradients, `react-snowfall`

## Repo layout (high level)
- `app/page.tsx` — renders the Santa game shell.
- `app/components/santa-game.tsx` — autopilot logic, UI, compliance modal, chat wiring.
- `app/api/compliance/*` — draft + validation routes using Dedalus MCP runner and SSE.
- `lib/dedalus.ts` — client builder with env-based configuration and caching.

Have fun keeping Santa’s flight merry, bright, and regulation-tight. 🎄🎁