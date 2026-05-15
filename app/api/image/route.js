import OpenAI, { toFile } from "openai";
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

/**
 * Convert a `data:image/...;base64,...` URL OR a public https URL into an OpenAI
 * `Uploadable` (File-like) suitable for images.edit.
 *
 * For data URLs: decode to Buffer, wrap with toFile().
 * For https URLs: fetch first, then wrap.
 */
async function refImageToUploadable(src, indexHint) {
  if (!src) return null;
  if (src.startsWith("data:")) {
    const match = src.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) throw new Error("Reference image must be a valid data URL or https URL");
    const mime = match[1];
    const buffer = Buffer.from(match[2], "base64");
    const ext = mime.split("/")[1].replace("+xml", "");
    return await toFile(buffer, `ref_${indexHint}.${ext}`, { type: mime });
  }
  if (src.startsWith("http://") || src.startsWith("https://")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to fetch reference image (${res.status}): ${src.slice(0, 80)}…`);
    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    const mime = res.headers.get("content-type") || "image/png";
    const ext = mime.split("/")[1].replace("+xml", "");
    return await toFile(buffer, `ref_${indexHint}.${ext}`, { type: mime });
  }
  throw new Error("Reference image must be a data URL or https URL");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { prompt, size = "1024x1024", quality = "medium", referenceImages = [] } = body;

    if (!prompt || prompt.trim().length === 0) {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }

    // gpt-image-2 edit endpoint accepts up to 16 reference images.
    // Cap at 4 here to keep request size + generation time sane.
    const refs = Array.isArray(referenceImages) ? referenceImages.slice(0, 4) : [];

    const client = getClient();

    let result;
    if (refs.length > 0) {
      // === EDIT path: prompt + reference images ===
      // The model uses references for visual register, palette, and composition cues.
      const uploadables = [];
      for (let i = 0; i < refs.length; i++) {
        try {
          const up = await refImageToUploadable(refs[i], i);
          if (up) uploadables.push(up);
        } catch (e) {
          return Response.json(
            { error: `Reference image #${i + 1} failed to load: ${e.message}` },
            { status: 400 }
          );
        }
      }
      result = await client.images.edit({
        model: DEFAULT_MODEL,
        image: uploadables.length === 1 ? uploadables[0] : uploadables,
        prompt: prompt.trim(),
        size,
        quality,
        n: 1,
      });
    } else {
      // === GENERATE path: prompt only ===
      result = await client.images.generate({
        model: DEFAULT_MODEL,
        prompt: prompt.trim(),
        size,
        quality,
        n: 1,
      });
    }

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
        referenceImagesUsed: refs.length,
      });
    }
    if (data.url) {
      // Hosted URL path — already public, just return it
      return Response.json({
        image: data.url,
        imageUrl: data.url,
        prompt: prompt.trim(),
        model: DEFAULT_MODEL,
        referenceImagesUsed: refs.length,
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
