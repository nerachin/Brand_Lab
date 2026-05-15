import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

// Storage shape (all keys are simple strings, values are JSON):
// brief                  → { brief: {...}, meta: { lastEditedBy, lastEditedAt } }
// draft:<agentId>:<id>   → { id, agentId, name, content, author, createdAt }
// winner:<agentId>       → "<draftId>"
// tournament:<agentId>   → { content, runAt, byUser, pickedDraftId }

function authCheck(request) {
  // Optional password gate. If TEAM_PASSWORD is set, the client must send it.
  const required = process.env.TEAM_PASSWORD;
  if (!required) return null; // no auth
  const provided = request.headers.get("x-team-password");
  if (provided !== required) {
    return Response.json({ error: "wrong password" }, { status: 401 });
  }
  return null;
}

export async function POST(request) {
  const fail = authCheck(request);
  if (fail) return fail;

  try {
    const body = await request.json();
    const { action } = body;
    const redis = getRedis();

    switch (action) {
      case "loadAll": {
        // Return brief, all drafts grouped, all winners, all tournaments, all visuals
        const briefRaw = await redis.get("brief");
        const draftKeys = await redis.keys("draft:*");
        const winnerKeys = await redis.keys("winner:*");
        const tournamentKeys = await redis.keys("tournament:*");
        const visualKeys = await redis.keys("visual:*");

        const draftsByAgent = {};
        if (draftKeys.length > 0) {
          const draftValues = await redis.mget(...draftKeys);
          for (let i = 0; i < draftKeys.length; i++) {
            const val = draftValues[i];
            if (!val) continue;
            const draft = typeof val === "string" ? JSON.parse(val) : val;
            if (!draftsByAgent[draft.agentId]) draftsByAgent[draft.agentId] = [];
            draftsByAgent[draft.agentId].push(draft);
          }
          // sort each agent's drafts by createdAt
          for (const aId of Object.keys(draftsByAgent)) {
            draftsByAgent[aId].sort((a, b) => a.createdAt - b.createdAt);
          }
        }

        const winners = {};
        if (winnerKeys.length > 0) {
          const winnerValues = await redis.mget(...winnerKeys);
          for (let i = 0; i < winnerKeys.length; i++) {
            const agentId = winnerKeys[i].replace("winner:", "");
            winners[agentId] = winnerValues[i];
          }
        }

        const tournaments = {};
        if (tournamentKeys.length > 0) {
          const tValues = await redis.mget(...tournamentKeys);
          for (let i = 0; i < tournamentKeys.length; i++) {
            const agentId = tournamentKeys[i].replace("tournament:", "");
            const val = tValues[i];
            if (val) {
              tournaments[agentId] = typeof val === "string" ? JSON.parse(val) : val;
            }
          }
        }

        const visualsByAgent = {};
        if (visualKeys.length > 0) {
          const visualValues = await redis.mget(...visualKeys);
          for (let i = 0; i < visualKeys.length; i++) {
            const val = visualValues[i];
            if (!val) continue;
            const visual = typeof val === "string" ? JSON.parse(val) : val;
            if (!visualsByAgent[visual.agentId]) visualsByAgent[visual.agentId] = [];
            visualsByAgent[visual.agentId].push(visual);
          }
          for (const aId of Object.keys(visualsByAgent)) {
            visualsByAgent[aId].sort((a, b) => a.createdAt - b.createdAt);
          }
        }

        let brief = {};
        let briefMeta = {};
        if (briefRaw) {
          const parsed = typeof briefRaw === "string" ? JSON.parse(briefRaw) : briefRaw;
          brief = parsed.brief || {};
          briefMeta = parsed.meta || {};
        }

        // Cover image (single slot, not per-agent)
        const coverImageRaw = await redis.get("cover_image");
        let coverImage = null;
        if (coverImageRaw) {
          coverImage = typeof coverImageRaw === "string" ? JSON.parse(coverImageRaw) : coverImageRaw;
        }

        return Response.json({ brief, briefMeta, draftsByAgent, winners, tournaments, visualsByAgent, coverImage });
      }

      case "saveBrief": {
        const { brief, meta } = body;
        await redis.set("brief", JSON.stringify({ brief, meta }));
        return Response.json({ ok: true });
      }

      case "saveDraft": {
        const { draft } = body;
        if (!draft?.id || !draft?.agentId) {
          return Response.json({ error: "draft.id and draft.agentId required" }, { status: 400 });
        }
        // BANDWIDTH OPTIMIZATION: if we have a public Blob URL, drop the base64.
        // Each base64 image is ~1MB; reading them on every loadAll burns the Upstash
        // free-tier bandwidth quota fast. Public Blob URLs are stable, so we don't
        // need the base64 fallback once the upload succeeded.
        const persisted = draft.imagePublicUrl
          ? { ...draft, imageDataUrl: null }
          : draft;
        await redis.set(`draft:${draft.agentId}:${draft.id}`, JSON.stringify(persisted));
        return Response.json({ ok: true });
      }

      case "deleteDraft": {
        const { agentId, draftId } = body;
        await redis.del(`draft:${agentId}:${draftId}`);
        // also clear winner pointer if it pointed here
        const w = await redis.get(`winner:${agentId}`);
        if (w === draftId) {
          await redis.del(`winner:${agentId}`);
        }
        return Response.json({ ok: true });
      }

      case "removeImage": {
        const { agentId, draftId } = body;
        if (!agentId || !draftId) {
          return Response.json({ error: "agentId and draftId required" }, { status: 400 });
        }
        const key = `draft:${agentId}:${draftId}`;
        const raw = await redis.get(key);
        if (!raw) {
          return Response.json({ error: "draft not found" }, { status: 404 });
        }
        const draft = typeof raw === "string" ? JSON.parse(raw) : raw;
        // Strip the image fields, keep everything else
        const { imageDataUrl, imageDescription, ...rest } = draft;
        await redis.set(key, JSON.stringify(rest));
        return Response.json({ ok: true, draft: rest });
      }

      case "setWinner": {
        const { agentId, draftId } = body;
        await redis.set(`winner:${agentId}`, draftId);
        return Response.json({ ok: true });
      }

      case "clearWinner": {
        const { agentId } = body;
        await redis.del(`winner:${agentId}`);
        return Response.json({ ok: true });
      }

      case "saveTournament": {
        const { agentId, record } = body;
        await redis.set(`tournament:${agentId}`, JSON.stringify(record));
        return Response.json({ ok: true });
      }

      case "saveVisual": {
        const { visual } = body;
        if (!visual?.id || !visual?.agentId) {
          return Response.json({ error: "visual.id and visual.agentId required" }, { status: 400 });
        }
        // Same bandwidth optimization as saveDraft
        const persisted = visual.imageUrl
          ? { ...visual, imageDataUrl: null }
          : visual;
        await redis.set(`visual:${visual.agentId}:${visual.id}`, JSON.stringify(persisted));
        return Response.json({ ok: true });
      }

      case "deleteVisual": {
        const { agentId, visualId } = body;
        await redis.del(`visual:${agentId}:${visualId}`);
        return Response.json({ ok: true });
      }

      case "saveCoverImage": {
        const { coverImage } = body;
        if (!coverImage) {
          return Response.json({ error: "coverImage required" }, { status: 400 });
        }
        // Same bandwidth optimization
        const persisted = coverImage.imageUrl
          ? { ...coverImage, imageDataUrl: null }
          : coverImage;
        await redis.set("cover_image", JSON.stringify(persisted));
        return Response.json({ ok: true });
      }

      case "deleteCoverImage": {
        await redis.del("cover_image");
        return Response.json({ ok: true });
      }

      case "compactStorage": {
        // EMERGENCY action: walk every draft, visual, and cover image — strip the
        // base64 imageDataUrl from any record that already has a public URL.
        // Run this once after deploying the bandwidth fix to clean up legacy records.
        // Returns counts so the client can show what changed.
        let draftsCompacted = 0;
        let visualsCompacted = 0;
        let coverCompacted = false;
        let bytesFreed = 0;

        const draftKeys = await redis.keys("draft:*");
        for (const key of draftKeys) {
          const raw = await redis.get(key);
          if (!raw) continue;
          const d = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (d.imageDataUrl && d.imagePublicUrl) {
            bytesFreed += d.imageDataUrl.length;
            d.imageDataUrl = null;
            await redis.set(key, JSON.stringify(d));
            draftsCompacted++;
          }
        }

        const visualKeys = await redis.keys("visual:*");
        for (const key of visualKeys) {
          const raw = await redis.get(key);
          if (!raw) continue;
          const v = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (v.imageDataUrl && v.imageUrl) {
            bytesFreed += v.imageDataUrl.length;
            v.imageDataUrl = null;
            await redis.set(key, JSON.stringify(v));
            visualsCompacted++;
          }
        }

        const coverRaw = await redis.get("cover_image");
        if (coverRaw) {
          const c = typeof coverRaw === "string" ? JSON.parse(coverRaw) : coverRaw;
          if (c.imageDataUrl && c.imageUrl) {
            bytesFreed += c.imageDataUrl.length;
            c.imageDataUrl = null;
            await redis.set("cover_image", JSON.stringify(c));
            coverCompacted = true;
          }
        }

        return Response.json({
          ok: true,
          draftsCompacted,
          visualsCompacted,
          coverCompacted,
          bytesFreed,
          mbFreed: (bytesFreed / 1024 / 1024).toFixed(2),
        });
      }

      case "resetAll": {
        // Nuke the whole shared state. Confirmed client-side.
        const all = [
          "brief",
          "cover_image",
          ...(await redis.keys("draft:*")),
          ...(await redis.keys("winner:*")),
          ...(await redis.keys("tournament:*")),
          ...(await redis.keys("visual:*")),
        ];
        if (all.length > 0) await redis.del(...all);
        return Response.json({ ok: true });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("Storage API error:", err);
    const msg = String(err?.message || err || "");

    // Surface Upstash-specific failures clearly so the user knows what to fix
    if (/quota|rate.?limit|limit.exceeded|too many requests|429/i.test(msg)) {
      return Response.json(
        {
          error:
            "Upstash quota hit: " + msg + ". " +
            "Most likely the daily bandwidth limit (50MB on free tier). " +
            "Check your Upstash dashboard → Metrics. " +
            "Wait until tomorrow for reset, or upgrade plan. " +
            "Click 'Compact storage' on the Export tab to free bandwidth going forward.",
        },
        { status: 429 }
      );
    }
    if (/ECONNREFUSED|ETIMEDOUT|getaddrinfo|fetch failed|NetworkError/i.test(msg)) {
      return Response.json(
        {
          error:
            "Redis connection failed: " + msg + ". " +
            "Check KV_REST_API_URL and KV_REST_API_TOKEN env vars in Vercel project settings.",
        },
        { status: 503 }
      );
    }
    return Response.json(
      { error: err.message || "Unknown error in storage" },
      { status: 500 }
    );
  }
}
