import { supabase } from "@/integrations/supabase/client";

export async function signedUrl(
  bucket: "songs" | "images",
  path: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data) throw new Error(error?.message ?? "Gagal membuat URL file.");
  return data.signedUrl;
}
