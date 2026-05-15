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
 * Pull just the slide-ready content from a draft, stripping all author scaffolding.
 * Returns { title, mustSay, body } — body is truncated to ~50 words to keep cards tight.
 */
function extractSlideContent(draftContent) {
  let title = "";
  let mustSay = "";
  let body = "";

  // Title from the first "# Heading" line — strip any "Slide:" prefix
  const titleMatch = draftContent.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].replace(/^Slide\s*[:\-]\s*/i, "").trim();
  }

  // Must-say quote — keep just the quoted text, drop the label
  const mustSayMatch = draftContent.match(/\*\*Must[- ]say:\*\*\s*"([^"]+)"/i);
  if (mustSayMatch) mustSay = mustSayMatch[1].trim();

  // Body — prefer "## Slide body" section, fall back to between-metadata content
  const slideBodyMatch = draftContent.match(/##\s+Slide body\s*\n([\s\S]+?)(?=\n##\s+|\n---\s*\n|$)/i);
  if (slideBodyMatch) {
    body = slideBodyMatch[1].trim();
  } else {
    // Fallback: strip the heading + metadata block, then take content up to first ## section
    let working = draftContent;
    working = working.replace(/^#\s+.+$/m, "");
    working = working.replace(/^\*\*Rubric:\*\*.*$/gm, "");
    working = working.replace(/^\*\*Must[- ]say:\*\*.*$/gm, "");
    working = working.replace(/^\*\*Talk time:\*\*.*$/gm, "");
    working = working.split(/##\s+/)[0];
    body = working.trim();
  }

  // Hard density cap — keep things tight. Take the first paragraph plus up to 4 bullets.
  body = tightenBody(body);

  return { title, mustSay, body };
}

/**
 * Trim a body to slide-appropriate density: first paragraph + up to 4 bullets,
 * total word cap ~60 words. Prevents Gamma from rendering walls of text.
 */
function tightenBody(text) {
  if (!text) return "";
  // Normalize line endings, collapse triple-newlines
  let t = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  // Split into blocks separated by blank lines
  const blocks = t.split(/\n\n+/);

  const out = [];
  let wordBudget = 60;

  for (const block of blocks) {
    if (wordBudget <= 0) break;

    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    // Is this a bullet/list block? (starts with "-" or "*" or "•")
    if (/^[-*•]\s+/.test(trimmedBlock)) {
      const bullets = trimmedBlock.split(/\n/).filter((l) => /^[-*•]\s+/.test(l.trim()));
      const keep = [];
      for (const b of bullets.slice(0, 4)) {
        const words = b.split(/\s+/).length;
        if (words > wordBudget) break;
        keep.push(b);
        wordBudget -= words;
      }
      if (keep.length) out.push(keep.join("\n"));
      continue;
    }

    // Regular paragraph — truncate to remaining budget
    const words = trimmedBlock.split(/\s+/);
    if (words.length <= wordBudget) {
      out.push(trimmedBlock);
      wordBudget -= words.length;
    } else {
      out.push(words.slice(0, wordBudget).join(" ") + "…");
      wordBudget = 0;
    }
  }

  return out.join("\n\n");
}

/**
 * Build a Gamma-friendly markdown deck from the winning drafts.
 * Image URLs come from the pre-resolved imageUrlByAgent map (built by the route).
 * coverImageUrl (optional) is inlined on the title card.
 * Slide breaks are explicit \n---\n so Gamma's cardSplit:"inputTextBreaks" honors them.
 */
function buildGammaMarkdown(brief, winningDrafts, imageUrlByAgent, coverImageUrl) {
  const lines = [];

  // ===== Title card — deliberately minimal =====
  lines.push(`# ${(brief.productIdea || "Brand Experience").slice(0, 80)}`);
  if (brief.incumbentName && brief.industry) {
    lines.push("");
    lines.push(`Disrupting ${brief.incumbentName} in ${brief.industry}.`);
  }
  // Hero cover image on title slide if one exists
  if (coverImageUrl) {
    lines.push("");
    lines.push(coverImageUrl);
  }
  lines.push("\n---\n");

  // ===== One card per section, tightly composed =====
  for (const agent of AGENTS) {
    const draft = winningDrafts[agent.id];
    if (!draft) continue;

    const { title, mustSay, body } = extractSlideContent(draft.content);

    if (title) {
      lines.push(`# ${title}`);
    } else {
      lines.push(`# ${agent.name}`);
    }

    if (mustSay) {
      lines.push("");
      lines.push(`> ${mustSay}`);
    }

    if (body) {
      lines.push("");
      lines.push(body);
    }

    // Inline image URL from resolver (draft → gallery → none)
    const imageUrl = imageUrlByAgent[agent.id];
    if (imageUrl) {
      lines.push("");
      lines.push(imageUrl);
    }

    lines.push("\n---\n");
  }

  // ===== Closing card — minimal =====
  lines.push("# Thank you");
  lines.push("");
  lines.push("Questions?");

  return lines.join("\n");
}

/**
 * Resolve the best image URL for a given agent's slide.
 *
 * Priority:
 *  1. Winning draft's image (imagePublicUrl, or upload imageDataUrl if needed)
 *  2. Latest gallery visual for this agent (imageUrl, or upload imageDataUrl)
 *  3. null — no image available
 *
 * "Stale URL" handling: if we have the base64 imageDataUrl available alongside
 * a public URL, we re-upload to be safe. This is cheap insurance against URLs
 * that became dead (e.g. user recreated the Blob store and old URLs now 404).
 *
 * Returns { url, source, agentId, error? } so the route can report diagnostics.
 */
async function resolveImageForAgent({ agentId, winningDraft, agentVisuals, redis }) {
  const result = { agentId, url: null, source: "none", error: null };

  // ---- Path 1: Image attached to the winning draft ----
  if (winningDraft) {
    // If we have the base64 data, re-upload to dodge stale URLs from a previous Blob store
    if (winningDraft.imageDataUrl) {
      try {
        const fresh = await uploadBase64ImageToBlob(
          winningDraft.imageDataUrl,
          `${agentId}_${(winningDraft.name || "draft").slice(0, 20)}`
        );
        // Persist fresh URL back to Redis so future runs don't re-upload
        const updated = { ...winningDraft, imagePublicUrl: fresh };
        await redis.set(`draft:${winningDraft.agentId}:${winningDraft.id}`, JSON.stringify(updated));
        return { ...result, url: fresh, source: "draft" };
      } catch (e) {
        // Re-upload failed — try existing URL if any
        if (winningDraft.imagePublicUrl) {
          return { ...result, url: winningDraft.imagePublicUrl, source: "draft-cached", error: `re-upload failed: ${e.message}` };
        }
        // Fall through to gallery
        result.error = `draft image upload failed: ${e.message}`;
      }
    } else if (winningDraft.imagePublicUrl) {
      // Public URL but no base64 — trust it and hope it's still valid
      return { ...result, url: winningDraft.imagePublicUrl, source: "draft-cached" };
    }
  }

  // ---- Path 2: Latest gallery visual for this agent ----
  if (agentVisuals && agentVisuals.length > 0) {
    // Sort by createdAt descending; pick the most recent
    const latest = [...agentVisuals].sort((a, b) => b.createdAt - a.createdAt)[0];

    if (latest.imageDataUrl) {
      try {
        const fresh = await uploadBase64ImageToBlob(
          latest.imageDataUrl,
          `${agentId}_gallery`
        );
        // Persist fresh URL back
        const updated = { ...latest, imageUrl: fresh };
        await redis.set(`visual:${latest.agentId}:${latest.id}`, JSON.stringify(updated));
        return { ...result, url: fresh, source: "gallery" };
      } catch (e) {
        if (latest.imageUrl) {
          return { ...result, url: latest.imageUrl, source: "gallery-cached", error: `re-upload failed: ${e.message}` };
        }
        return { ...result, source: "none", error: `gallery image upload failed: ${e.message}` };
      }
    } else if (latest.imageUrl) {
      return { ...result, url: latest.imageUrl, source: "gallery-cached" };
    }
  }

  return result; // no image found
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

      // Load brief + winners + drafts + visuals from Redis
      const briefRaw = await redis.get("brief");
      const draftKeys = await redis.keys("draft:*");
      const winnerKeys = await redis.keys("winner:*");
      const visualKeys = await redis.keys("visual:*");

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

      const visualsByAgent = {};
      if (visualKeys.length > 0) {
        const vals = await redis.mget(...visualKeys);
        for (let i = 0; i < visualKeys.length; i++) {
          const v = vals[i];
          if (!v) continue;
          const visual = typeof v === "string" ? JSON.parse(v) : v;
          if (!visualsByAgent[visual.agentId]) visualsByAgent[visual.agentId] = [];
          visualsByAgent[visual.agentId].push(visual);
        }
      }

      // Pick winning draft per section (winner if set, else most recent)
      const winningDrafts = {};
      for (const agent of AGENTS) {
        const agentDrafts = draftsByAgent[agent.id] || [];
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

      // ===== Resolve one image URL per agent =====
      // Each agent: try draft image first, fall back to latest gallery visual.
      // Re-uploads from base64 when available, to dodge stale URLs from old Blob stores.
      const imageUrlByAgent = {};
      const imageDiagnostics = []; // { agentId, agentName, source, error? }

      for (const agent of AGENTS) {
        const winningDraft = winningDrafts[agent.id];
        if (!winningDraft) continue;

        const resolution = await resolveImageForAgent({
          agentId: agent.id,
          winningDraft,
          agentVisuals: visualsByAgent[agent.id],
          redis,
        });

        if (resolution.url) {
          imageUrlByAgent[agent.id] = resolution.url;
        }
        imageDiagnostics.push({
          agentId: agent.id,
          agentName: agent.name,
          source: resolution.source, // "draft" | "draft-cached" | "gallery" | "gallery-cached" | "none"
          ...(resolution.error ? { error: resolution.error } : {}),
        });
      }

      const imagesResolved = Object.keys(imageUrlByAgent).length;
      const imagesPossible = Object.keys(winningDrafts).length;

      // ===== Resolve cover image (single slot, optional) =====
      // Re-upload from base64 to dodge stale URLs from old Blob stores, same
      // strategy as per-section images. Silent failure → no cover, deck still ships.
      let coverImageUrl = null;
      let coverImageStatus = "none";
      const coverImageRaw = await redis.get("cover_image");
      if (coverImageRaw) {
        const coverImage = typeof coverImageRaw === "string" ? JSON.parse(coverImageRaw) : coverImageRaw;
        if (coverImage.imageDataUrl) {
          try {
            coverImageUrl = await uploadBase64ImageToBlob(coverImage.imageDataUrl, "cover");
            await redis.set("cover_image", JSON.stringify({ ...coverImage, imageUrl: coverImageUrl }));
            coverImageStatus = "fresh";
          } catch (e) {
            if (coverImage.imageUrl) {
              coverImageUrl = coverImage.imageUrl;
              coverImageStatus = "cached";
            }
          }
        } else if (coverImage.imageUrl) {
          coverImageUrl = coverImage.imageUrl;
          coverImageStatus = "cached";
        }
      }

      const markdown = buildGammaMarkdown(brief, winningDrafts, imageUrlByAgent, coverImageUrl);

      // Optional theme override from body (lets you pick a Gamma theme via UI later)
      const themeId = body.themeId || undefined;

      const payload = {
        inputText: markdown,
        textMode: "preserve", // keep the team's exact wording
        format: "presentation",
        cardSplit: "inputTextBreaks",
        cardOptions: { dimensions: "16x9" },
        imageOptions: { source: "noImages" }, // we provide our own
        textOptions: {
          amount: "brief", // tight cards, not walls of text
          tone: "restrained, editorial, professional, confident",
          audience: "EMBA professors and senior executives reviewing an MBA brand-strategy capstone pitch",
        },
        exportAs: "pptx",
        additionalInstructions: [
          "STRICT DESIGN CONSTRAINTS — enforce across every card:",
          "",
          "Typography: use ONE typeface family for all cards. Headlines in a serif, body in the same serif (or in ONE complementary sans-serif). Do NOT mix three or more type families across the deck.",
          "Type sizes: maximum three sizes total across the deck — display (headline), body, caption. Do not vary headline size from card to card.",
          "",
          "Palette: restrained, maximum 2 accent colors plus neutrals (cream/bone/ink). The same accent color used consistently for emphasis. NO rainbow, NO per-card color shifts, NO gradient backgrounds.",
          "",
          "Layout: consistent across cards. Bold headline at top, supporting body below, image to the right when one is present. Same composition logic on every card — do not let Gamma choose a different layout per card.",
          "",
          "Density: each card carries ONE key idea. Generous whitespace. Body text capped at ~40 words. No card should feel crowded.",
          "",
          "Pull-quotes: render blockquote lines (lines starting with '>') as a single large italic pull-quote — that line IS the slide's hero text. Do not wrap it with extra body underneath.",
          "",
          "Forbidden: emojis, decorative icons, geometric shapes, background patterns, textures, stock photography, illustration filler, oversaturated color, AI-template gloss, startup-deck aesthetics.",
          "",
          "Register: think Aesop, Cereal Magazine, MIT Sloan Review, A24 — NOT pitch deck, NOT corporate template, NOT consumer-app marketing.",
          "",
          "This is an MBA strategy capstone presented to professors. Restraint over novelty. Confidence over decoration.",
        ].join("\n"),
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
        imagesResolved,
        imagesPossible,
        imageDiagnostics,
        coverImageStatus, // "fresh" | "cached" | "none"
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
