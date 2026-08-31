import { and, eq, ne } from "drizzle-orm";
import type { DB } from "../../db/client";
import { contentTranslations, problems, reviews, solutions } from "../../db/schema";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { machineTranslate } from "../../lib/translate";
import type { TranslateBody } from "./translate.schema";

type Lang = "bn" | "en";
type TargetType = TranslateBody["targetType"];

/** The translatable text + its declared language for one piece of user content. */
async function loadSource(
  db: DB,
  targetType: TargetType,
  targetId: string,
): Promise<{ text: string; lang: Lang }> {
  if (targetType === "review") {
    const [row] = await db
      .select({ text: reviews.comment, lang: reviews.contentLang })
      .from(reviews)
      .where(and(eq(reviews.id, targetId), ne(reviews.status, "rejected")))
      .limit(1);
    if (!row) throw notFound("REVIEW_NOT_FOUND", "Review not found");
    if (!row.text || !row.text.trim()) {
      throw badRequest("NOTHING_TO_TRANSLATE", "This review has no written text to translate.");
    }
    return { text: row.text, lang: row.lang as Lang };
  }

  if (targetType === "solution") {
    const [row] = await db
      .select({ text: solutions.body, lang: solutions.contentLang })
      .from(solutions)
      .where(and(eq(solutions.id, targetId), ne(solutions.status, "rejected")))
      .limit(1);
    if (!row) throw notFound("SOLUTION_NOT_FOUND", "Solution not found");
    return { text: row.text, lang: row.lang as Lang };
  }

  const [row] = await db
    .select({ text: problems.description, lang: problems.contentLang })
    .from(problems)
    .where(and(eq(problems.id, targetId), ne(problems.status, "rejected")))
    .limit(1);
  if (!row) throw notFound("PROBLEM_NOT_FOUND", "Problem not found");
  return { text: row.text, lang: row.lang as Lang };
}

export async function translateContent(db: DB, input: TranslateBody) {
  const src = await loadSource(db, input.targetType, input.targetId);

  // Already in the requested language — nothing to do.
  if (src.lang === input.targetLang) {
    return {
      text: src.text,
      sourceLang: src.lang,
      targetLang: input.targetLang,
      engine: "identity",
      cached: false,
    };
  }

  // Serve a previous translation if we have one.
  const [hit] = await db
    .select({
      text: contentTranslations.translatedText,
      engine: contentTranslations.engine,
    })
    .from(contentTranslations)
    .where(
      and(
        eq(contentTranslations.targetType, input.targetType),
        eq(contentTranslations.targetId, input.targetId),
        eq(contentTranslations.targetLang, input.targetLang),
      ),
    )
    .limit(1);
  if (hit) {
    return {
      text: hit.text,
      sourceLang: src.lang,
      targetLang: input.targetLang,
      engine: hit.engine,
      cached: true,
    };
  }

  const result = await machineTranslate(src.text, src.lang, input.targetLang);
  if (result.engine === "none") {
    throw new AppError(
      503,
      "TRANSLATION_UNAVAILABLE",
      "Translation isn't set up on this server yet.",
    );
  }

  await db
    .insert(contentTranslations)
    .values({
      targetType: input.targetType,
      targetId: input.targetId,
      targetLang: input.targetLang,
      translatedText: result.text,
      engine: result.engine,
    })
    .onConflictDoNothing();

  return {
    text: result.text,
    sourceLang: src.lang,
    targetLang: input.targetLang,
    engine: result.engine,
    cached: false,
  };
}
