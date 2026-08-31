import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { priceAlerts, products } from "../db/schema";
import { notify } from "./notify";

const RENOTIFY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A new price point came in — notify anyone whose alert threshold it meets
 * (and who hasn't been pinged about this product in the last week).
 */
export async function maybeNotifyPriceDrop(
  db: DB,
  productId: string,
  price: number,
): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RENOTIFY_AFTER_MS);
    const rows = await db
      .select({ id: priceAlerts.id, userId: priceAlerts.userId })
      .from(priceAlerts)
      .where(
        and(
          eq(priceAlerts.productId, productId),
          sql`${priceAlerts.targetPrice} >= ${price}`,
          or(isNull(priceAlerts.lastNotifiedAt), lte(priceAlerts.lastNotifiedAt, cutoff)),
        ),
      );
    if (rows.length === 0) return;

    const [product] = await db
      .select({ slug: products.slug, name: products.name })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    await db
      .update(priceAlerts)
      .set({ lastNotifiedAt: new Date() })
      .where(
        sql`${priceAlerts.id} = any(${rows.map((r) => r.id)})`,
      );

    await notify(db, {
      userIds: rows.map((r) => r.userId),
      type: "price_drop",
      target: { type: "product", id: productId },
      meta: {
        href: `/products/${product?.slug ?? ""}`,
        title: product?.name ?? "",
        price,
      },
    });
  } catch {
    // best-effort
  }
}
