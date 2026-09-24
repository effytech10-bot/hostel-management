"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/server/auth/session";
import { IMPORT_COLUMNS, type ImportKey } from "@/server/domain/import";
import { AppError, toActionError } from "@/server/errors";
import {
  IMPORT_CHUNK,
  importStudents,
  planImport,
  readImportFile,
  type ImportPlan,
  type ImportRowResult,
} from "@/server/services/student-import";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export type PreviewState = { error?: string; plan?: ImportPlan; sheetName?: string };

export async function previewImportAction(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const actor = await requireRole("admin");
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "Choose the Excel file.");
    if (file.size > MAX_FILE_BYTES) throw new AppError("VALIDATION", "The file is too big (max 2 MB).");
    const sheet = await readImportFile(file);
    if (sheet.rows.length === 0) throw new AppError("VALIDATION", "The sheet has headers but no students.");
    const plan = await planImport(actor, sheet.rows, String(formData.get("start") ?? ""));
    return { plan, sheetName: sheet.sheetName };
  } catch (e) {
    return { error: toActionError(e).error };
  }
}

const rawRowSchema = z.object(
  Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, z.string().max(300).optional()])) as Record<
    ImportKey,
    z.ZodOptional<z.ZodString>
  >,
);
const chunkSchema = z.object({
  start: z.string().max(7),
  rows: z
    .array(z.object({ rowNo: z.number().int().min(1).max(100000), raw: rawRowSchema }))
    .min(1)
    .max(IMPORT_CHUNK),
});

export async function importChunkAction(input: unknown): Promise<{ error?: string; results?: ImportRowResult[] }> {
  const actor = await requireRole("admin");
  const parsed = chunkSchema.safeParse(input);
  if (!parsed.success) return { error: "Bad request. Reload the page and try again." };
  try {
    const results = await importStudents(actor, parsed.data.rows, parsed.data.start);
    revalidatePath("/admin", "layout");
    return { results };
  } catch (e) {
    return { error: toActionError(e).error };
  }
}
