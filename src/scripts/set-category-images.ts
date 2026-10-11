import "dotenv/config";
import { eq } from "drizzle-orm";
import { closeDb, db } from "../db/client";
import { categories, productImages, products } from "../db/schema";

/**
 * Replaces the placehold.co placeholder with a real, properly-licensed
 * representative photo (Wikipedia/Wikimedia Commons) for every product in a
 * handful of categories — a stopgap for "looks unprofessional without
 * images" until real per-SKU product photography is sourced. These are
 * CATEGORY-level stock photos (often of a specific branded unit, e.g. the
 * air-conditioner photo is a Mitsubishi Electric outdoor unit), not photos
 * of the exact listed model — acceptable tradeoff the user signed off on
 * given no reliable bulk image-search tool is available.
 *
 *   cd backend && yarn tsx src/scripts/set-category-images.ts
 */

const IMAGES: Record<string, { url: string; credit: string }> = {
  laptop: {
    url: "https://upload.wikimedia.org/wikipedia/commons/6/68/Laptop_collage.jpg",
    credit: "Wikimedia Commons — Laptop collage",
  },
  "air-conditioner": {
    url: "https://upload.wikimedia.org/wikipedia/commons/8/8b/MITSUBISHI_ELECTRIC_WINDOW_TYPE_AIR_CONDITIONER_OUTDOOR_UNIT.jpg",
    credit: "Wikimedia Commons — Mitsubishi Electric outdoor unit",
  },
  "sewing-machine": {
    url: "https://upload.wikimedia.org/wikipedia/commons/c/c7/Sewingmachine1.jpg",
    credit: "Wikimedia Commons — Sewing machine",
  },
  "microwave-oven": {
    url: "https://upload.wikimedia.org/wikipedia/commons/0/08/Panasonic_NN-SD69LS_20220410.jpg",
    credit: "Wikimedia Commons — Panasonic NN-SD69LS",
  },
  earbuds: {
    url: "https://upload.wikimedia.org/wikipedia/commons/0/00/S%C5%82uchawki_referencyjne_K-701_firmy_AKG.jpg",
    credit: "Wikimedia Commons — AKG K-701 reference headphones",
  },
};

async function main() {
  console.log("Setting category stock images…");

  for (const [slug, img] of Object.entries(IMAGES)) {
    const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
    if (!cat) {
      console.log(`  ! category not found: ${slug}`);
      continue;
    }

    const prods = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.categoryId, cat.id));

    for (const p of prods) {
      await db.update(products).set({ primaryImage: img.url }).where(eq(products.id, p.id));
      await db.delete(productImages).where(eq(productImages.productId, p.id));
      await db.insert(productImages).values({ productId: p.id, url: img.url, sort: 0 });
      console.log(`  + ${slug}: ${p.name}`);
    }
  }

  console.log("Done.");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
