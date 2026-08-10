import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

const vercelConfig = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as {
    buildCommand?: string;
};
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
};

/**
 * The production build command lives in `vercel.json`, not in the Vercel
 * dashboard, and these two assertions are the reason why.
 *
 * The dashboard's Build Command overrides `package.json#build`, so for months
 * production ran `npx prisma generate && npx prisma db push --accept-data-loss
 * && next build` while the repo's own script said `next build --webpack`.
 * Nothing in the repo could see the difference. Next 16 defaults to Turbopack,
 * `@serwist/next` only emits `/sw.js` through its Webpack integration, and so
 * every production deploy shipped no service worker at all: `/sw.js` 404'd,
 * push notifications reported "no-service-worker" forever, and the build
 * merely logged a warning and passed. Pinning the command here makes the repo
 * the single source of truth (vercel.json wins over the dashboard).
 */
describe("production build command", () => {
    it("routes through the repo's build script, which forces Webpack so Serwist emits /sw.js", () => {
        expect(vercelConfig.buildCommand).toContain("npm run build");
        expect(packageJson.scripts?.build).toContain("next build --webpack");
    });

    it("still pushes the Prisma schema, which is the only way migrations reach production", () => {
        // This repo has no migrations folder — `db push` during the build is
        // how every schema change lands in prod. Dropping it from the build
        // command deploys code whose tables/columns do not exist yet, and the
        // build stays green: it fails later, at runtime, on whichever action
        // touches the new field first.
        expect(vercelConfig.buildCommand).toContain("prisma db push");
    });
});
