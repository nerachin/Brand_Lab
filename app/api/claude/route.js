import Anthropic from "@anthropic-ai/sdk";
import { AGENTS, buildSystemPromptForAgent } from "@/lib/agents";
import { PROFESSOR_PROMPT, TOURNAMENT_PROMPT, ASHLEY_FINAL_REVIEW_PROMPT, IMAGE_PROMPT_BUILDER_PROMPT } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set. Add it to your Vercel environment variables.");
  }
  // maxRetries 5 with exponential backoff covers most 529 "Overloaded" blips silently.
  // SDK default is 2; bumping it is the cheapest way to make Ashley's Final Read
  // and tournament calls resilient when Anthropic infrastructure is under load.
  return new Anthropic({ apiKey, maxRetries: 5 });
}

// Default model — sensible choice for cost/quality balance.
// Override via ANTHROPIC_MODEL env var if you want Opus.
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

export async function POST(request) {
  try {
    const body = await request.json();
    const { mode } = body;

    const client = getClient();
    let system;
    let messages;

    if (mode === "agent_chat") {
      const { agentId, brief, upstreamLocks, chatHistory, newUserMessage } = body;
      const agent = AGENTS.find((a) => a.id === agentId);
      if (!agent) {
        return Response.json({ error: `Unknown agent ${agentId}` }, { status: 400 });
      }
      system = buildSystemPromptForAgent(agent, brief, upstreamLocks);
      messages = [
        ...(chatHistory || []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: newUserMessage },
      ];
    } else if (mode === "tournament") {
      const { promptText } = body;
      system = TOURNAMENT_PROMPT;
      messages = [{ role: "user", content: promptText }];
    } else if (mode === "professor") {
      const { promptText } = body;
      system = PROFESSOR_PROMPT;
      messages = [{ role: "user", content: promptText }];
    } else if (mode === "ashley_final") {
      const { promptText } = body;
      system = ASHLEY_FINAL_REVIEW_PROMPT;
      messages = [{ role: "user", content: promptText }];
    } else if (mode === "image_prompt_builder") {
      const { promptText } = body;
      system = IMAGE_PROMPT_BUILDER_PROMPT;
      messages = [{ role: "user", content: promptText }];
    } else {
      return Response.json({ error: "Unknown mode" }, { status: 400 });
    }

    const result = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      system,
      messages,
    });

    const text = result.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return Response.json({ text });
  } catch (err) {
    console.error("Claude API error:", err);
    // Make overload errors human-readable instead of dumping raw JSON in the UI
    const status = err?.status || err?.response?.status;
    const isOverload =
      status === 529 ||
      /overloaded/i.test(err?.message || "") ||
      /overloaded/i.test(JSON.stringify(err?.error || {}));
    if (isOverload) {
      return Response.json(
        {
          error:
            "Anthropic's API is temporarily overloaded. We auto-retried five times. Wait 30–60 seconds and try again — usually clears fast.",
        },
        { status: 529 }
      );
    }
    return Response.json(
      { error: err.message || "Unknown error calling Claude" },
      { status: 500 }
    );
  }
}
