import { createFileRoute, Link } from "@tanstack/react-router";
import { AudioLines, ImageIcon, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ThemeSong — Cari theme song dari sebuah gambar" },
      {
        name: "description",
        content:
          "Upload koleksi lagumu, lalu unggah gambar. Analisis audio + AI memilih lagu dan potongan 15/30/60 detik yang paling cocok.",
      },
      { property: "og:title", content: "ThemeSong — Cari theme song dari sebuah gambar" },
      {
        property: "og:description",
        content: "Pencocokan theme song berbasis analisis audio nyata dan mood gambar.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-24">
        <p className="text-sm font-medium tracking-widest text-primary uppercase">ThemeSong</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">
          Temukan theme song dari sebuah gambar.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Upload lagu-lagumu sekali saja — energi, tempo, dan kecerahannya dianalisis langsung dari
          audio. Lalu unggah gambar, dan AI memilih lagu serta bagian paling pas untuk story
          15/30/60 detik.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Mulai sekarang</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/auth" search={{ mode: "signin" }}>
              Sudah punya akun
            </Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          <Feature icon={<AudioLines className="size-5 text-primary" />} title="Analisis audio">
            Energi per detik, tempo (BPM), bass, dan kecerahan dihitung dari gelombang audio asli.
          </Feature>
          <Feature icon={<ImageIcon className="size-5 text-primary" />} title="Mood gambar">
            AI membaca suasana gambar dan mengubahnya jadi angka yang bisa dibandingkan.
          </Feature>
          <Feature icon={<Sparkles className="size-5 text-primary" />} title="Potongan terbaik">
            Jendela terbaik dipilih dari kurva energi lagu, siap dipakai untuk story.
          </Feature>
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {icon}
      <h2 className="mt-3 font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
