import "dotenv/config";
import jwt from "jsonwebtoken";
import { config } from "../config";

/**
 * Mint a local dev bearer token that the backend will accept, signed with the
 * same AUTH_SHARED_SECRET the frontend (Auth.js) will use in production.
 *
 * Usage: yarn mint:token <userId> [role]
 * Example: yarn mint:token 3f2c... admin
 */
function main() {
  const sub = process.argv[2];
  const role = process.argv[3] ?? "user";
  if (!sub) {
    console.error("Usage: yarn mint:token <userId> [role]");
    process.exit(1);
  }

  const token = jwt.sign({ sub, role }, config.AUTH_SHARED_SECRET, {
    algorithm: "HS256",
    expiresIn: "30d",
  });

  console.log("Authorization: Bearer " + token);
  console.log("\ncurl example:");
  console.log(
    `curl -X POST http://localhost:${config.PORT}/api/v1/categories \\\n` +
      `  -H "Authorization: Bearer ${token}" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '{"slug":"refrigerator","nameEn":"Refrigerator","nameBn":"ফ্রিজ"}'`,
  );
}

main();
