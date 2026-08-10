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

// Self-service PIN change: 5 attempts per 15 minutes per driver — defends the
// current-PIN bcrypt check against brute force without locking out a forgetful driver.
export const pinChangeRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  analytics: true,
  prefix: "vms_ratelimit_pin_change",
});

// Password-reset request. Keyed twice per call — by IP (spray defence) and by
// email (so nobody can flood one admin's mailbox from a botnet). Deliberately
// tight: a real admin needs one link, not ten.
export const passwordResetRequestRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "60 m"),
  analytics: true,
  prefix: "vms_ratelimit_pwreset_request",
});

// "Send a test notification", per user. The only push an end user can trigger
// on demand, so it's the only one that can be used to hammer the push service
// (which rate-limits the whole origin, not the caller — a loop here would get
// real notifications throttled for the entire fleet).
export const pushTestRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "10 m"),
  analytics: true,
  prefix: "vms_ratelimit_push_test",
});

// Reset-link redemption, per IP. The token is 256 bits of entropy so guessing
// is not the threat; this caps the damage of a scripted replay/probe loop.
export const passwordResetConfirmRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "15 m"),
  analytics: true,
  prefix: "vms_ratelimit_pwreset_confirm",
});
