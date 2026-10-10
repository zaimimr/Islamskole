import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new NextResponse(null, { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("lesson_materials").select("file_path, file_name")
    .eq("id", id).eq("kind", "file").eq("status", "ready").maybeSingle();
  if (error || !data?.file_path || !data.file_name) return new NextResponse(null, { status: 404 });
  const { data: file, error: fileError } = await supabase.storage.from("lesson-materials")
    .createSignedUrl(data.file_path, 60, { download: data.file_name });
  if (fileError || !file?.signedUrl) return new NextResponse(null, { status: 404 });
  const response = NextResponse.redirect(file.signedUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
