import "dotenv/config";
import { eq } from "drizzle-orm";
import { closeDb, db } from "../db/client";
import { users } from "../db/schema";

/**
 * Promote (or create) a user as admin.
 * Usage: yarn make:admin you@example.com "Your Name"
 */
async function main() {
  const email = process.argv[2];
  const name = process.argv[3];
  if (!email) {
    console.error('Usage: yarn make:admin <email> ["Name"]');
    process.exit(1);
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  let user;
  if (existing) {
    [user] = await db
      .update(users)
      .set({ role: "admin", name: name ?? existing.name, updatedAt: new Date() })
      .where(eq(users.id, existing.id))
      .returning();
  } else {
    [user] = await db
      .insert(users)
      .values({ email, name, role: "admin", emailVerifiedAt: new Date() })
      .returning();
  }

  console.log("Admin ready:");
  console.log(JSON.stringify({ id: user!.id, email: user!.email, role: user!.role }, null, 2));
  console.log(`\nNext: yarn mint:token ${user!.id} admin`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
