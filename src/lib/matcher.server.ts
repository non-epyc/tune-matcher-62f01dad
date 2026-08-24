import { clampVector, type ImageVector } from "./matcher-core";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SYSTEM = `Kamu menganalisis mood sebuah gambar untuk memilih theme song.
Balas HANYA JSON dengan bentuk:
{"energy":0-1,"warmth":0-1,"brightness":0-1,"tempo":0-1,"mood":"kalimat singkat bahasa Indonesia","keywords":["..."]}
energy = seberapa energik/ramai suasananya, warmth = kehangatan warna & rasa,
brightness = terang/gelap, tempo = tempo lagu yang diinginkan (0 = sangat lambat, 1 = sangat cepat).`;

export async function analyzeImageMood(imageDataUrl: string): Promise<ImageVector> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI belum dikonfigurasi.");

  const response = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: "Analisis gambar ini." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) throw new Error("AI sedang sibuk, coba lagi sebentar lagi.");
    if (response.status === 402)
      throw new Error("Kredit AI habis. Tambahkan kredit di workspace Lovable.");
    throw new Error(`Analisis gambar gagal (${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  let parsed: Partial<ImageVector> = {};
  try {
    parsed = JSON.parse(content) as Partial<ImageVector>;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]) as Partial<ImageVector>;
  }
  return clampVector(parsed);
}
