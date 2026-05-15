import OpenAI from "openai";
import { IMAGE_PROMPT_BUILDER_PROMPT } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY not set. Get one at https://platform.openai.com/api-keys and add it to your Vercel environment variables."
    );
  }
  // maxRetries: 5 handles transient OpenAI 5xx/429s with exponential backoff.
  return new OpenAI({ apiKey: key, maxRetries: 5 });
}

// gpt-4o-mini is the sweet spot for this task: ~$0.0003/call, ~2-4 second response,
// follows structured system prompts well. Override via env var if you want to swap.
const DEFAULT_MODEL = process.env.OPENAI_PROMPT_MODEL || "gpt-4o-mini";

export async function POST(request) {
  // Optional password gate, same as other routes
  const required = process.env.TEAM_PASSWORD;
  if (required && request.headers.get("x-team-password") !== required) {
    return Response.json({ error: "wrong password" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { promptText } = body;
    if (!promptText || !promptText.trim()) {
      return Response.json({ error: "promptText required" }, { status: 400 });
    }

    const client = getClient();

    // Same model compatibility logic as /api/openai — GPT-5 family uses
    // max_completion_tokens, o-series also drops temperature
    const isGpt5OrNewer = /^(gpt-5|o\d)/i.test(DEFAULT_MODEL);
    const isReasoningOnly = /^o\d/i.test(DEFAULT_MODEL);

    const requestParams = {
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: IMAGE_PROMPT_BUILDER_PROMPT },
        { role: "user", content: promptText },
      ],
    };
    if (isGpt5OrNewer) {
      requestParams.max_completion_tokens = 800;
    } else {
      requestParams.max_tokens = 800;
    }
    if (!isReasoningOnly) {
      requestParams.temperature = 0.7;
    }

    const result = await client.chat.completions.create(requestParams);

    const text = result.choices?.[0]?.message?.content?.trim() || "";
    if (!text) {
      return Response.json(
        { error: "OpenAI returned an empty prompt. Try again." },
        { status: 500 }
      );
    }

    return Response.json({ text, model: DEFAULT_MODEL });
  } catch (err) {
    console.error("Prompt builder error:", err);
    // Translate common OpenAI errors into useful messages
    const status = err?.status || err?.response?.status;
    if (status === 429) {
      return Response.json(
        { error: "OpenAI rate limit hit. Wait ~30 seconds and retry." },
        { status: 429 }
      );
    }
    if (status === 401) {
      return Response.json(
        { error: "OpenAI auth failed — check OPENAI_API_KEY in Vercel env vars." },
        { status: 401 }
      );
    }
    return Response.json(
      { error: err.message || "Unknown error in prompt builder" },
      { status: 500 }
    );
  }
}
