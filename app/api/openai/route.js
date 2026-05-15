import OpenAI from "openai";
import { AGENTS, buildSystemPromptForAgent } from "@/lib/agents";
import { PROFESSOR_PROMPT, TOURNAMENT_PROMPT, ASHLEY_FINAL_REVIEW_PROMPT } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Server-side PDF text extraction so we can attach PDF content to OpenAI calls.
 * OpenAI chat-completions doesn't natively process PDF binaries the way Anthropic
 * does — but text extraction covers 90%+ of strategy reference PDFs (briefs,
 * research reports, brand guidelines without heavy visual content).
 *
 * Uses lazy import to keep cold-starts faster when PDFs aren't being used.
 * The /lib/ import path avoids pdf-parse's debug-mode startup which looks for
 * a test file that doesn't exist in production.
 */
async function extractPdfText(base64) {
  const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
  const buffer = Buffer.from(base64, "base64");
  const result = await pdfParse(buffer);
  return {
    text: (result.text || "").trim(),
    pages: result.numpages || 0,
    info: result.info || {},
  };
}

/**
 * Cap injected PDF text per attachment to keep the request size reasonable.
 * ~25K characters ≈ ~6K tokens — generous but bounded.
 */
const PDF_TEXT_CHAR_LIMIT = 25000;

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY not set. Get one at https://platform.openai.com/api-keys and add to Vercel env vars."
    );
  }
  // maxRetries 2 (not 5) — under Vercel's 60s function limit, aggressive retries
  // burn our entire budget instead of failing fast and letting the user retry.
  return new OpenAI({ apiKey: key, maxRetries: 2 });
}

// Model selection per mode.
// Ashley's Final Read = the deck's most important call — gets the strongest frontier
// model (GPT-5.5, OpenAI's April 2026 flagship). Multi-section reasoning + persona
// fidelity + structured output across 8 headings.
// Tournament + Professor = comparative grading; the workhorse handles this well.
// Agent chat = called frequently during iteration; needs good Konson framework discipline
// but doesn't need flagship reasoning.
const ASHLEY_MODEL = process.env.OPENAI_ASHLEY_MODEL || "gpt-5.5";
const REVIEW_MODEL = process.env.OPENAI_REVIEW_MODEL || "gpt-4o";
const AGENT_MODEL = process.env.OPENAI_AGENT_MODEL || "gpt-4o";

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
    let messages;
    let model;
    let maxTokens;
    let temperature;

    if (mode === "agent_chat") {
      // Iterative draft conversation with one of the brand-strategy agents.
      // Supports image attachments via gpt-4o vision. PDFs are skipped with a note
      // (OpenAI chat-completions doesn't natively process PDFs the way Anthropic does).
      const { agentId, brief, upstreamLocks, chatHistory, newUserMessage, attachments } = body;
      const agent = AGENTS.find((a) => a.id === agentId);
      if (!agent) {
        return Response.json({ error: `Unknown agent ${agentId}` }, { status: 400 });
      }
      system = buildSystemPromptForAgent(agent, brief, upstreamLocks);
      model = AGENT_MODEL;
      maxTokens = 4096;
      temperature = 0.7;

      // Build the new user turn — text + any attached images + extracted PDF text
      let newUserContent;
      const imageAttachments = (attachments || []).filter(
        (a) => a?.base64 && a?.type?.startsWith("image/")
      );
      const pdfAttachments = (attachments || []).filter(
        (a) => a?.base64 && a?.type === "application/pdf"
      );

      // Extract PDF text in parallel — bounded by per-PDF char limit
      let pdfTextBlock = "";
      const pdfErrors = [];
      if (pdfAttachments.length > 0) {
        const extractions = await Promise.all(
          pdfAttachments.map(async (pdf) => {
            try {
              const { text, pages } = await extractPdfText(pdf.base64);
              if (!text) {
                return { name: pdf.name, error: "PDF appears to contain no extractable text (might be image-only / scanned)." };
              }
              const truncated = text.length > PDF_TEXT_CHAR_LIMIT;
              const usable = truncated ? text.slice(0, PDF_TEXT_CHAR_LIMIT) : text;
              return {
                name: pdf.name,
                pages,
                text: usable,
                truncated,
                originalChars: text.length,
              };
            } catch (e) {
              return { name: pdf.name, error: e.message || "extraction failed" };
            }
          })
        );

        const successes = extractions.filter((x) => x.text);
        const failures = extractions.filter((x) => x.error);
        for (const f of failures) pdfErrors.push(`${f.name}: ${f.error}`);

        if (successes.length > 0) {
          const blocks = successes.map((s) => {
            const header = `### Attached PDF: ${s.name} (${s.pages} pages${s.truncated ? `, truncated to ${PDF_TEXT_CHAR_LIMIT} of ${s.originalChars} chars` : ""})`;
            return `${header}\n\n${s.text}`;
          });
          pdfTextBlock = "\n\n---\n\n" + blocks.join("\n\n---\n\n");
        }
      }

      // Compose the user message text with PDF content + any error notes appended
      const baseText = newUserMessage || (imageAttachments.length > 0 || pdfTextBlock
        ? "Please review the attached material and incorporate it into your next draft."
        : "");
      let composedText = baseText + pdfTextBlock;
      if (pdfErrors.length > 0) {
        composedText += `\n\n---\n\n[Note: some PDF(s) couldn't be extracted: ${pdfErrors.join("; ")}. If the PDF is scanned/image-only, take a screenshot and attach as an image instead.]`;
      }

      if (imageAttachments.length > 0) {
        // Mixed content: images first, then the text + PDF content
        newUserContent = [];
        for (const att of imageAttachments) {
          newUserContent.push({
            type: "image_url",
            image_url: {
              url: `data:${att.type};base64,${att.base64}`,
              detail: "high",
            },
          });
        }
        newUserContent.push({ type: "text", text: composedText });
      } else {
        // Text-only path (possibly with extracted PDF text inlined)
        newUserContent = composedText;
      }

      messages = [
        { role: "system", content: system },
        ...(chatHistory || []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: newUserContent },
      ];
    } else if (mode === "tournament") {
      system = TOURNAMENT_PROMPT;
      const userText = body.promptText;
      if (!userText || !userText.trim()) {
        return Response.json({ error: "promptText required" }, { status: 400 });
      }
      model = REVIEW_MODEL;
      maxTokens = 4000;
      temperature = 0.7;
      messages = [
        { role: "system", content: system },
        { role: "user", content: userText },
      ];
    } else if (mode === "ashley_final") {
      system = ASHLEY_FINAL_REVIEW_PROMPT;
      const userText = body.promptText;
      if (!userText || !userText.trim()) {
        return Response.json({ error: "promptText required" }, { status: 400 });
      }
      model = ASHLEY_MODEL;
      // 8-section structured review across 9 deck sections can run long
      maxTokens = 8000;
      // Lower temperature for disciplined, less rambly output — Ashley is direct
      temperature = 0.6;
      messages = [
        { role: "system", content: system },
        { role: "user", content: userText },
      ];
    } else if (mode === "professor") {
      system = PROFESSOR_PROMPT;
      const userText = body.promptText;
      if (!userText || !userText.trim()) {
        return Response.json({ error: "promptText required" }, { status: 400 });
      }
      model = REVIEW_MODEL;
      maxTokens = 4000;
      temperature = 0.7;
      messages = [
        { role: "system", content: system },
        { role: "user", content: userText },
      ];
    } else {
      return Response.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
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
      messages,
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
