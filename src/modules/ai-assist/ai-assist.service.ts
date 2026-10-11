import { AppError } from "../../lib/errors";
import { lookupProduct } from "../../lib/ai-lookup";
import type { ProductLookupBody } from "./ai-assist.schema";

export async function productLookup(input: ProductLookupBody) {
  const result = await lookupProduct(input.query);
  if (result === null) {
    throw new AppError(
      503,
      "AI_ASSIST_UNAVAILABLE",
      "AI assist isn't set up on this server yet.",
    );
  }
  return result;
}
