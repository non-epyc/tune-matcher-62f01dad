import { useEffect, useRef, useState } from "react";
import { Pause, Play, Repeat } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  src: string;
  startSeconds: number;
  clipSeconds: number;
  label?: string;
};

export function ClipPlayer({ src, startSeconds, clipSeconds, label }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [position, setPosition] = useState(startSeconds);

  useEffect(() => {
    setPosition(startSeconds);
    const audio = audioRef.current;
    if (audio) audio.currentTime = startSeconds;
  }, [startSeconds, src]);

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    setPosition(audio.currentTime);
    if (audio.currentTime >= startSeconds + clipSeconds) {
      if (loop) {
        audio.currentTime = startSeconds;
      } else {
        audio.pause();
        setPlaying(false);
      }
    }
  }

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    if (audio.currentTime < startSeconds || audio.currentTime > startSeconds + clipSeconds) {
      audio.currentTime = startSeconds;
    }
    await audio.play();
    setPlaying(true);
  }

  const progress = Math.min(100, Math.max(0, ((position - startSeconds) / clipSeconds) * 100));

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <audio ref={audioRef} src={src} preload="metadata" onTimeUpdate={onTimeUpdate} />
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={toggle} aria-label="Putar potongan">
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <div className="flex-1">
          {label ? <p className="text-sm font-medium">{label}</p> : null}
          <p className="text-xs text-muted-foreground">
            {formatTime(startSeconds)} – {formatTime(startSeconds + clipSeconds)} ({clipSeconds}s)
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <Button
          size="icon"
          variant={loop ? "default" : "ghost"}
          onClick={() => setLoop((v) => !v)}
          aria-label="Ulangi potongan"
        >
          <Repeat className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
