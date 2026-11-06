# Study Planner (Render version, Gemini)

## Deploy on Render (free tier)
1. Put these files at the top level of a GitHub repo (server.js, package.json, public/).
2. On render.com: New, Web Service, pick the repo.
3. Runtime: Node. Build command: `npm install`. Start command: `npm start`. Instance type: Free.
4. Environment variables: `GEMINI_API_KEY` (required), `ACCESS_CODE` (recommended).
   Optional: `MODEL`, `FALLBACK_MODEL`, `RATE_LIMIT_PER_HOUR`.
5. Click Create Web Service. Open the onrender.com link when the deploy says Live.

Free instances sleep after inactivity, so the first visit can take about a minute to wake up.

## Run locally
npm install, then `GEMINI_API_KEY=your-key npm start` and open http://localhost:3000
