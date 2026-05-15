import { AGENTS } from "@/lib/agents";
import { uploadBase64ImageToBlob } from "@/lib/blob";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const maxDuration = 60;

const GAMMA_BASE = "https://public-api.gamma.app";

function getApiKey() {
  const key = process.env.GAMMA_API_KEY;
  if (!key) {
    throw new Error(
      "GAMMA_API_KEY not set. Get one from https://gamma.app/settings/api-keys (requires Pro plan or higher), then add it to Vercel env vars."
    );
  }
  return key;
}

/**
 * Build a Gamma-friendly markdown deck from the winning drafts.
 * Slide breaks are explicit \n---\n so Gamma's cardSplit:"inputTextBreaks" honors them.
 * Image URLs are inlined on their own line so Gamma picks them up.
 */
function buildGammaMarkdown(brief, winningDrafts) {
  const lines = [];

  // ===== Title card =====
  lines.push(`# ${brief.productIdea || "Brand Experience Deck"}`);
  if (brief.incumbentName && brief.industry && brief.disruptionVector) {
    lines.push("");
    lines.push(
      `Disrupting **${brief.incumbentName}** in **${brief.industry}** via ${brief.disruptionVector}.`
    );
  }
  lines.push("");
  lines.push("Kellogg–Schulich EMBA · Designing Brand Experiences");
  lines.push("\n---\n");

  // ===== One section per agent =====
  for (const agent of AGENTS) {
    const draft = winningDrafts[agent.id];
    if (!draft) continue;

    // Strip the agent-specific metadata lines (rubric/talk-time/etc) — Gamma doesn't need
    // them on the slide; they're just author scaffolding.
    let body = String(draft.content || "");
    body = body.replace(/^\*\*Rubric:\*\*.*$/gm, "");
    body = body.replace(/^\*\*Talk time:\*\*.*$/gm, "");
    // Keep "Must-say:" — Gamma will render it as a callout if formatted nicely
    // Pull out Speaker notes + Visual direction; they're not for the slide
    body = body.split(/##\s+Speaker notes/i)[0];
    body = body.split(/##\s+Visual direction/i)[0];
    body = body.split(/##\s+Risks/i)[0];
    body = body.replace(/\n{3,}/g, "\n\n").trim();

    // If the body contains its own slide breaks (multi-slide agents like A1/A6/A9),
    // honor them as-is. Otherwise this is one slide.
    lines.push(body);

    // Inline the image URL on its own line so Gamma fetches it.
    if (draft.imagePublicUrl) {
      lines.push("");
      lines.push(draft.imagePublicUrl);
      if (draft.imageDescription) {
        lines.push("");
        lines.push(`*${draft.imageDescription}*`);
      }
    }

    lines.push("\n---\n");
  }

  // ===== Closing card =====
  lines.push("# Thank you");
  lines.push("");
  lines.push("Questions?");

  return lines.join("\n");
}

/**
 * Walk every draft. For any draft that has imageDataUrl but not imagePublicUrl,
 * upload to Blob and write the URL back to Redis. Returns the updated drafts.
 * This makes the Gamma flow work for drafts created before Blob hosting existed.
 */
async function backfillImageUrls(redis, draftsByAgent) {
  const updated = JSON.parse(JSON.stringify(draftsByAgent)); // deep clone
  for (const agentId of Object.keys(updated)) {
    for (const draft of updated[agentId]) {
      if (draft.imageDataUrl && !draft.imagePublicUrl) {
        try {
          const url = await uploadBase64ImageToBlob(
            draft.imageDataUrl,
            (draft.name || "img").slice(0, 20)
          );
          draft.imagePublicUrl = url;
          // Persist back to Redis so we don't re-upload next time
          await redis.set(`draft:${draft.agentId}:${draft.id}`, JSON.stringify(draft));
        } catch (e) {
          console.warn(`Backfill upload failed for draft ${draft.id}:`, e.message);
          // Continue — Gamma will just generate without this image
        }
      }
    }
  }
  return updated;
}

export async function POST(request) {
  // Optional password gate, same as storage route
  const required = process.env.TEAM_PASSWORD;
  if (required && request.headers.get("x-team-password") !== required) {
    return Response.json({ error: "wrong password" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === "start") {
      const apiKey = getApiKey();
      const redis = getRedis();

      // Load brief + winners + drafts from Redis
      const briefRaw = await redis.get("brief");
      const draftKeys = await redis.keys("draft:*");
      const winnerKeys = await redis.keys("winner:*");

      let brief = {};
      if (briefRaw) {
        const parsed = typeof briefRaw === "string" ? JSON.parse(briefRaw) : briefRaw;
        brief = parsed.brief || {};
      }

      const draftsByAgent = {};
      if (draftKeys.length > 0) {
        const vals = await redis.mget(...draftKeys);
        for (let i = 0; i < draftKeys.length; i++) {
          const v = vals[i];
          if (!v) continue;
          const d = typeof v === "string" ? JSON.parse(v) : v;
          if (!draftsByAgent[d.agentId]) draftsByAgent[d.agentId] = [];
          draftsByAgent[d.agentId].push(d);
        }
        for (const a of Object.keys(draftsByAgent)) {
          draftsByAgent[a].sort((x, y) => x.createdAt - y.createdAt);
        }
      }

      const winners = {};
      if (winnerKeys.length > 0) {
        const vals = await redis.mget(...winnerKeys);
        for (let i = 0; i < winnerKeys.length; i++) {
          winners[winnerKeys[i].replace("winner:", "")] = vals[i];
        }
      }

      // Backfill any base64-only images → public Blob URLs
      const filledDrafts = await backfillImageUrls(redis, draftsByAgent);

      // Pick winning draft per section (winner if set, else most recent)
      const winningDrafts = {};
      for (const agent of AGENTS) {
        const agentDrafts = filledDrafts[agent.id] || [];
        if (agentDrafts.length === 0) continue;
        const winnerId = winners[agent.id];
        const winning = winnerId
          ? agentDrafts.find((d) => d.id === winnerId)
          : agentDrafts[agentDrafts.length - 1];
        if (winning) winningDrafts[agent.id] = winning;
      }

      if (Object.keys(winningDrafts).length === 0) {
        return Response.json(
          { error: "No drafts to send to Gamma. Save at least one draft first." },
          { status: 400 }
        );
      }

      const markdown = buildGammaMarkdown(brief, winningDrafts);

      // Optional theme override from body (lets you pick a Gamma theme via UI later)
      const themeId = body.themeId || undefined;

      const payload = {
        inputText: markdown,
        textMode: "preserve",
        format: "presentation",
        cardSplit: "inputTextBreaks",
        cardOptions: { dimensions: "16x9" },
        imageOptions: { source: "noImages" }, // we provide our own
        exportAs: "pptx",
        additionalInstructions:
          "Editorial layout. Bold serif headlines, generous whitespace, image on the right when present. Confident, restrained tone — this is an MBA strategy pitch, not a startup deck. Do not add stock photos or filler imagery.",
        ...(themeId ? { themeId } : {}),
      };

      const res = await fetch(`${GAMMA_BASE}/v1.0/generations`, {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        return Response.json(
          { error: `Gamma start failed (${res.status}): ${JSON.stringify(json)}` },
          { status: res.status }
        );
      }

      return Response.json({
        generationId: json.generationId,
        warnings: json.warnings,
        sectionsIncluded: Object.keys(winningDrafts).length,
      });
    }

    if (action === "status") {
      const apiKey = getApiKey();
      const { generationId } = body;
      if (!generationId) {
        return Response.json({ error: "generationId required" }, { status: 400 });
      }
      const res = await fetch(`${GAMMA_BASE}/v1.0/generations/${generationId}`, {
        headers: { "X-API-KEY": apiKey },
      });
      const json = await res.json();
      if (!res.ok) {
        return Response.json(
          { error: `Gamma status failed (${res.status}): ${JSON.stringify(json)}` },
          { status: res.status }
        );
      }
      return Response.json(json);
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("Gamma API error:", err);
    return Response.json(
      { error: err.message || "Unknown error calling Gamma" },
      { status: 500 }
    );
  }
}
