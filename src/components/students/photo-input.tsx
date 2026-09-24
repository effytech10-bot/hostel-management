"use client";

import { useRef, useState } from "react";
import { Label } from "@/components/ui/label";

const MAX_SIDE = 600;

/** Shrink a phone photo to at most 600px JPEG in the browser, so uploads are small on slow connections. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
}

export function PhotoInput({ currentUrl, label = "Photo" }: { currentUrl?: string | null; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [busy, setBusy] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const small = await shrink(file);
      const dt = new DataTransfer();
      dt.items.add(small);
      if (inputRef.current) inputRef.current.files = dt.files;
      setPreview(URL.createObjectURL(small));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="bg-muted size-20 shrink-0 overflow-hidden rounded-lg border">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Student photo" className="size-full object-cover" />
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center text-xs">No photo</div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="photo">{label}</Label>
        <input
          ref={inputRef}
          id="photo"
          name="photo"
          type="file"
          accept="image/*"
          capture="user"
          onChange={onChange}
          className="file:bg-background text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm"
        />
        {busy && <span className="text-muted-foreground text-xs">Preparing photo…</span>}
      </div>
    </div>
  );
}
