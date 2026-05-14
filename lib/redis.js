import { Redis } from "@upstash/redis";

// Support both Upstash-direct env vars AND Vercel Marketplace integration env vars.
// Vercel Marketplace sets KV_REST_API_URL / KV_REST_API_TOKEN.
// Upstash direct sets UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Redis not configured. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or use Vercel Marketplace → Upstash Redis integration which sets KV_REST_API_URL + KV_REST_API_TOKEN)."
    );
  }
  return { url, token };
}

let _redis = null;

export function getRedis() {
  if (!_redis) {
    _redis = new Redis(getRedisConfig());
  }
  return _redis;
}
