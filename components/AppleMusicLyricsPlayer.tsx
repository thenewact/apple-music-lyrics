"use client";
import React, { ChangeEvent, JSX, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type LyricLine = { time: number; text: string };

const CSS_VARS = {
  lyricSizeDesktop: 72,
  lyricSizeMobile: 56,
  layers: 6,
  layerSpacing: 26,
  layerBlur: 3,
};

export default function AppleMusicLyricsPlayer(): JSX.Element {
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const [rawLrc, setRawLrc] = useState<string>("");
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeBlob = useRef<string | null>(null);
  const currentIndexRef = useRef<number>(-1);

  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    const check = () => setIsMobile(typeof window !== "undefined" && window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  function parseLRC(text: string): LyricLine[] {
    if (!text) return [];
    const lines = String(text).split(/\r?\n/);
    const re = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g;
    const out: LyricLine[] = [];
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
      const textOnly = raw.replace(re, "").trim();
      for (const t of times) out.push({ time: t, text: textOnly });
    }
    return out.sort((a, b) => a.time - b.time);
  }

  async function onAudioFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAudioError(null);
    let url: string;
    try {
      url = URL.createObjectURL(f);
    } catch {
      setAudioError("Could not create URL for audio.");
      return;
    }
    const prev = activeBlob.current;
    activeBlob.current = url;
    setAudioSrc(url);
    setFileName(f.name || "Track");
    setCoverUrl(null);
    if (prev && prev !== url) {
      try { URL.revokeObjectURL(prev); } catch {}
    }
    requestAnimationFrame(() => {
      try { audioRef.current?.load(); } catch {}
    });
  }

  function onLrcFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result || "");
      setRawLrc(text);
      setLyrics(parseLRC(text));
      setCurrentIndex(-1);
      currentIndexRef.current = -1;
    };
    r.readAsText(f);
  }

  function onPasteLrc(e: ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setRawLrc(v);
    setLyrics(parseLRC(v));
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
  }

  useEffect(() => {
    const node = audioRef.current;
    if (!node) return;

    const onError = () => {
      const err = node.error;
      const code = typeof err?.code === "number" ? err.code : 0;
      const msg = (err && (err as { message?: string }).message) ?? "";
      setAudioError(`Playback error. Code ${code}. ${msg}`);
      setAudioSrc(null);
      setFileName(null);
    };
    const onCanPlay = () => setAudioError(null);

    node.addEventListener("error", onError);
    node.addEventListener("canplay", onCanPlay);
    return () => {
      node.removeEventListener("error", onError);
      node.removeEventListener("canplay", onCanPlay);
    };
  }, []);

  useEffect(() => {
    if (!lyrics || lyrics.length === 0) {
      setCurrentIndex(-1);
      currentIndexRef.current = -1;
      return;
    }
    let cancelled = false;
    function loop() {
      if (cancelled) return;
      const a = audioRef.current;
      if (!a) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const t = a.currentTime || 0;
      let low = 0, high = lyrics.length - 1, ans = -1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lyrics[mid].time <= t) { ans = mid; low = mid + 1; } else high = mid - 1;
      }
      if (ans !== currentIndexRef.current) {
        currentIndexRef.current = ans;
        setCurrentIndex(ans);
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

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (activeBlob.current) {
        try { URL.revokeObjectURL(activeBlob.current); } catch {}
        activeBlob.current = null;
      }
      try { audioRef.current?.pause(); audioRef.current?.removeAttribute("src"); } catch {}
    };
  }, []);

  function loadSample() {
    const sample = `[00:00.00] One minute they arrive\n[00:05.00] Next you know they're gone\n[00:10.00] Fly on\n[00:15.00] Fly on, on\n[00:20.00] So fly on, ride through`;
    setRawLrc(sample);
    setLyrics(parseLRC(sample));
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
  }

  const mainLyric = (currentIndex >= 0 ? lyrics[currentIndex]?.text : lyrics[0]?.text) || "";
  const layerIndices = Array.from({ length: CSS_VARS.layers }, (_, i) => i);

  return (
    <div
      className="min-h-screen w-full text-white"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        background: "linear-gradient(180deg,#0b2746 0%, #071228 60%)",
      }}
    >
      <div className="max-w-screen-xl mx-auto grid grid-cols-12 gap-6 p-6 md:p-10">
        <div className="col-span-12 md:col-span-4 flex flex-col gap-6">
          <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-black/30">
            <div
              className="w-full aspect-square bg-center bg-cover"
              style={{
                backgroundImage: `url(${coverUrl ?? "https://via.placeholder.com/1200/0b2746/ffffff?text=Album"})`,
              }}
            />
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg,transparent,rgba(3,7,18,0.6))" }} />
            <div className="absolute left-4 bottom-4 text-left">
              <div className="text-sm text-white/80">{fileName ?? "Track Title"}</div>
              <div className="text-xs text-white/60">Artist</div>
            </div>
          </div>

          <div className="w-full">
            <audio ref={audioRef} controls className="w-full" src={audioSrc ?? undefined} />
          </div>

          <div className="text-sm text-white/70">
            <div className="mb-1">Upload audio</div>
            <input accept="audio/*,audio/mpeg" onChange={onAudioFile} type="file" />
            <div className="mt-3 mb-1">Upload .lrc</div>
            <input accept=".lrc,text/plain" onChange={onLrcFile} type="file" />
            <div className="mt-3">
              <button onClick={loadSample} className="px-3 py-2 bg-white/5 rounded">Load sample LRC</button>
            </div>
            {audioError && <div className="mt-3 text-red-300">{audioError}</div>}
          </div>

          <div className="mt-4 text-sm text-white/70">Parsed lines: {lyrics.length}</div>
        </div>

        <div className="col-span-12 md:col-span-8 flex items-center">
          <div className="relative w-full h-[60vh] md:h-[65vh] flex items-center">
            <div
              className="absolute inset-0 -z-10 bg-center bg-cover opacity-30 filter blur-3xl scale-105"
              style={{ backgroundImage: `url(${coverUrl ?? "https://via.placeholder.com/1200/0b2746/000?text="})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#021425]/40 to-[#000000]/90 pointer-events-none" />
            <div className="relative w-full flex items-center justify-center">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {layerIndices.map((layer) => {
                  const depth = layer;
                  const opacity = Math.max(0, 0.65 - depth * 0.12);
                  const translateY = depth * CSS_VARS.layerSpacing;
                  const scale = 1 - depth * 0.02;
                  const blurPx = depth * CSS_VARS.layerBlur;
                  return (
                    <div
                      key={layer}
                      className="absolute left-1/2 -translate-x-1/2 w-full text-center select-none"
                      style={{
                        transform: `translateY(${translateY}px) scale(${scale}) translateX(-50%)`,
                        filter: `blur(${blurPx}px)`,
                        opacity,
                        transition: "all 420ms cubic-bezier(.2,.8,.2,1)",
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: isMobile ? CSS_VARS.lyricSizeMobile : CSS_VARS.lyricSizeDesktop,
                          lineHeight: "1.02em",
                          color: "rgba(255,255,255,0.9)",
                          textShadow: "0 6px 20px rgba(0,0,0,0.6)",
                        }}
                      >
                        {mainLyric}
                      </div>
                    </div>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={mainLyric || "empty"}
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.36 }}
                  className="relative z-10 text-center px-6"
                >
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: isMobile ? CSS_VARS.lyricSizeMobile * 1.2 : CSS_VARS.lyricSizeDesktop * 1.05,
                      lineHeight: "1.02em",
                      color: "#fff",
                      textShadow: "0 12px 40px rgba(0,0,0,0.65)",
                      letterSpacing: "-0.01em",
                    }}
                    className="max-w-4xl mx-auto"
                  >
                    {mainLyric || "No lyric loaded"}
                  </div>

                  {!isMobile && lyrics.length > 0 && (
                    <div className="mt-8 max-w-3xl mx-auto opacity-70 text-left text-gray-300">
                      {lyrics.slice(Math.max(0, currentIndex), Math.min(lyrics.length, currentIndex + 8)).map((l, i) => (
                        <div key={i} className={i === 0 ? "font-semibold text-white mb-1" : "text-gray-400 mb-1"}>
                          {l.text}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* mobile footer - uses same audio element, no duplicate refs */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-black/40 backdrop-blur-sm p-2 flex items-center justify-between">
        <div className="text-sm text-white/90 px-3">{fileName ?? "No audio"}</div>
        <div className="px-3">
          <button
            onClick={() => {
              const a = audioRef.current;
              if (!a) return;
              if (a.paused) a.play().catch(() => setAudioError("Playback blocked"));
              else a.pause();
            }}
            className="px-3 py-1 bg-white/5 rounded"
          >
            Play / Pause
          </button>
        </div>
      </div>

      <textarea style={{ display: "none" }} value={rawLrc} onChange={onPasteLrc} />
    </div>
  );
}
