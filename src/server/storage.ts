import "server-only";
import { AppError } from "@/server/errors";
import { supabaseAdmin } from "@/server/supabase/admin";

const PHOTO_BUCKET = "student-photos";
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

let bucketReady = false;

/** Private bucket; photos are only ever shown through short-lived signed URLs. */
async function ensurePhotoBucket() {
  if (bucketReady) return;
  const storage = supabaseAdmin().storage;
  const { data } = await storage.getBucket(PHOTO_BUCKET);
  if (!data) {
    const { error } = await storage.createBucket(PHOTO_BUCKET, {
      public: false,
      fileSizeLimit: MAX_PHOTO_BYTES,
      allowedMimeTypes: PHOTO_TYPES,
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  bucketReady = true;
}

/** A real uploaded file, or null when the input was left empty. */
export function photoFromForm(value: FormDataEntryValue | null): File | null {
  if (!value || typeof value === "string" || value.size === 0) return null;
  if (!PHOTO_TYPES.includes(value.type)) throw new AppError("VALIDATION", "Photo must be a JPG, PNG or WebP image.");
  if (value.size > MAX_PHOTO_BYTES) throw new AppError("VALIDATION", "Photo must be smaller than 2 MB.");
  return value;
}

export async function uploadStudentPhoto(orgId: string, studentId: string, file: File): Promise<string> {
  await ensurePhotoBucket();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `org/${orgId}/students/${studentId}/${Date.now()}.${ext}`;
  const { error } = await supabaseAdmin()
    .storage.from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new AppError("VALIDATION", `Photo upload failed: ${error.message}`);
  return path;
}

/** Signed URLs (valid 1 hour) for photo paths. Missing or failed ones are left out. */
export async function signedPhotoUrls(paths: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const result = new Map<string, string>();
  if (unique.length === 0) return result;
  const { data } = await supabaseAdmin().storage.from(PHOTO_BUCKET).createSignedUrls(unique, 3600);
  for (const item of data ?? []) if (item.path && item.signedUrl) result.set(item.path, item.signedUrl);
  return result;
}
