import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { bestSegment, songDistance, type SongProfile } from "./matcher-core";

const matchInput = z.object({
  imageDataUrl: z.string().min(32),
  clipSeconds: z.union([z.literal(15), z.literal(30), z.literal(60)]),
});

export const matchThemeSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => matchInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: songs, error } = await supabase
      .from("songs")
      .select("id, title, artist, duration, bpm, energy, brightness, bass, energy_curve")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    if (!songs || songs.length === 0) {
      throw new Error("Belum ada lagu di library. Upload lagu dulu ya.");
    }

    const { analyzeImageMood } = await import("./matcher.server");
    const vector = await analyzeImageMood(data.imageDataUrl);

    const ranked = (songs as SongProfile[])
      .map((song) => ({ song, distance: songDistance(vector, song) }))
      .sort((a, b) => a.distance - b.distance);

    const winner = ranked[0]!;
    const segment = bestSegment(winner.song.energy_curve ?? [], data.clipSeconds, vector.energy);

    const reason = `Mood gambar: ${vector.mood || "tidak terdeskripsi"}. Energi gambar ${(vector.energy * 100).toFixed(0)}% cocok dengan "${winner.song.title}" (energi ${(winner.song.energy * 100).toFixed(0)}%, ${winner.song.bpm ?? "?"} BPM). Bagian mulai detik ${segment.startSeconds} dipilih karena energinya paling mendekati suasana gambar.`;

    return {
      songId: winner.song.id,
      startSeconds: segment.startSeconds,
      clipSeconds: data.clipSeconds,
      vector,
      reason,
      alternatives: ranked.slice(1, 4).map((r) => ({
        id: r.song.id,
        title: r.song.title,
        artist: r.song.artist,
      })),
    };
  });
