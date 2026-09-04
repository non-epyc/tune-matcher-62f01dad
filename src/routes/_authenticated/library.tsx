import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { formatTime } from "@/components/ClipPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { analyzeAudioFile } from "@/lib/audio-analysis";
import {
  ALLOWED_AUDIO_EXTENSIONS,
  collectDroppedAudioFiles,
  splitAudioFiles,
} from "@/lib/drop-files";
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

type QueueStatus = "pending" | "analyzing" | "uploading" | "saving" | "done" | "error" | "canceled";

type QueueItem = {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  message: string;
};

const STATUS_LABEL: Record<QueueStatus, string> = {
  pending: "Menunggu",
  analyzing: "Menganalisis audio…",
  uploading: "Mengunggah…",
  saving: "Menyimpan…",
  done: "Selesai",
  error: "Gagal",
  canceled: "Dibatalkan",
};

function LibraryPage() {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReadingDrop, setIsReadingDrop] = useState(false);
  const dragDepth = useRef(0);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const canceledRef = useRef<Set<string>>(new Set());
  const runningRef = useRef(false);

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

  const queueRef = useRef<QueueItem[]>([]);
  const updateQueue = useCallback((fn: (items: QueueItem[]) => QueueItem[]) => {
    queueRef.current = fn(queueRef.current);
    setQueue(queueRef.current);
  }, []);

  const patch = useCallback(
    (id: string, changes: Partial<QueueItem>) => {
      updateQueue((items) => items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
    },
    [updateQueue],
  );


  const processOne = useCallback(
    async (item: QueueItem) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sesi berakhir, masuk kembali.");
      if (item.file.size > MAX_BYTES) throw new Error("Ukuran file lebih dari 15 MB.");

      patch(item.id, { status: "analyzing", progress: 15, message: STATUS_LABEL.analyzing });
      const fingerprint = await analyzeAudioFile(item.file);
      if (canceledRef.current.has(item.id)) return;

      const extension = item.file.name.split(".").pop()?.toLowerCase() ?? "mp3";
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;
      patch(item.id, { status: "uploading", progress: 55, message: STATUS_LABEL.uploading });
      const { error: uploadError } = await supabase.storage
        .from("songs")
        .upload(path, item.file, { contentType: item.file.type || "audio/mpeg" });
      if (uploadError) throw new Error(uploadError.message);
      if (canceledRef.current.has(item.id)) {
        await supabase.storage.from("songs").remove([path]);
        return;
      }

      patch(item.id, { status: "saving", progress: 85, message: STATUS_LABEL.saving });
      const { error: insertError } = await supabase.from("songs").insert({
        user_id: userId,
        title: item.file.name.replace(/\.[^.]+$/, ""),
        storage_path: path,
        duration: fingerprint.duration,
        bpm: fingerprint.bpm,
        energy: fingerprint.energy,
        brightness: fingerprint.brightness,
        bass: fingerprint.bass,
        energy_curve: fingerprint.energyCurve,
      });
      if (insertError) throw new Error(insertError.message);

      patch(item.id, { status: "done", progress: 100, message: STATUS_LABEL.done });
    },
    [patch],
  );

  const runQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsProcessing(true);
    let processed = 0;
    let failed = 0;

    try {
      for (;;) {
        let next: QueueItem | undefined;
        setQueue((items) => {
          next = items.find((item) => item.status === "pending");
          return items;
        });
        // allow the state callback above to resolve synchronously
        await Promise.resolve();
        if (!next) break;

        const current = next as QueueItem;
        if (canceledRef.current.has(current.id)) {
          patch(current.id, { status: "canceled", progress: 0, message: STATUS_LABEL.canceled });
          continue;
        }

        try {
          await processOne(current);
          if (canceledRef.current.has(current.id)) {
            patch(current.id, { status: "canceled", progress: 0, message: STATUS_LABEL.canceled });
          } else {
            processed += 1;
          }
        } catch (error) {
          failed += 1;
          patch(current.id, {
            status: "error",
            progress: 0,
            message: error instanceof Error ? error.message : "Pemrosesan gagal.",
          });
        }
      }
    } finally {
      runningRef.current = false;
      setIsProcessing(false);
    }

    if (processed > 0) {
      toast.success(`${processed} lagu ditambahkan ke library.`);
      void queryClient.invalidateQueries({ queryKey: ["songs"] });
    }
    if (failed > 0) toast.error(`${failed} file gagal diproses — coba lagi dari daftar.`);
  }, [patch, processOne, queryClient]);

  const enqueue = useCallback(
    (files: File[], rejected: string[]) => {
      if (rejected.length > 0) {
        const preview = rejected.slice(0, 3).join(", ");
        toast.error(
          `${rejected.length} file bukan audio dan dilewati: ${preview}${
            rejected.length > 3 ? "…" : ""
          }. Format didukung: ${ALLOWED_AUDIO_EXTENSIONS.join(", ")}.`,
        );
      }
      if (files.length === 0) {
        if (rejected.length === 0) toast.error("Tidak ada file audio yang ditemukan.");
        return;
      }
      setQueue((items) => [
        ...items,
        ...files.map((file) => ({
          id: crypto.randomUUID(),
          file,
          status: "pending" as QueueStatus,
          progress: 0,
          message: STATUS_LABEL.pending,
        })),
      ]);
      void runQueue();
    },
    [runQueue],
  );

  function cancelItem(item: QueueItem) {
    canceledRef.current.add(item.id);
    if (item.status === "pending") {
      patch(item.id, { status: "canceled", progress: 0, message: STATUS_LABEL.canceled });
    } else {
      patch(item.id, { message: "Membatalkan…" });
    }
  }

  function cancelAll() {
    setQueue((items) =>
      items.map((item) => {
        if (item.status === "done" || item.status === "canceled") return item;
        canceledRef.current.add(item.id);
        return item.status === "pending"
          ? { ...item, status: "canceled" as QueueStatus, progress: 0, message: STATUS_LABEL.canceled }
          : { ...item, message: "Membatalkan…" };
      }),
    );
  }

  function retryItem(item: QueueItem) {
    canceledRef.current.delete(item.id);
    patch(item.id, { status: "pending", progress: 0, message: STATUS_LABEL.pending });
    void runQueue();
  }

  function retryAllFailed() {
    setQueue((items) =>
      items.map((item) => {
        if (item.status !== "error" && item.status !== "canceled") return item;
        canceledRef.current.delete(item.id);
        return { ...item, status: "pending" as QueueStatus, progress: 0, message: STATUS_LABEL.pending };
      }),
    );
    void runQueue();
  }

  function clearFinished() {
    setQueue((items) => items.filter((item) => item.status !== "done"));
  }

  async function play(song: SongRow) {
    try {
      setPlaying({ id: song.id, url: await signedUrl("songs", song.storage_path) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memutar lagu.");
    }
  }

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

  const activeCount = queue.filter(
    (item) => item.status !== "done" && item.status !== "error" && item.status !== "canceled",
  ).length;
  const failedCount = queue.filter(
    (item) => item.status === "error" || item.status === "canceled",
  ).length;
  const doneCount = queue.filter((item) => item.status === "done").length;
  const overall = queue.length
    ? Math.round(queue.reduce((sum, item) => sum + item.progress, 0) / queue.length)
    : 0;

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
          setIsReadingDrop(true);
          void collectDroppedAudioFiles(event.dataTransfer)
            .then(({ audio, rejected }) => {
              setIsReadingDrop(false);
              enqueue(audio, rejected);
            })
            .catch(() => {
              setIsReadingDrop(false);
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
            Tarik &amp; lepas folder lagu ke sini — subfolder ikut dibaca.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderOpen className="mr-2 size-4" /> Pilih folder
            </Button>
            <Input
              type="file"
              accept={ALLOWED_AUDIO_EXTENSIONS.map((extension) => `.${extension}`).join(",")}
              multiple
              className="max-w-56"
              onChange={(event) => {
                const { audio, rejected } = splitAudioFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
                enqueue(audio, rejected);
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
              const { audio, rejected } = splitAudioFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
              enqueue(audio, rejected);
            }}
          />
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Upload className="size-3" /> Maks 15 MB per file · {ALLOWED_AUDIO_EXTENSIONS.join(", ")}
          </span>
        </div>
        {isReadingDrop ? (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-primary">
            <Loader2 className="size-4 animate-spin" /> Membaca folder…
          </p>
        ) : null}
      </div>

      {queue.length > 0 ? (
        <section className="mt-6 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                Pemrosesan file ({doneCount}/{queue.length} selesai)
              </p>
              <p className="text-xs text-muted-foreground">
                {activeCount > 0 ? `${activeCount} file dalam antrean` : "Antrean selesai"}
                {failedCount > 0 ? ` · ${failedCount} perlu dicoba lagi` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {failedCount > 0 ? (
                <Button size="sm" variant="secondary" onClick={retryAllFailed}>
                  <RotateCcw className="mr-2 size-4" /> Coba lagi semua
                </Button>
              ) : null}
              {activeCount > 0 ? (
                <Button size="sm" variant="outline" onClick={cancelAll}>
                  <X className="mr-2 size-4" /> Batalkan semua
                </Button>
              ) : null}
              {doneCount > 0 ? (
                <Button size="sm" variant="ghost" onClick={clearFinished}>
                  Bersihkan selesai
                </Button>
              ) : null}
            </div>
          </div>

          <Progress value={overall} className="mt-3" />

          <ul className="mt-4 space-y-2">
            {queue.map((item) => (
              <li key={item.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-3">
                  {item.status === "done" ? (
                    <CheckCircle2 className="size-4 text-primary" />
                  ) : item.status === "error" ? (
                    <AlertTriangle className="size-4 text-destructive" />
                  ) : item.status === "pending" || item.status === "canceled" ? (
                    <Upload className="size-4 text-muted-foreground" />
                  ) : (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.file.name}</p>
                    <p
                      className={`truncate text-xs ${
                        item.status === "error" ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {item.message}
                    </p>
                  </div>
                  {item.status === "error" || item.status === "canceled" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => retryItem(item)}
                      aria-label={`Coba lagi ${item.file.name}`}
                    >
                      <RotateCcw className="mr-2 size-4" /> Coba lagi
                    </Button>
                  ) : null}
                  {item.status !== "done" && item.status !== "error" && item.status !== "canceled" ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => cancelItem(item)}
                      aria-label={`Batalkan ${item.file.name}`}
                    >
                      <X className="size-4" />
                    </Button>
                  ) : null}
                </div>
                {item.status !== "pending" && item.status !== "canceled" ? (
                  <Progress value={item.progress} className="mt-2 h-1" />
                ) : null}
              </li>
            ))}
          </ul>
          {isProcessing ? (
            <p className="mt-3 text-xs text-muted-foreground">
              File diproses satu per satu agar hemat memori.
            </p>
          ) : null}
        </section>
      ) : null}

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
