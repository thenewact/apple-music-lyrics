"use client";
import React, { useEffect, useRef, useState } from "react";

/**
 * AppleMusicLyricsPlayer
 * - fixed bugs: stable event handlers, proper cleanup, safer LRC parse, revoke blobs, RAF lifecycle
 * - drop-in for Next.js app router (components/)
 */

export default function AppleMusicLyricsPlayer() {
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const [rawLrc, setRawLrc] = useState("");
  const [lyrics, setLyrics] = useState<{ time: number; text: string }[]>([]);
  const [index, setIndex] = useState<number>(-1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeBlob = useRef<string | null>(null);
  const currentIndexRef = useRef<number>(-1);
  const mountedRef = useRef(true);

  // parse LRC -> [{time, text}]
  function parseLRC(text: string) {
    if (!text) return [];
    const lines = String(text).split(/\r?\n/);
    const re = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g;
    const out: { time: number; text: string }[] = [];

    for (const raw of lines) {
      if (!raw.trim()) continue;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      const times: number[] = [];
      while ((m = re.exec(raw)) !== null) {
        const mm = parseInt(m[1], 10);
        const ss = parseFloat(m[2]);
        if (!Number.isNaN(mm) && !Number.isNaN(ss)) times.push(mm * 60 + ss);
      }
      const txt = raw.replace(re, "").trim();
      if (!txt) continue;
      for (const t of times) out.push({ time: t, text: txt });
    }

    return out.sort((a, b) => a.time - b.time);
  }

  // audio file upload
  function onAudioFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAudioError(null);

    let url: string;
    try {
      url = URL.createObjectURL(f);
    } catch (err) {
      setAudioError("Could not create object URL for file.");
      return;
    }

    // revoke previous blob after swap
    const prev = activeBlob.current;
    activeBlob.current = url;
    setAudioSrc(url);
    setFileName(f.name || "track");

    if (prev && prev !== url) {
      try {
        URL.revokeObjectURL(prev);
      } catch {}
    }

    // attempt explicit load
    requestAnimationFrame(() => {
      try {
        audioRef.current?.load();
      } catch {}
    });
  }

  // lrc upload
  function onLrcFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result || "");
      setRawLrc(text);
      const parsed = parseLRC(text);
      setLyrics(parsed);
      setIndex(-1);
      currentIndexRef.current = -1;
    };
    r.readAsText(f);
  }

  // paste/edit textarea
  function onPasteLrc(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setRawLrc(v);
    const parsed = parseLRC(v);
    setLyrics(parsed);
    setIndex(-1);
    currentIndexRef.current = -1;
  }

  // audio element handlers (attach once)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onError() {
      const code = (audio.error && (audio.error as any).code) || 0;
      setAudioError(`Playback error. Code ${code}.`);
      setAudioSrc(null);
      setFileName(null);
    }

    function onCanPlay() {
      setAudioError(null);
    }

    audio.addEventListener("error", onError);
    audio.addEventListener("canplay", onCanPlay);

    return () => {
      audio.removeEventListener("error", onError);
      audio.removeEventListener("canplay", onCanPlay);
    };
    // intentionally run once - audioRef.current identity stable in DOM lifecycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RAF sync loop for lyrics
  useEffect(() => {
    if (!lyrics || lyrics.length === 0) {
      setIndex(-1);
      currentIndexRef.current = -1;
      return;
    }

    mountedRef.current = true;
    let cancelled = false;

    function loop() {
      if (cancelled || !mountedRef.current) return;
      const a = audioRef.current;
      if (!a) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const t = a.currentTime || 0;

      // binary search for last index <= t
      let low = 0,
        high = lyrics.length - 1,
        ans = -1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lyrics[mid].time <= t) {
          ans = mid;
          low = mid + 1;
        } else high = mid - 1;
      }

      if (ans !== currentIndexRef.current) {
        currentIndexRef.current = ans;
        setIndex(ans);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [lyrics]);

  // cleanup on unmount: revoke blob, stop RAF, pause audio
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (activeBlob.current) {
        try {
          URL.revokeObjectURL(activeBlob.current);
        } catch {}
        activeBlob.current = null;
      }
      try {
        audioRef.current?.pause();
        audioRef.current?.removeAttribute("src");
      } catch {}
    };
  }, []);

  // sample LRC for quick test
  function loadSample() {
    const sample =
      "[00:00.00] Sample demo lyric line\n[00:04.00] The next big line shows\n[00:08.50] Apple-like centered lyric\n[00:12.00] Another sample line";
    setRawLrc(sample);
    const parsed = parseLRC(sample);
    setLyrics(parsed);
    setIndex(-1);
    currentIndexRef.current = -1;
  }

  // Lyric visual (keeps it simple and robust)
  function LyricVisual() {
    const center = (index >= 0 ? lyrics[index]?.text : lyrics[0]?.text) || "";
    const layers = 6;
    const stack = [];
    for (let i = 0; i < layers; i++) {
      const idx = index + i;
      const text = idx >= 0 && idx < lyrics.length ? lyrics[idx].text : center;
      stack.push({ text, i });
    }

    return (
      <div className="relative w-full flex-1 flex items-center justify-center px-8">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/60 pointer-events-none" />
        <div className="relative z-10 w-full max-w-4xl text-center">
          <div className="absolute inset-0 flex items-center justify-center -z-0 pointer-events-none">
            {stack.map((s) => {
              const depth = s.i;
              const opacity = Math.max(0, 0.6 - depth * 0.11);
              const translate = depth * 24;
              const scale = 1 - depth * 0.03;
              const blur = depth * 3;
              return (
                <div
                  key={depth}
                  style={{
                    position: "absolute",
                    left: "50%",
                    transform: `translate(-50%, ${translate}px) scale(${scale})`,
                    filter: `blur(${blur}px)`,
                    opacity,
                    transition: "all 420ms ease",
                    width: "100%",
                    textAlign: "center",
                  }}
                >
                  <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: 600, fontSize: 48, lineHeight: "1.05em" }}>
                    {s.text}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative">
            <div className="mx-auto w-full">
              <div style={{ fontWeight: 900, fontSize: 72, lineHeight: "1.02em", color: "#fff", textShadow: "0 10px 30px rgba(0,0,0,0.6)" }}>
                {center}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row items-stretch">
      <aside className="md:w-72 p-6 bg-white/3 backdrop-blur-sm border-r border-white/5">
        <div className="text-2xl font-semibold mb-6 text-white">Music</div>

        <div className="space-y-3 text-sm text-gray-200">
          <div className="p-2 rounded">Listen Now</div>
          <div className="p-2 rounded">Library</div>
          <div className="p-2 rounded">Playlists</div>
        </div>

        <div className="mt-6 space-y-2">
          <label className="text-xs text-gray-200">Upload audio</label>
          <input accept="audio/*,audio/mpeg" onChange={onAudioFile} type="file" />
          <label className="text-xs text-gray-200">Upload .lrc</label>
          <input accept=".lrc,text/plain" onChange={onLrcFile} type="file" />
          <button onClick={loadSample} className="mt-2 px-3 py-2 rounded bg-white/5 text-sm">
            Load sample LRC
          </button>
        </div>

        <div className="mt-6 text-sm text-gray-300">{fileName || "No audio loaded"}</div>
        {audioError && <div className="mt-3 text-red-300 text-sm">{audioError}</div>}
      </aside>

      <main className="flex-1 p-6 flex flex-col">
        <div className="md:flex-1 flex flex-col justify-center">
          <LyricVisual />
        </div>

        <div className="mt-6">
          <audio ref={audioRef} controls className="w-full" src={audioSrc || undefined} />
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <textarea value={rawLrc} onChange={onPasteLrc} placeholder="[00:12.00] Example lyric" className="col-span-2 p-3 bg-black/20 text-white rounded h-28" />
          <div className="p-3 bg-black/10 rounded text-white/80">
            <div className="text-sm mb-2">Parsed lines: {lyrics.length}</div>
            <div className="max-h-40 overflow-auto text-sm space-y-1">
              {lyrics.map((l, i) => (
                <div key={i} className={i === index ? "text-white font-semibold" : "text-white/60"}>
                  {l.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
