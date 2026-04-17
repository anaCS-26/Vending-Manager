import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Create a redis instance. Redis.fromEnv() automatically pulls 
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from your environment variables.
const redis = Redis.fromEnv();

// Create a global rate limiter for authentication (login)
// 5 requests per 10 seconds sliding window
export const loginRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "10 s"),
  analytics: true,
  prefix: "vms_ratelimit_login",
});
