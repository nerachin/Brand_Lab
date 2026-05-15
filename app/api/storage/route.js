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

        return Response.json({ brief, briefMeta, draftsByAgent, winners, tournaments, visualsByAgent });
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
        await redis.set(`draft:${draft.agentId}:${draft.id}`, JSON.stringify(draft));
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
        await redis.set(`visual:${visual.agentId}:${visual.id}`, JSON.stringify(visual));
        return Response.json({ ok: true });
      }

      case "deleteVisual": {
        const { agentId, visualId } = body;
        await redis.del(`visual:${agentId}:${visualId}`);
        return Response.json({ ok: true });
      }

      case "resetAll": {
        // Nuke the whole shared state. Confirmed client-side.
        const all = [
          "brief",
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
    return Response.json(
      { error: err.message || "Unknown error in storage" },
      { status: 500 }
    );
  }
}
