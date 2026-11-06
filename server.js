const express = require("express");
const path = require("path");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.MODEL || "gemini-3.8-flash";
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || "";
const ACCESS_CODE = process.env.ACCESS_CODE || "";
const LIMIT = +process.env.RATE_LIMIT_PER_HOUR || 20;
const LEVELS = {
  "Short summary": { text: "a short summary (about one page)", tokens: 900 },
  "Detailed study notes": { text: "detailed study notes", tokens: 2500 },
  "Revision sheet with practice questions": { text: "a revision sheet with practice questions and answers", tokens: 2500 }
};

const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 3600000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callGemini(model, prompt, tokens) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
      {
        method: "POST",
        signal: ctl.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: tokens }
        })
      }
    );
    const data = await r.json().catch(() => ({}));
    return { r, data };
  } finally { clearTimeout(timer); }
}

app.post("/api/notes", async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: "Server is missing GEMINI_API_KEY." });
  if (ACCESS_CODE && req.get("x-access-code") !== ACCESS_CODE)
    return res.status(401).json({ error: "Access code required." });
  if (limited(req.ip)) return res.status(429).json({ error: "Too many requests. Try again later." });

  const subject = String(req.body.subject || "").trim().slice(0, 120);
  const topic = String(req.body.topic || "").trim().slice(0, 160);
  const level = LEVELS[req.body.level] || LEVELS["Detailed study notes"];
  if (!subject) return res.status(400).json({ error: "Subject is required." });

  const prompt =
    `Write ${level.text} for a student on the subject "${subject}"` +
    (topic ? `, topic "${topic}"` : ", covering the core ideas a student should know") +
    ". Use plain text only: short headings in capitals, simple dashes for lists, no markdown symbols. " +
    "Make it easy to read and remember: key definitions, main ideas, one worked example where it fits, " +
    "and 3 quick self-check questions at the end.";

  const plan = [MODEL, MODEL, MODEL].concat(FALLBACK_MODEL ? [FALLBACK_MODEL] : []);
  let last = null;
  try {
    for (let i = 0; i < plan.length; i++) {
      if (i > 0) await sleep(1000 * i);
      const { r, data } = await callGemini(plan[i], prompt, level.tokens);
      if (r.ok) {
        const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
        const text = parts.map(x => x.text || "").join("\n").trim();
        if (text) return res.json({ text });
        last = { status: 502, msg: "The AI service returned no text." };
        continue;
      }
      console.error("Gemini API error:", plan[i], r.status, JSON.stringify(data));
      last = { status: r.status, msg: (data && data.error && data.error.message) || "HTTP " + r.status };
      if (r.status !== 503 && r.status !== 429) break;
    }
    if (last && (last.status === 503 || last.status === 429))
      return res.status(503).json({ error: "The AI service is busy right now. Please try again in a minute." });
    res.status(502).json({ error: "Gemini said: " + String(last ? last.msg : "unknown error").slice(0, 300) });
  } catch (e) {
    console.error(e);
    res.status(e && e.name === "AbortError" ? 504 : 502).json({ error: "Could not get a reply from the AI service. Try again." });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Study Planner running on port " + port));
