import { put } from "@vercel/blob";

/**
 * Upload a base64 data URL to Vercel Blob and return the public URL.
 *
 * @param {string} dataUrl - A base64 data URL like "data:image/png;base64,iVBORw..."
 * @param {string} [filename] - Optional filename hint; we'll add a timestamp prefix.
 * @returns {Promise<string>} Public HTTPS URL ending in .png
 *
 * Requires:
 *   1. BLOB_READ_WRITE_TOKEN env var (auto-set when you create a Blob store)
 *   2. The Blob store must be configured with PUBLIC access. Vercel defaults
 *      new stores to Private — you must explicitly pick Public at creation,
 *      and you cannot change it after the fact. If the store is Private,
 *      Gamma cannot fetch the images.
 */
export async function uploadBase64ImageToBlob(dataUrl, filename) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN not set. Create a PUBLIC Blob store in your Vercel project's Storage tab — token is auto-provisioned."
    );
  }
  if (!dataUrl || !dataUrl.startsWith("data:")) {
    throw new Error("uploadBase64ImageToBlob: expected a data: URL");
  }

  // Parse "data:image/png;base64,iVBOR..." → mime + base64
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Malformed data URL");
  const [, mime, b64] = match;
  const buffer = Buffer.from(b64, "base64");

  // Use png extension so Gamma's URL detector recognizes it
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const safeName = (filename || "image").replace(/[^a-z0-9_-]/gi, "_").slice(0, 40);
  const path = `brand-lab/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}.${ext}`;

  try {
    const { url } = await put(path, buffer, {
      access: "public",
      contentType: mime,
      addRandomSuffix: false, // we already added our own random suffix
    });
    return url;
  } catch (e) {
    // Catch the specific "private store" error and surface an actionable fix.
    const msg = String(e?.message || e);
    if (/private store|private access|Cannot use public access/i.test(msg)) {
      throw new Error(
        "Your Vercel Blob store is configured as PRIVATE — Gamma can't fetch private URLs. " +
        "Fix: Vercel dashboard → Storage tab → delete the existing Blob store → create a new one and explicitly select PUBLIC access at the create step. " +
        "Then redeploy. (Access mode can't be changed after store creation.)"
      );
    }
    // Re-throw with original message for other errors
    throw e;
  }
}
