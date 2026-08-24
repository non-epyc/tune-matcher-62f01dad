import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { ClipPlayer } from "@/components/ClipPlayer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Riwayat pencocokan — ThemeSong" },
      { name: "description", content: "Semua pasangan gambar dan theme song yang pernah dibuat." },
      { property: "og:title", content: "Riwayat pencocokan — ThemeSong" },
      { property: "og:description", content: "Lihat kembali gambar, lagu, dan potongannya." },
    ],
  }),
  component: HistoryPage,
});

type MatchRow = {
  id: string;
  image_path: string;
  start_seconds: number;
  clip_seconds: number;
  reason: string | null;
  created_at: string;
  songs: { title: string; artist: string | null; storage_path: string } | null;
};

function HistoryPage() {
  const queryClient = useQueryClient();

  const matches = useQuery({
    queryKey: ["matches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select(
          "id, image_path, start_seconds, clip_seconds, reason, created_at, songs(title, artist, storage_path)",
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as MatchRow[];
      return Promise.all(
        rows.map(async (row) => ({
          ...row,
          imageUrl: await signedUrl("images", row.image_path).catch(() => ""),
          audioUrl: row.songs ? await signedUrl("songs", row.songs.storage_path).catch(() => "") : "",
        })),
      );
    },
  });

  const remove = useMutation({
    mutationFn: async (row: { id: string; image_path: string }) => {
      await supabase.storage.from("images").remove([row.image_path]);
      const { error } = await supabase.from("matches").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Riwayat dihapus.");
      void queryClient.invalidateQueries({ queryKey: ["matches"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Gagal menghapus."),
  });

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Riwayat</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Gambar, lagu terpilih, dan potongan yang disarankan.
      </p>

      <div className="mt-6 space-y-4">
        {matches.isLoading ? <p className="text-sm text-muted-foreground">Memuat…</p> : null}
        {matches.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada pencocokan.</p>
        ) : null}
        {matches.data?.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row"
          >
            {row.imageUrl ? (
              <img
                src={row.imageUrl}
                alt={`Gambar untuk ${row.songs?.title ?? "lagu"}`}
                className="h-32 w-32 shrink-0 rounded-lg object-cover"
                loading="lazy"
              />
            ) : null}
            <div className="flex-1">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="font-medium">{row.songs?.title ?? "Lagu sudah dihapus"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("id-ID")}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Hapus riwayat"
                  onClick={() => remove.mutate(row)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {row.audioUrl ? (
                <div className="mt-3">
                  <ClipPlayer
                    src={row.audioUrl}
                    startSeconds={row.start_seconds}
                    clipSeconds={row.clip_seconds}
                  />
                </div>
              ) : null}
              {row.reason ? (
                <p className="mt-3 text-sm text-muted-foreground">{row.reason}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
