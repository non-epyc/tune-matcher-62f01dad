import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ mode: z.enum(["signin", "signup"]).optional() }),
  head: () => ({
    meta: [
      { title: "Masuk — ThemeSong" },
      { name: "description", content: "Masuk atau daftar untuk menyimpan koleksi lagumu." },
      { property: "og:title", content: "Masuk — ThemeSong" },
      { property: "og:description", content: "Masuk ke ThemeSong untuk mencocokkan theme song." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/library", replace: true });
    });
  }, [navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setCheckEmail(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/library", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal masuk.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">
          {mode === "signup" ? "Buat akun" : "Masuk ke ThemeSong"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Koleksi lagu dan riwayat pencocokan tersimpan di akunmu.
        </p>

        {checkEmail ? (
          <p className="mt-6 rounded-md border border-border bg-secondary p-3 text-sm">
            Cek emailmu untuk konfirmasi, lalu masuk kembali.
          </p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Memproses…" : mode === "signup" ? "Daftar" : "Masuk"}
            </Button>
          </form>
        )}

        <button
          type="button"
          className="mt-4 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setCheckEmail(false);
            setMode(mode === "signup" ? "signin" : "signup");
          }}
        >
          {mode === "signup" ? "Sudah punya akun? Masuk" : "Belum punya akun? Daftar"}
        </button>
      </div>
    </div>
  );
}
