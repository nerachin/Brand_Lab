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
  // Hero cover image on title slide — always landscape (1536x1024), use as background
  if (coverImageUrl) {
    lines.push("");
    lines.push("[BACKGROUND IMAGE — full bleed, text overlays in high-contrast color with subtle text shadow]");
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

    // Inline image — emit with orientation hint so Gamma handles layout correctly
    const imageEntry = imageUrlByAgent[agent.id];
    if (imageEntry && imageEntry.url) {
      lines.push("");
      if (imageEntry.orientation === "landscape") {
        // Full-bleed background — text overlays on top
        lines.push("[BACKGROUND IMAGE — full bleed, text overlays in high-contrast color with subtle text shadow]");
      } else {
        // Portrait or square — inline as side image (Gamma's default behavior is fine)
        lines.push("[SIDE IMAGE — place to the right of the text, do not crop]");
      }
      lines.push(imageEntry.url);
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
  const result = { agentId, url: null, source: "none", orientation: null, error: null };

  // Derive orientation from a "WxH" size string ("1536x1024" → "landscape")
  const orient = (sizeStr) => {
    if (!sizeStr || typeof sizeStr !== "string") return null;
    const [w, h] = sizeStr.split("x").map((n) => parseInt(n, 10));
    if (!w || !h) return null;
    if (w > h * 1.1) return "landscape";
    if (h > w * 1.1) return "portrait";
    return "square";
  };

  // ---- Path 1: Image attached to the winning draft ----
  if (winningDraft) {
    // If we have the base64 data, re-upload to dodge stale URLs from a previous Blob store
    if (winningDraft.imageDataUrl) {
      try {
        const fresh = await uploadBase64ImageToBlob(
          winningDraft.imageDataUrl,
          `${agentId}_${(winningDraft.name || "draft").slice(0, 20)}`
        );
        // STRIP base64 when persisting back — we now have a public URL, the base64
        // is no longer needed and just bloats Redis (preventing future mgets).
        const updated = { ...winningDraft, imagePublicUrl: fresh, imageDataUrl: null };
        await redis.set(`draft:${winningDraft.agentId}:${winningDraft.id}`, JSON.stringify(updated));
        return { ...result, url: fresh, source: "draft", orientation: orient(winningDraft.imageSize) };
      } catch (e) {
        // Re-upload failed — try existing URL if any
        if (winningDraft.imagePublicUrl) {
          return { ...result, url: winningDraft.imagePublicUrl, source: "draft-cached", orientation: orient(winningDraft.imageSize), error: `re-upload failed: ${e.message}` };
        }
        // Fall through to gallery
        result.error = `draft image upload failed: ${e.message}`;
      }
    } else if (winningDraft.imagePublicUrl) {
      // Public URL but no base64 — trust it and hope it's still valid
      return { ...result, url: winningDraft.imagePublicUrl, source: "draft-cached", orientation: orient(winningDraft.imageSize) };
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
        // STRIP base64 here too — public URL is enough going forward
        const updated = { ...latest, imageUrl: fresh, imageDataUrl: null };
        await redis.set(`visual:${latest.agentId}:${latest.id}`, JSON.stringify(updated));
        return { ...result, url: fresh, source: "gallery", orientation: orient(latest.size) };
      } catch (e) {
        if (latest.imageUrl) {
          return { ...result, url: latest.imageUrl, source: "gallery-cached", orientation: orient(latest.size), error: `re-upload failed: ${e.message}` };
        }
        return { ...result, source: "none", error: `gallery image upload failed: ${e.message}` };
      }
    } else if (latest.imageUrl) {
      return { ...result, url: latest.imageUrl, source: "gallery-cached", orientation: orient(latest.size) };
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
        // Per-key load — drafts can carry base64 image data, mget could blow past
        // Upstash's request/response size limits.
        for (const key of draftKeys) {
          try {
            const v = await redis.get(key);
            if (!v) continue;
            const d = typeof v === "string" ? JSON.parse(v) : v;
            if (!draftsByAgent[d.agentId]) draftsByAgent[d.agentId] = [];
            draftsByAgent[d.agentId].push(d);
          } catch {} // skip individual bad records
        }
        for (const a of Object.keys(draftsByAgent)) {
          draftsByAgent[a].sort((x, y) => x.createdAt - y.createdAt);
        }
      }

      const winners = {};
      if (winnerKeys.length > 0) {
        // Winners are tiny strings (draft IDs) — mget is fine here
        const vals = await redis.mget(...winnerKeys);
        for (let i = 0; i < winnerKeys.length; i++) {
          winners[winnerKeys[i].replace("winner:", "")] = vals[i];
        }
      }

      const visualsByAgent = {};
      if (visualKeys.length > 0) {
        // Per-key load — visuals can be the heaviest records, with up to ~5MB base64
        for (const key of visualKeys) {
          try {
            const v = await redis.get(key);
            if (!v) continue;
            const visual = typeof v === "string" ? JSON.parse(v) : v;
            if (!visualsByAgent[visual.agentId]) visualsByAgent[visual.agentId] = [];
            visualsByAgent[visual.agentId].push(visual);
          } catch {}
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
          imageUrlByAgent[agent.id] = {
            url: resolution.url,
            orientation: resolution.orientation || "landscape", // safe default — most images are landscape
          };
        }
        imageDiagnostics.push({
          agentId: agent.id,
          agentName: agent.name,
          source: resolution.source, // "draft" | "draft-cached" | "gallery" | "gallery-cached" | "none"
          orientation: resolution.orientation,
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
          "STRICT DESIGN CONSTRAINTS — enforce across every card. NON-NEGOTIABLE.",
          "",
          "═══ TYPOGRAPHY (HIGHEST PRIORITY — most decks fail here) ═══",
          "EXACTLY TWO type sizes across the ENTIRE deck. Not three. Not four. TWO.",
          "  · SIZE 1 (display): used ONLY for the slide headline (the # H1). Same size on every slide. Roughly 48pt.",
          "  · SIZE 2 (body): used for EVERYTHING else — pull-quotes, body text, captions, footers, attribution, lists. Roughly 18pt.",
          "Do NOT create a third size for pull-quotes. Pull-quotes use SIZE 2 in italic, not in larger type.",
          "Do NOT create a third size for captions or footnotes. They use SIZE 2 (same as body).",
          "Do NOT vary headline size from slide to slide — every # H1 is identical in size.",
          "Bold and italic are weight/style changes, NEVER size changes. A bolded word is the same size as the words around it.",
          "ONE typeface family for the whole deck. ONE. If you must pair, use ONE serif for headlines and ONE complementary sans for body — and stop there.",
          "",
          "═══ BACKGROUND IMAGE HANDLING ═══",
          "When a slide contains the literal text '[BACKGROUND IMAGE — full bleed, text overlays in high-contrast color with subtle text shadow]' followed by an image URL:",
          "  · The image becomes the FULL-BLEED background of the slide (cover the entire slide edge-to-edge, no margins).",
          "  · The image is NOT shown as a side panel or inline figure.",
          "  · ALL text (headline, pull-quote, body) overlays on TOP of the image.",
          "  · Text color is automatically chosen for high contrast against the image — if the image is dark, text is off-white (#F4F2EE). If the image is light, text is deep ink (#1A1A1A).",
          "  · Apply a SUBTLE text-shadow or scrim (15-25% black overlay on the image, behind the text) to guarantee legibility on every slide.",
          "  · DO NOT print the literal '[BACKGROUND IMAGE...]' marker on the slide — it is metadata. Strip it.",
          "  · DO NOT print the image URL as visible text — it is metadata. Strip it.",
          "When a slide contains '[SIDE IMAGE — place to the right of the text, do not crop]':",
          "  · The image goes on the right half of the slide, text on the left half.",
          "  · DO NOT print the marker as visible text. Strip it.",
          "",
          "═══ PALETTE ═══",
          "Restrained. Maximum 2 accent colors plus neutrals (cream/bone/ink/charcoal). The same accent used consistently for emphasis. NO rainbow, NO per-card color shifts, NO gradient backgrounds, NO color drift between slides.",
          "",
          "═══ LAYOUT ═══",
          "Identical composition logic across cards of the same type (background-image cards look alike; side-image cards look alike). Do not let Gamma choose a different layout per card.",
          "",
          "═══ DENSITY ═══",
          "Each card carries ONE key idea. Generous whitespace. Body text capped at ~40 words. No card should feel crowded.",
          "",
          "═══ PULL-QUOTES ═══",
          "Lines starting with '>' render as italicized body-size text — visually heroic via italic emphasis and generous whitespace around them, NOT by enlarging the type. The pull-quote IS the slide's hero message. Do not append more body text underneath.",
          "",
          "═══ FORBIDDEN ═══",
          "Emojis, decorative icons, geometric shapes, background patterns, textures, stock photography, illustration filler, oversaturated color, AI-template gloss, startup-deck aesthetics, bullet-point clutter, drop shadows on type (other than the subtle scrim on background-image slides), text boxes with colored fills, rounded-corner cards within cards.",
          "",
          "═══ REGISTER ═══",
          "Aesop, Cereal Magazine, MIT Sloan Review, A24 — NOT pitch deck, NOT corporate template, NOT consumer-app marketing.",
          "",
          "This is an MBA strategy capstone presented to professors. Restraint over novelty. Confidence over decoration. Two type sizes, period.",
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
