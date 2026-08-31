import { z } from "zod";

export const translateBody = z.object({
  targetType: z.enum(["review", "problem", "solution"]),
  targetId: z.string().uuid(),
  targetLang: z.enum(["bn", "en"]),
});

export const translateOut = z.object({
  text: z.string(),
  sourceLang: z.enum(["bn", "en"]),
  targetLang: z.enum(["bn", "en"]),
  engine: z.string(),
  cached: z.boolean(),
});

export type TranslateBody = z.infer<typeof translateBody>;
