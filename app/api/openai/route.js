import OpenAI from "openai";
import { PROFESSOR_PROMPT, TOURNAMENT_PROMPT, ASHLEY_FINAL_REVIEW_PROMPT } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY not set. Get one at https://platform.openai.com/api-keys and add to Vercel env vars."
    );
  }
  return new OpenAI({ apiKey: key, maxRetries: 5 });
}

// Model selection per mode.
// Ashley's Final Read = the deck's most important call — gets the strongest frontier
// model (GPT-5.5, OpenAI's April 2026 flagship). Multi-section reasoning + persona
// fidelity + structured output across 8 headings.
// Tournament + Professor = comparative grading; the workhorse handles this well.
const ASHLEY_MODEL = process.env.OPENAI_ASHLEY_MODEL || "gpt-5.5";
const REVIEW_MODEL = process.env.OPENAI_REVIEW_MODEL || "gpt-4o";

export async function POST(request) {
  // Optional password gate, same as other routes
  const required = process.env.TEAM_PASSWORD;
  if (required && request.headers.get("x-team-password") !== required) {
    return Response.json({ error: "wrong password" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { mode } = body;

    let system;
    let userText;
    let model;
    let maxTokens;
    let temperature;

    if (mode === "tournament") {
      system = TOURNAMENT_PROMPT;
      userText = body.promptText;
      model = REVIEW_MODEL;
      maxTokens = 4000;
      temperature = 0.7;
    } else if (mode === "ashley_final") {
      system = ASHLEY_FINAL_REVIEW_PROMPT;
      userText = body.promptText;
      model = ASHLEY_MODEL;
      // 8-section structured review across 9 deck sections can run long
      maxTokens = 8000;
      // Lower temperature for disciplined, less rambly output — Ashley is direct
      temperature = 0.6;
    } else if (mode === "professor") {
      system = PROFESSOR_PROMPT;
      userText = body.promptText;
      model = REVIEW_MODEL;
      maxTokens = 4000;
      temperature = 0.7;
    } else {
      return Response.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
    }

    if (!userText || !userText.trim()) {
      return Response.json({ error: "promptText required" }, { status: 400 });
    }

    const client = getClient();

    // Parameter compatibility varies by model family:
    // - GPT-5 series + o-series: use `max_completion_tokens` (NOT max_tokens)
    // - o-series (o1, o3, o4) reasoning models: do NOT accept temperature
    // - GPT-4 series and earlier: use `max_tokens`, accept temperature
    const isGpt5OrNewer = /^(gpt-5|o\d)/i.test(model);
    const isReasoningOnly = /^o\d/i.test(model);

    const requestParams = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
    };

    if (isGpt5OrNewer) {
      requestParams.max_completion_tokens = maxTokens;
    } else {
      requestParams.max_tokens = maxTokens;
    }

    // Reasoning-only models (o1, o3, o4) don't accept temperature
    if (!isReasoningOnly) {
      requestParams.temperature = temperature;
    }

    const result = await client.chat.completions.create(requestParams);

    const text = result.choices?.[0]?.message?.content?.trim() || "";
    if (!text) {
      return Response.json(
        { error: "OpenAI returned an empty response. Try again." },
        { status: 500 }
      );
    }

    return Response.json({ text, model });
  } catch (err) {
    console.error("OpenAI completion error:", err);
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
    if (status === 404 || /does not exist|model_not_found/i.test(err?.message || "")) {
      return Response.json(
        {
          error:
            `Model not available to your OpenAI account: ${err.message}. ` +
            `Try setting OPENAI_ASHLEY_MODEL=gpt-4o (or gpt-5.4) in your Vercel env vars as a fallback.`,
        },
        { status: 404 }
      );
    }
    return Response.json(
      { error: err.message || "Unknown error from OpenAI" },
      { status: 500 }
    );
  }
}
