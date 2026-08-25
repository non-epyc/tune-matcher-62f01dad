import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FolderOpen, Trash2, Upload } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { formatTime } from "@/components/ClipPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { analyzeAudioFile } from "@/lib/audio-analysis";
import { collectDroppedAudioFiles, isAudioFile } from "@/lib/drop-files";
import { signedUrl } from "@/lib/storage";

const MAX_BYTES = 15 * 1024 * 1024;


export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Library lagu — ThemeSong" },
      { name: "description", content: "Kelola koleksi lagu dan lihat hasil analisis audionya." },
      { property: "og:title", content: "Library lagu — ThemeSong" },
      { property: "og:description", content: "Koleksi lagu dengan energi, tempo, dan kecerahan." },
    ],
  }),
  component: LibraryPage,
});

type SongRow = {
  id: string;
  title: string;
  artist: string | null;
  storage_path: string;
  duration: number;
  bpm: number | null;
  energy: number;
  brightness: number;
  bass: number;
};

function LibraryPage() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const folderInputRef = useRef<HTMLInputElement>(null);


  const songs = useQuery({
    queryKey: ["songs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("songs")
        .select("id, title, artist, storage_path, duration, bpm, energy, brightness, bass")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as SongRow[];
    },
  });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sesi berakhir, masuk kembali.");

      for (const [index, file] of files.entries()) {
        setProgress(`Menganalisis ${file.name} (${index + 1}/${files.length})…`);
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name} lebih dari 15 MB, dilewati.`);
          continue;
        }
        const fingerprint = await analyzeAudioFile(file);
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "mp3";
        const path = `${userId}/${crypto.randomUUID()}.${extension}`;
        setProgress(`Mengunggah ${file.name}…`);
        const { error: uploadError } = await supabase.storage
          .from("songs")
          .upload(path, file, { contentType: file.type || "audio/mpeg" });
        if (uploadError) throw new Error(uploadError.message);

        const { error: insertError } = await supabase.from("songs").insert({
          user_id: userId,
          title: file.name.replace(/\.[^.]+$/, ""),
          storage_path: path,
          duration: fingerprint.duration,
          bpm: fingerprint.bpm,
          energy: fingerprint.energy,
          brightness: fingerprint.brightness,
          bass: fingerprint.bass,
          energy_curve: fingerprint.energyCurve,
        });
        if (insertError) throw new Error(insertError.message);
      }
    },
    onSuccess: () => {
      setProgress(null);
      toast.success("Lagu ditambahkan ke library.");
      void queryClient.invalidateQueries({ queryKey: ["songs"] });
    },
    onError: (error) => {
      setProgress(null);
      toast.error(error instanceof Error ? error.message : "Upload gagal.");
    },
  });

  const remove = useMutation({
    mutationFn: async (song: SongRow) => {
      await supabase.storage.from("songs").remove([song.storage_path]);
      const { error } = await supabase.from("songs").delete().eq("id", song.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lagu dihapus.");
      void queryClient.invalidateQueries({ queryKey: ["songs"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Gagal menghapus."),
  });

  async function play(song: SongRow) {
    try {
      setPlaying({ id: song.id, url: await signedUrl("songs", song.storage_path) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memutar lagu.");
    }
  }

  function startUpload(files: File[]) {
    if (upload.isPending) {
      toast.info("Tunggu upload yang sedang berjalan selesai.");
      return;
    }
    if (files.length === 0) {
      toast.error("Tidak ada file audio yang ditemukan.");
      return;
    }
    upload.mutate(files);
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Library lagu</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Audio dianalisis di browser saat upload: energi per detik, tempo, bass, dan kecerahan.
      </p>

      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setIsDragging(false);
          setProgress("Membaca folder…");
          void collectDroppedAudioFiles(event.dataTransfer)
            .then((files) => {
              setProgress(null);
              startUpload(files);
            })
            .catch(() => {
              setProgress(null);
              toast.error("Gagal membaca folder yang di-drop.");
            });
        }}
        className={`mt-6 rounded-xl border-2 border-dashed p-6 transition-colors ${
          isDragging ? "border-primary bg-primary/10" : "border-border bg-card"
        }`}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <FolderOpen className={`size-7 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
          <p className="text-sm font-medium">
            Tarik & lepas folder lagu ke sini — subfolder ikut dibaca.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={upload.isPending}
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderOpen className="mr-2 size-4" /> Pilih folder
            </Button>
            <Input
              type="file"
              accept="audio/*"
              multiple
              className="max-w-56"
              disabled={upload.isPending}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []).filter(isAudioFile);
                event.target.value = "";
                if (files.length) startUpload(files);
              }}
            />
          </div>
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            // @ts-expect-error non-standard folder-picker attributes
            webkitdirectory="true"
            directory="true"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []).filter(isAudioFile);
              event.target.value = "";
              startUpload(files);
            }}
          />
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Upload className="size-3" /> Maks 15 MB per file.
          </span>
        </div>
        {progress ? <p className="mt-4 text-center text-sm text-primary">{progress}</p> : null}

      </div>

      <div className="mt-8 space-y-3">
        {songs.isLoading ? <p className="text-sm text-muted-foreground">Memuat…</p> : null}
        {songs.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada lagu. Upload MP3 pertamamu.</p>
        ) : null}
        {songs.data?.map((song) => (
          <div key={song.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-40">
                <p className="font-medium">{song.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatTime(song.duration)} · {song.bpm ?? "?"} BPM · energi{" "}
                  {(song.energy * 100).toFixed(0)}% · terang {(song.brightness * 100).toFixed(0)}%
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => void play(song)}>
                Putar
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Hapus lagu"
                onClick={() => remove.mutate(song)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {playing?.id === song.id ? (
              <audio className="mt-3 w-full" src={playing.url} controls autoPlay />
            ) : null}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
