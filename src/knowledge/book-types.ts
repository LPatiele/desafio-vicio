import { z } from "zod";

const common = { text: z.string().min(1), chapter: z.string().min(1), chapterNumber: z.number().int().positive(), author: z.string().min(1) };
export const ExtractedBookSchema = z.object({
  version: z.literal(1), extractorSha256: z.string().regex(/^[a-f0-9]{64}$/), inputSha256: z.string().regex(/^[a-f0-9]{64}$/), inputBytes: z.number().int().positive(),
  format: z.enum(["pdf", "epub"]), method: z.string().min(1), metadata: z.record(z.string(), z.unknown()),
  units: z.array(z.discriminatedUnion("format", [
    z.object({ ...common, format: z.literal("pdf"), page: z.number().int().positive() }).strict(),
    z.object({ ...common, format: z.literal("epub"), section: z.string().min(1), sectionId: z.string().nullable(), path: z.string().min(1) }).strict(),
  ])).min(1), excluded: z.array(z.unknown()),
}).strict().refine(d => d.units.every(u => u.format === d.format), "Unidade pertence a outro formato.");
export type ExtractedBook = z.infer<typeof ExtractedBookSchema>;
