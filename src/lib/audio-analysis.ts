/** Browser-only audio analysis using the Web Audio API. */

export type AudioFingerprint = {
  duration: number;
  bpm: number;
  energy: number;
  brightness: number;
  bass: number;
  /** One RMS-energy value (0-1) per second of the track. */
  energyCurve: number[];
};

function rms(data: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += data[i]! * data[i]!;
  return Math.sqrt(sum / Math.max(1, to - from));
}

/** Simple one-pole filters to estimate bass vs. treble content. */
function bandEnergies(data: Float32Array, sampleRate: number) {
  let lp = 0;
  let bassSum = 0;
  let totalSum = 0;
  let prev = 0;
  let highSum = 0;
  const lpCoeff = Math.exp((-2 * Math.PI * 200) / sampleRate);
  for (let i = 0; i < data.length; i++) {
    const x = data[i]!;
    lp = lpCoeff * lp + (1 - lpCoeff) * x;
    bassSum += lp * lp;
    const hp = x - prev;
    prev = x;
    highSum += hp * hp;
    totalSum += x * x;
  }
  const total = Math.max(1e-9, totalSum);
  return {
    bass: Math.min(1, Math.sqrt(bassSum / total)),
    brightness: Math.min(1, Math.sqrt(highSum / total)),
  };
}

/** Tempo estimate via autocorrelation of the per-frame energy envelope. */
function estimateBpm(envelope: number[], framesPerSecond: number): number {
  const mean = envelope.reduce((a, b) => a + b, 0) / Math.max(1, envelope.length);
  const centered = envelope.map((v) => v - mean);
  let bestBpm = 0;
  let bestScore = 0;
  const minLag = Math.round((60 / 200) * framesPerSecond);
  const maxLag = Math.round((60 / 60) * framesPerSecond);
  for (let lag = minLag; lag <= maxLag && lag < centered.length; lag++) {
    let score = 0;
    for (let i = 0; i + lag < centered.length; i++) score += centered[i]! * centered[i + lag]!;
    score /= centered.length - lag;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = (60 * framesPerSecond) / lag;
    }
  }
  return Math.round(bestBpm) || 0;
}

export async function analyzeAudioFile(file: File): Promise<AudioFingerprint> {
  const arrayBuffer = await file.arrayBuffer();
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Browser ini tidak mendukung analisis audio.");
  const ctx = new Ctx();
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channel = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const duration = buffer.duration;

    // Per-second energy curve (kept small: a few KB per song).
    const energyCurve: number[] = [];
    const seconds = Math.max(1, Math.floor(duration));
    for (let s = 0; s < seconds; s++) {
      const from = s * sampleRate;
      const to = Math.min(channel.length, from + sampleRate);
      energyCurve.push(Number(rms(channel, from, to).toFixed(4)));
    }
    const peak = Math.max(...energyCurve, 1e-6);
    const normalized = energyCurve.map((v) => Number(Math.min(1, v / peak).toFixed(4)));

    // Finer envelope (~20 fps) only for tempo estimation.
    const hop = Math.max(1, Math.floor(sampleRate / 20));
    const envelope: number[] = [];
    for (let i = 0; i + hop <= channel.length; i += hop) {
      envelope.push(rms(channel, i, i + hop));
    }
    const bpm = estimateBpm(envelope, sampleRate / hop);
    const bands = bandEnergies(channel, sampleRate);
    const energy = normalized.reduce((a, b) => a + b, 0) / normalized.length;

    return {
      duration: Number(duration.toFixed(2)),
      bpm,
      energy: Number(energy.toFixed(4)),
      brightness: Number(bands.brightness.toFixed(4)),
      bass: Number(bands.bass.toFixed(4)),
      energyCurve: normalized,
    };
  } finally {
    void ctx.close();
  }
}

/** Downscale + re-encode an image in the browser so uploads stay small. */
export async function compressImage(file: File, maxSide = 1280, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gagal memproses gambar.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Gagal mengompres gambar.");
  return blob;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Gagal membaca file."));
    reader.readAsDataURL(blob);
  });
}
