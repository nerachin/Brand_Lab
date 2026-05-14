# Brand Lab

A collaborative multi-agent workbench for the Kellogg–Schulich EMBA *Designing Brand Experiences* deck. Nine specialist agents (Credo, Positioning, Cast, etc.), one shared brief, a Professor agent that picks the winning draft for each section in a tournament, **GPT Image 2** for visuals, an **"Ashley Konson Final Read" mode** that simulates the actual professor on the whole deck, and **PowerPoint export** that bundles slides + speaker notes + generated images into a downloadable .pptx.

Built to be **deployed publicly** so a whole team can use it from any device with one URL — no Claude.ai conversation needed.

---

## What you're deploying

```
Browser  →  Vercel (your Next.js app)  →  Anthropic API  (your key)
                                       →  Upstash Redis  (shared team state)
```

- Vercel hosts the app at a URL like `brand-lab-yourteam.vercel.app`
- Upstash Redis stores the shared brief, drafts, winners, and tournament rulings
- Your Anthropic API key powers every agent call (you'll see the usage in your Anthropic console)

**Cost estimate for a 4-day sprint with a 5-person team:** roughly **$0 in hosting** (free tiers cover it) and **$3–$15 in Anthropic usage** depending on how chatty you get with the agents. Cap your Anthropic spend in the console if you want a hard limit.

---

## Deployment — three steps, about 15 minutes

### Step 1 — Get an Anthropic API key (3 min)

1. Go to **[console.anthropic.com](https://console.anthropic.com)** and sign up if you haven't.
2. Add a payment method (you need this even for low usage).
3. Open **Settings → API Keys → Create Key**.
4. Copy the key. It starts with `sk-ant-api03-...`. Keep it somewhere private.
5. Optional but recommended: set a **monthly spend limit** in Settings → Limits (e.g. $20 for peace of mind).

### Step 2 — Push this code to GitHub (4 min)

If you've never used GitHub: install [GitHub Desktop](https://desktop.github.com), or use the web upload at github.com/new.

1. Create a new **private** GitHub repo called `brand-lab`.
2. Upload all the files in this folder to the repo (drag-and-drop in GitHub web works fine).
3. Make sure `.env.example` is uploaded but `.env.local` is NOT (the `.gitignore` already handles this).

### Step 3 — Deploy on Vercel (8 min)

1. Go to **[vercel.com](https://vercel.com)** and sign up with your GitHub account.
2. Click **Add New → Project**.
3. Select your `brand-lab` repo. Vercel auto-detects it's Next.js — no settings to change.
4. Before clicking Deploy, expand **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` → paste the key from Step 1
   - (Optional) `TEAM_PASSWORD` → set a password your team will use to access the app
   - (Optional) `ANTHROPIC_MODEL` → defaults to `claude-sonnet-4-5-20250929`; set to `claude-opus-4-7` if you want higher quality at higher cost
5. Click **Deploy**. Wait ~90 seconds.
6. Vercel gives you a URL — **don't share it yet**, you still need Redis.

#### Add Upstash Redis (still in Vercel)

7. In your project dashboard, click **Storage → Create Database**.
8. Choose **Upstash → Redis**. Pick the free tier ("Free" plan, ~10K commands/day — plenty for a 5-person team).
9. Choose a region close to your team. Click **Create**.
10. Vercel automatically wires the Redis env vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) into your deployment.
11. Go back to **Deployments**, find the latest deployment, click the `…` menu, choose **Redeploy** (this picks up the new env vars).

That's it. The URL Vercel gave you is now your team's shared Brand Lab.

---

## Share with your team

Send your teammates:
1. The Vercel URL (e.g. `https://brand-lab-yourteam.vercel.app`)
2. The team password (if you set one)

They open the link, set their name on the welcome screen, and they're in. Every draft they save shows up in everyone's view — they just need to hit **Refresh** to pull the latest team state.

---

## How the app works

Three tabs:

1. **Brief** — one shared brief, edited by anyone, attributed with "last edited by" timestamp.
2. **Run Agents** — nine agent cards in dependency order (Strategy reads from Market, Execution reads from Strategy). Click any agent to open its workspace.
3. **Export Deck** — compiled markdown of all the winning drafts. Paste into PowerPoint.

Inside an agent workspace:

- **Team drafts list** at the top — every version anyone has saved, with author + timestamp. Three actions per draft: **Fork** (load into your workspace to iterate further), **Win** (manually crown a winner), **Delete**.
- **Iteration chat** below — your private workspace. Type instructions like "make the TTR more emotional"; the agent returns the full revised slide each turn. Hit **Save current as draft** to push your version to the team pool.
- **Run Professor Tournament** appears when 2+ drafts exist. Claude-as-Professor reads all drafts, scores each, picks a winner, and explains why. Winner is crowned automatically.

---

## Customizing

### Change the model
Set `ANTHROPIC_MODEL` env var. Sensible options:
- `claude-haiku-4-5-20251001` — cheapest, fastest, slightly less smart
- `claude-sonnet-4-5-20250929` — default, good balance
- `claude-opus-4-7` — most capable, more expensive

### Adjust agent prompts
Edit `lib/agents.js` and `lib/prompts.js`, push to GitHub, Vercel auto-redeploys.

### Add or remove agents
Same — edit the `AGENTS` array in `lib/agents.js`.

### Tighten access
Set `TEAM_PASSWORD` in Vercel env vars and only share that password with your team. The app will prompt for it on first visit.

---

## Running locally (optional, for development)

```bash
npm install
cp .env.example .env.local
# edit .env.local with your real keys
npm run dev
```

Visit `http://localhost:3000`.

---

## Troubleshooting

**"ANTHROPIC_API_KEY not set"** — Vercel env var is missing or the deployment hasn't been redeployed since you added it. Go to Settings → Environment Variables, confirm it's there, then redeploy.

**"Redis not configured"** — Marketplace integration didn't finish. Go to Storage in Vercel, confirm Upstash Redis is connected, then redeploy.

**Agent responses are getting cut off** — increase `max_tokens` in `app/api/claude/route.js` (currently 4096). Or switch to a faster model.

**Drafts aren't appearing for teammates** — they need to hit the **Refresh** button. Shared state doesn't push updates automatically; we kept it simple. (Want real-time? Swap Upstash for Convex or Firebase — that's a bigger lift.)

**Resetting everything** — there's no UI reset button by design (too dangerous on shared state). To wipe: go to Upstash Redis console → Data Browser → Flush DB. Or hit the `resetAll` action via curl on `/api/storage` from a terminal that knows the team password.

---

## File map

```
brand-lab/
├── app/
│   ├── layout.js          # Root layout, Google Fonts
│   ├── page.js            # The whole UI (single big file, by design)
│   ├── globals.css        # Design tokens & base styles
│   └── api/
│       ├── claude/route.js     # All Claude calls (agent chat, tournament, professor)
│       └── storage/route.js    # All Redis CRUD (brief, drafts, winners, tournaments)
├── lib/
│   ├── agents.js          # Agent configs + system prompts (edit to tune behavior)
│   ├── prompts.js         # Professor + Tournament prompts
│   └── redis.js           # Upstash client setup
├── package.json
├── next.config.mjs
├── jsconfig.json
└── .env.example
```

---

## License

MIT. Use it, fork it, ship the assignment. Good luck with the pitch.
