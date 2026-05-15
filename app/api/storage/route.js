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
        // RESILIENT LOAD: each section is wrapped in try/catch so one failure
        // doesn't nuke the whole response. Brief is the highest-value data —
        // it must always come back if it exists in Redis.
        const loadErrors = []; // [{ section, message }]

        // ---- Brief (small, always read first) ----
        let brief = {};
        let briefMeta = {};
        try {
          const briefRaw = await redis.get("brief");
          if (briefRaw) {
            const parsed = typeof briefRaw === "string" ? JSON.parse(briefRaw) : briefRaw;
            brief = parsed.brief || {};
            briefMeta = parsed.meta || {};
          }
        } catch (e) {
          loadErrors.push({ section: "brief", message: e?.message || String(e) });
        }

        // ---- Drafts ----
        const draftsByAgent = {};
        try {
          const draftKeys = await redis.keys("draft:*");
          if (draftKeys.length > 0) {
            // BATCHED MGET: fetch in chunks of 5 so accumulated payload size never
            // exceeds Upstash response limits. Each draft can be up to ~5KB after
            // base64 stripping, so 5 keys = ~25KB per call. Safe.
            const BATCH = 5;
            const allValues = [];
            for (let i = 0; i < draftKeys.length; i += BATCH) {
              const chunk = draftKeys.slice(i, i + BATCH);
              const values = await redis.mget(...chunk);
              for (const v of values) allValues.push(v);
            }
            for (let i = 0; i < draftKeys.length; i++) {
              const val = allValues[i];
              if (!val) continue;
              try {
                const draft = typeof val === "string" ? JSON.parse(val) : val;
                if (!draftsByAgent[draft.agentId]) draftsByAgent[draft.agentId] = [];
                draftsByAgent[draft.agentId].push(draft);
              } catch {} // skip individual bad records
            }
            for (const aId of Object.keys(draftsByAgent)) {
              draftsByAgent[aId].sort((a, b) => a.createdAt - b.createdAt);
            }
          }
        } catch (e) {
          loadErrors.push({ section: "drafts", message: e?.message || String(e) });
        }

        // ---- Winners ----
        const winners = {};
        try {
          const winnerKeys = await redis.keys("winner:*");
          if (winnerKeys.length > 0) {
            const BATCH = 10;
            for (let i = 0; i < winnerKeys.length; i += BATCH) {
              const chunk = winnerKeys.slice(i, i + BATCH);
              const values = await redis.mget(...chunk);
              for (let j = 0; j < chunk.length; j++) {
                winners[chunk[j].replace("winner:", "")] = values[j];
              }
            }
          }
        } catch (e) {
          loadErrors.push({ section: "winners", message: e?.message || String(e) });
        }

        // ---- Tournaments ----
        const tournaments = {};
        try {
          const tournamentKeys = await redis.keys("tournament:*");
          if (tournamentKeys.length > 0) {
            const BATCH = 5;
            for (let i = 0; i < tournamentKeys.length; i += BATCH) {
              const chunk = tournamentKeys.slice(i, i + BATCH);
              const tValues = await redis.mget(...chunk);
              for (let j = 0; j < chunk.length; j++) {
                const agentId = chunk[j].replace("tournament:", "");
                const val = tValues[j];
                if (val) {
                  try {
                    tournaments[agentId] = typeof val === "string" ? JSON.parse(val) : val;
                  } catch {}
                }
              }
            }
          }
        } catch (e) {
          loadErrors.push({ section: "tournaments", message: e?.message || String(e) });
        }

        // ---- Visuals (most likely to be oversized — batched and most defensive) ----
        const visualsByAgent = {};
        let visualsStats = { total: 0, withUrl: 0, withBase64Only: 0, failed: 0 };
        try {
          const visualKeys = await redis.keys("visual:*");
          if (visualKeys.length > 0) {
            // Fetch one record at a time for visuals — they may have base64 fallback
            // (~1MB each) so batched mget can still exceed 10MB. Slower but reliable.
            for (const key of visualKeys) {
              try {
                const val = await redis.get(key);
                if (!val) continue;
                const visual = typeof val === "string" ? JSON.parse(val) : val;
                if (!visualsByAgent[visual.agentId]) visualsByAgent[visual.agentId] = [];
                visualsByAgent[visual.agentId].push(visual);
                visualsStats.total++;
                if (visual.imageUrl) visualsStats.withUrl++;
                else if (visual.imageDataUrl) visualsStats.withBase64Only++;
              } catch (perVisualErr) {
                visualsStats.failed++;
                loadErrors.push({ section: `visual:${key}`, message: perVisualErr?.message || String(perVisualErr) });
              }
            }
            for (const aId of Object.keys(visualsByAgent)) {
              visualsByAgent[aId].sort((a, b) => a.createdAt - b.createdAt);
            }
          }
        } catch (e) {
          loadErrors.push({ section: "visuals", message: e?.message || String(e) });
        }

        // ---- Cover image ----
        let coverImage = null;
        try {
          const coverImageRaw = await redis.get("cover_image");
          if (coverImageRaw) {
            coverImage = typeof coverImageRaw === "string" ? JSON.parse(coverImageRaw) : coverImageRaw;
          }
        } catch (e) {
          loadErrors.push({ section: "coverImage", message: e?.message || String(e) });
        }

        // ---- Branding sheet (brand identity overview, set on Tab 1) ----
        let brandingImage = null;
        try {
          const brandingImageRaw = await redis.get("branding_image");
          if (brandingImageRaw) {
            brandingImage = typeof brandingImageRaw === "string" ? JSON.parse(brandingImageRaw) : brandingImageRaw;
          }
        } catch (e) {
          loadErrors.push({ section: "brandingImage", message: e?.message || String(e) });
        }

        return Response.json({
          brief, briefMeta, draftsByAgent, winners, tournaments, visualsByAgent, coverImage, brandingImage,
          loadErrors, // [] when everything succeeded
          diagnostics: {
            visualsStats,
            keyCounts: {
              drafts: Object.values(draftsByAgent).flat().length,
              visuals: Object.values(visualsByAgent).flat().length,
              winners: Object.keys(winners).length,
              tournaments: Object.keys(tournaments).length,
              coverImage: coverImage ? 1 : 0,
              brandingImage: brandingImage ? 1 : 0,
            },
          },
        });
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
        let winnerCleared = false;
        if (w === draftId) {
          await redis.del(`winner:${agentId}`);
          winnerCleared = true;
        }
        // Always clear tournament result for this agent — the ruling compared
        // a specific set of drafts; removing one invalidates the analysis.
        // Cheaper to re-run than to leave stale rulings on screen.
        let tournamentCleared = false;
        const t = await redis.get(`tournament:${agentId}`);
        if (t) {
          await redis.del(`tournament:${agentId}`);
          tournamentCleared = true;
        }
        return Response.json({ ok: true, winnerCleared, tournamentCleared });
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

      case "saveBrandingImage": {
        const { brandingImage } = body;
        if (!brandingImage) {
          return Response.json({ error: "brandingImage required" }, { status: 400 });
        }
        const persisted = brandingImage.imageUrl
          ? { ...brandingImage, imageDataUrl: null }
          : brandingImage;
        await redis.set("branding_image", JSON.stringify(persisted));
        return Response.json({ ok: true });
      }

      case "deleteBrandingImage": {
        await redis.del("branding_image");
        return Response.json({ ok: true });
      }

      case "healthCheck": {
        // DIAGNOSTIC: report what's actually in Redis right now and which env vars
        // are configured. Helps debug "save shows OK but reload shows empty" issues.
        const briefRaw = await redis.get("brief");
        let briefPresent = false;
        let briefSummary = null;
        if (briefRaw) {
          briefPresent = true;
          const parsed = typeof briefRaw === "string" ? JSON.parse(briefRaw) : briefRaw;
          briefSummary = {
            hasProductIdea: !!parsed?.brief?.productIdea,
            hasIndustry: !!parsed?.brief?.industry,
            lastEditedBy: parsed?.meta?.lastEditedBy || null,
            lastEditedAt: parsed?.meta?.lastEditedAt || null,
            productIdeaPreview: (parsed?.brief?.productIdea || "").slice(0, 60),
          };
        }

        const draftKeys = await redis.keys("draft:*");
        const winnerKeys = await redis.keys("winner:*");
        const visualKeys = await redis.keys("visual:*");
        const tournamentKeys = await redis.keys("tournament:*");
        const coverPresent = !!(await redis.get("cover_image"));

        // Read-after-write probe: write a sentinel value, immediately read it back.
        // If write succeeds but read returns null → split-brain (different DBs for read vs write).
        const probeKey = `__healthprobe_${Date.now()}`;
        const probeValue = `probe_${Math.random().toString(36).slice(2)}`;
        await redis.set(probeKey, probeValue);
        const probeReadback = await redis.get(probeKey);
        await redis.del(probeKey);
        const readAfterWriteOK = probeReadback === probeValue;

        return Response.json({
          ok: true,
          envVars: {
            UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
            UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
            KV_REST_API_URL: !!process.env.KV_REST_API_URL,
            KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
            usingDirect: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
            usingMarketplace: !(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) && !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
          },
          keyCounts: {
            drafts: draftKeys.length,
            winners: winnerKeys.length,
            visuals: visualKeys.length,
            tournaments: tournamentKeys.length,
          },
          brief: {
            present: briefPresent,
            summary: briefSummary,
          },
          coverImage: { present: coverPresent },
          readAfterWrite: {
            ok: readAfterWriteOK,
            note: readAfterWriteOK
              ? "Write→read roundtrip works. Redis is consistent."
              : "WRITE OK BUT READ DIDN'T RETURN THE VALUE. Likely split-brain — multiple Redis databases configured. Check env vars.",
          },
          serverTime: new Date().toISOString(),
        });
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

        let brandingCompacted = false;
        const brandingRaw = await redis.get("branding_image");
        if (brandingRaw) {
          const b = typeof brandingRaw === "string" ? JSON.parse(brandingRaw) : brandingRaw;
          if (b.imageDataUrl && b.imageUrl) {
            bytesFreed += b.imageDataUrl.length;
            b.imageDataUrl = null;
            await redis.set("branding_image", JSON.stringify(b));
            brandingCompacted = true;
          }
        }

        return Response.json({
          ok: true,
          draftsCompacted,
          visualsCompacted,
          coverCompacted,
          brandingCompacted,
          bytesFreed,
          mbFreed: (bytesFreed / 1024 / 1024).toFixed(2),
        });
      }

      case "resetAll": {
        // Nuke the whole shared state. Confirmed client-side.
        const all = [
          "brief",
          "cover_image",
          "branding_image",
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
