import vinext from "vinext";
import { defineConfig } from "vite";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";

// Public identifiers, never credentials. Personal Cloudflare is the only deployment target.
if (process.env.RP_DEPLOY_TARGET && process.env.RP_DEPLOY_TARGET !== "personal") {
  throw new Error("This repository deploys to the personal RP LAND Worker only.");
}
const personalDatabaseId = process.env.RP_PERSONAL_D1_ID ?? "0c2063d5-ddfe-4d46-a6c9-269417d63a27";
const personalAccountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "c7968b6871f33603b8f201fbfe66f877";
if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(personalDatabaseId)) {
  throw new Error("RP_PERSONAL_D1_ID must be set to the personal D1 database UUID.");
}
if (!/^[0-9a-f]{32}$/.test(personalAccountId)) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID must be set to the Cloudflare account ID.");
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  name: "rp-land", account_id: personalAccountId, workers_dev: true,
  main: "vinext/server/fetch-handler",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: [{
    binding: "DB", database_name: "rp-land", database_id: personalDatabaseId,
    migrations_dir: "../../drizzle",
  }],

};

export default defineConfig(async () => {
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
