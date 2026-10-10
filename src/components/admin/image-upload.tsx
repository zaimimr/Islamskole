"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createMediaUpload } from "@/lib/media-actions";

type ImageUploadProps = {
  name: string;
  label?: string;
  defaultValue?: string | null;
};

export function ImageUpload({
  name,
  label = "Bilde",
  defaultValue = null,
}: ImageUploadProps) {
  const [url, setUrl] = useState<string>(defaultValue ?? "");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const supabase = createClient();
      const extension = file.name.split(".").pop() ?? "bin";
      const path = `${crypto.randomUUID()}.${extension}`;
      const upload = await createMediaUpload(path);
      if (!upload.ok) {
        toast.error("Kunne ikke laste opp bilde. Prøv igjen.");
        return;
      }

      const { error } = await supabase.storage
        .from("media")
        .uploadToSignedUrl(path, upload.token, file);

      if (error) {
        toast.error("Kunne ikke laste opp bilde. Prøv igjen.");
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("media").getPublicUrl(path);

      setUrl(publicUrl);
      toast.success("Bilde lastet opp");
    } catch {
      toast.error("Kunne ikke laste opp bilde. Prøv igjen.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <input type="hidden" name={name} value={url} />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {url ? (
        <div className="relative w-fit overflow-hidden rounded-md border border-border bg-muted">
          <Image
            src={url}
            alt=""
            width={240}
            height={160}
            className="h-40 w-60 object-cover"
            unoptimized
          />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="Fjern bilde"
            title="Fjern bilde"
            className="absolute right-2 top-2"
            onClick={() => setUrl("")}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImagePlus className="size-4" />
          )}
          {uploading ? "Laster opp..." : "Last opp bilde"}
        </Button>
      )}
    </div>
  );
}
