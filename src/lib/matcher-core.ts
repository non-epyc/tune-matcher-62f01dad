/** Pure matching math shared by server and client (no server-only imports). */

export type ImageVector = {
  energy: number;
  warmth: number;
  brightness: number;
  tempo: number;
  keywords: string[];
  mood: string;
};

export type SongProfile = {
  id: string;
  title: string;
  artist: string | null;
  duration: number;
  bpm: number | null;
  energy: number;
  brightness: number;
  bass: number;
  energy_curve: number[];
};

/** Lower is better. */
export function songDistance(vector: ImageVector, song: SongProfile): number {
  const tempoNorm = Math.min(1, Math.max(0, ((song.bpm ?? 100) - 60) / 140));
  const targetTempo = Math.min(1, Math.max(0, vector.tempo));
  return (
    2 * Math.abs(vector.energy - song.energy) +
    1.2 * Math.abs(vector.brightness - song.brightness) +
    1.5 * Math.abs(targetTempo - tempoNorm) +
    0.8 * Math.abs((1 - vector.warmth) - song.brightness)
  );
}

export type Segment = { startSeconds: number; score: number };

/**
 * Slide a window of `clipSeconds` over the per-second energy curve and pick the
 * window whose average energy is closest to the image's energy, preferring
 * stable (low-variance) windows.
 */
export function bestSegment(
  curve: number[],
  clipSeconds: number,
  targetEnergy: number,
): Segment {
  if (curve.length === 0) return { startSeconds: 0, score: 0 };
  const window = Math.min(clipSeconds, curve.length);
  let best: Segment = { startSeconds: 0, score: -Infinity };
  for (let start = 0; start + window <= curve.length; start++) {
    const slice = curve.slice(start, start + window);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    const closeness = 1 - Math.abs(mean - targetEnergy);
    const stability = 1 - Math.min(1, Math.sqrt(variance) * 2);
    // Favour matching energy first, then a consistent feel, then some intensity.
    const score = closeness * 2 + stability * 0.8 + mean * 0.4;
    if (score > best.score) best = { startSeconds: start, score };
  }
  return best.score === -Infinity ? { startSeconds: 0, score: 0 } : best;
}

export function clampVector(raw: Partial<ImageVector>): ImageVector {
  const num = (v: unknown, fallback = 0.5) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
  return {
    energy: num(raw.energy),
    warmth: num(raw.warmth),
    brightness: num(raw.brightness),
    tempo: num(raw.tempo),
    keywords: Array.isArray(raw.keywords) ? raw.keywords.slice(0, 6).map(String) : [],
    mood: typeof raw.mood === "string" ? raw.mood : "",
  };
}
