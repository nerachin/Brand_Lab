import OpenAI from "openai";
import { uploadBase64ImageToBlob } from "@/lib/blob";

export const runtime = "nodejs";
export const maxDuration = 300;

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY not set. Get one at https://platform.openai.com/api-keys and add it to your Vercel environment variables."
    );
  }
  return new OpenAI({ apiKey: key });
}

const DEFAULT_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

export async function POST(request) {
  try {
    const body = await request.json();
    const { prompt, size = "1024x1024", quality = "medium" } = body;

    if (!prompt || prompt.trim().length === 0) {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }

    const client = getClient();

    const result = await client.images.generate({
      model: DEFAULT_MODEL,
      prompt: prompt.trim(),
      size,
      quality,
      n: 1,
    });

    const data = result.data?.[0];
    if (!data) {
      return Response.json({ error: "no image returned by OpenAI" }, { status: 500 });
    }

    // gpt-image-1/2 returns b64_json by default
    if (data.b64_json) {
      const dataUrl = `data:image/png;base64,${data.b64_json}`;

      // Try to upload to Vercel Blob so Gamma can consume it later.
      // Best-effort: if Blob isn't configured, log and continue with base64 only.
      let publicUrl = null;
      let blobError = null;
      try {
        publicUrl = await uploadBase64ImageToBlob(dataUrl, prompt.trim().slice(0, 30));
      } catch (e) {
        console.warn("Blob upload failed (continuing with base64 only):", e.message);
        blobError = e.message;
      }

      return Response.json({
        image: dataUrl,
        imageUrl: publicUrl, // null if Blob not configured
        blobError, // surfaced so client can warn the user once
        prompt: prompt.trim(),
        model: DEFAULT_MODEL,
      });
    }
    if (data.url) {
      // Hosted URL path — already public, just return it
      return Response.json({
        image: data.url,
        imageUrl: data.url,
        prompt: prompt.trim(),
        model: DEFAULT_MODEL,
      });
    }
    return Response.json({ error: "unexpected image format" }, { status: 500 });
  } catch (err) {
    console.error("Image API error:", err);
    return Response.json(
      { error: err.message || "Unknown error generating image" },
      { status: 500 }
    );
  }
}
