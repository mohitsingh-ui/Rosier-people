// Prepares the Android project: writes the server URL for the offline page,
// then copies web assets + config into android/ (npx cap sync android).
// Usage: ROSIER_APP_URL=https://people.rosierfoods.com npm run mobile:sync
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const url = (process.env.ROSIER_APP_URL ?? "").replace(/\/+$/, "");
if (!/^https?:\/\/[^/]+/.test(url)) {
  console.error("Set ROSIER_APP_URL to your Rosier People server, e.g. https://people.rosierfoods.com");
  process.exit(1);
}
if (url.startsWith("http://") && !/\/\/(10\.0\.2\.2|localhost|127\.0\.0\.1|192\.168\.|10\.)/.test(url)) {
  console.warn("⚠  Using plain http for a public host. Sign-in cookies are HTTPS-only in production.");
}
writeFileSync("mobile/www/app-url.js", `window.ROSIER_APP_URL = ${JSON.stringify(url)};\n`);
execSync("npx cap sync android", { stdio: "inherit", env: { ...process.env, ROSIER_APP_URL: url } });
console.log(`\n✓ Android app will open ${url}`);
