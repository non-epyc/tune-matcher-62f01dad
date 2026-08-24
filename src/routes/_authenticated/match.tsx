import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { ClipPlayer } from "@/components/ClipPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { blobToDataUrl, compressImage } from "@/lib/audio-analysis";
import { matchThemeSong } from "@/lib/matcher.functions";
import { signedUrl } from "@/lib/storage";

const CLIP_OPTIONS = [15, 30, 60] as const;
type ClipSeconds = (typeof CLIP_OPTIONS)[number];

export const Route = createFileRoute("/_authenticated/match")({
  head: () => ({
    meta: [
      { title: "Cocokkan gambar — ThemeSong" },
      {
        name: "description",
        content: "Unggah gambar dan dapatkan theme song beserta potongan terbaiknya.",
      },
      { property: "og:title", content: "Cocokkan gambar — ThemeSong" },
      { property: "og:description", content: "Pencocokan mood gambar dengan koleksi lagumu." },
    ],
  }),
  component: MatchPage,
});

type Result = {
  title: string;
  artist: string | null;
  audioUrl: string;
  startSeconds: number;
  clipSeconds: number;
  reason: string;
};

function MatchPage() {
  const queryClient = useQueryClient();
  const runMatch = useServerFn(matchThemeSong);
  const [clipSeconds, setClipSeconds] = useState<ClipSeconds>(15);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const match = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Pilih gambar dulu.");
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sesi berakhir, masuk kembali.");

      setStatus("Mengompres gambar…");
      const compressed = await compressImage(file);
      const dataUrl = await blobToDataUrl(compressed);

      setStatus("Menganalisis mood gambar…");
      const outcome = await runMatch({ data: { imageDataUrl: dataUrl, clipSeconds } });

      setStatus("Menyimpan hasil…");
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(path, compressed, { contentType: "image/jpeg" });
      if (uploadError) throw new Error(uploadError.message);

      const { data: song, error: songError } = await supabase
        .from("songs")
        .select("title, artist, storage_path")
        .eq("id", outcome.songId)
        .single();
      if (songError) throw new Error(songError.message);

      const { error: insertError } = await supabase.from("matches").insert({
        user_id: userId,
        image_path: path,
        song_id: outcome.songId,
        start_seconds: outcome.startSeconds,
        clip_seconds: outcome.clipSeconds,
        image_vector: outcome.vector,
        reason: outcome.reason,
      });
      if (insertError) throw new Error(insertError.message);

      return {
        title: song.title,
        artist: song.artist,
        audioUrl: await signedUrl("songs", song.storage_path),
        startSeconds: outcome.startSeconds,
        clipSeconds: outcome.clipSeconds,
        reason: outcome.reason,
      } satisfies Result;
    },
    onSuccess: (value) => {
      setStatus(null);
      setResult(value);
      void queryClient.invalidateQueries({ queryKey: ["matches"] });
    },
    onError: (error) => {
      setStatus(null);
      toast.error(error instanceof Error ? error.message : "Pencocokan gagal.");
    },
  });

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Cocokkan gambar</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        AI membaca mood gambar, lalu bagian lagu dengan energi paling mirip dipilih dari kurva
        energinya.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <Input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              setResult(null);
              setPreview(selected ? URL.createObjectURL(selected) : null);
            }}
          />
          {preview ? (
            <img
              src={preview}
              alt="Pratinjau gambar yang akan dicocokkan"
              className="mt-4 max-h-72 w-full rounded-lg object-cover"
            />
          ) : null}

          <div className="mt-4">
            <p className="text-sm font-medium">Durasi potongan</p>
            <div className="mt-2 flex gap-2">
              {CLIP_OPTIONS.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={clipSeconds === option ? "default" : "secondary"}
                  onClick={() => setClipSeconds(option)}
                >
                  {option}s
                </Button>
              ))}
            </div>
          </div>

          <Button
            className="mt-5 w-full"
            disabled={!file || match.isPending}
            onClick={() => match.mutate()}
          >
            {match.isPending ? (status ?? "Memproses…") : "Cari theme song"}
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          {result ? (
            <>
              <p className="text-xs tracking-widest text-primary uppercase">Theme song</p>
              <h2 className="mt-1 text-lg font-semibold">{result.title}</h2>
              {result.artist ? (
                <p className="text-sm text-muted-foreground">{result.artist}</p>
              ) : null}
              <div className="mt-4">
                <ClipPlayer
                  src={result.audioUrl}
                  startSeconds={result.startSeconds}
                  clipSeconds={result.clipSeconds}
                  label="Potongan terbaik"
                />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{result.reason}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Hasil pencocokan akan muncul di sini beserta pemutar potongannya.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
