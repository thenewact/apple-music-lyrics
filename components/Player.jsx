"use client";
import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";

/**
 * Player.jsx
 * - Upload audio (.mp3 etc) + .lrc
 * - Parses LRC into [{time, text}]
 * - Syncs text with audio using RAF
 * - Large centered lyric + layered blurred repeats (Apple-like)
 */

export default function Player() {
  const [audioSrc, setAudioSrc] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [audioError, setAudioError] = useState(null);

  const [rawLrc, setRawLrc] = useState("");
  const [lyrics, setLyrics] = useState([]);
  const [index, setIndex] = useState(-1);

  const audioRef = useRef(null);
  const rafRef = useRef(null);
  const activeBlob = useRef(null);
  const currentIndexRef = useRef(-1);

  // parse LRC
  function parseLRC(text) {
    if (!text) return [];
    const lines = String(text).split(/\r?\n/);
    const entries = [];
    const re = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g;
    for (let raw of lines) {
      re.lastIndex = 0;
      let m;
      const times = [];
      while ((m = re.exec(raw)) !== null) {
        const mm = parseInt(m[1], 10);
        const ss = parseFloat(m[2]);
        times.push(mm * 60 + ss);
      }
      const txt = raw.replace(re, "").trim();
      for (const t of times) entries.push({ time: t, text: txt });
    }
    return entries.sort((a, b) => a.time - b.time);
  }

  // audio upload
  function onAudioFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAudioError(null);
    let url;
    try {
      url = URL.createObjectURL(f);
    } catch {
      setAudioError("Could not create object URL for file.");
      return;
    }
    const prev = activeBlob.current;
    activeBlob.current = url;
    setAudioSrc(url);
    setFileName(f.name || "track");
    if (prev && prev !== url) {
      try { URL.revokeObjectURL(prev); } catch {}
    }
    // attempt load; audio element reports real errors
    requestAnimationFrame(() => audioRef.current?.load());
  }

  // lrc upload
  function onLrcFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result || "");
      setRawLrc(text);
      setLyrics(parseLRC(text));
      setIndex(-1);
      currentIndexRef.current = -1;
    };
    r.readAsText(f);
  }

  function onPasteLrc(e) {
    const v = e.target.value;
    setRawLrc(v);
    setLyrics(parseLRC(v));
    setIndex(-1);
    currentIndexRef.current = -1;
  }

  // audio error handling
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    function err() {
      setAudioError("Playback error. File may be unsupported by this browser.");
      setAudioSrc(null);
      setFileName(null);
    }
    function can() {
      setAudioError(null);
    }
    a.addEventListener("error", err);
    a.addEventListener("canplay", can);
    return () => {
      a.removeEventListener("error", err);
      a.removeEventListener("canplay", can);
    };
  }, [audioRef.current]);

  // RAF sync
  useEffect(() => {
    if (!lyrics || lyrics.length === 0) return;
    let cancelled = false;
    function loop() {
      if (cancelled) return;
      const a = audioRef.current;
      if (!a) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const t = a.currentTime || 0;
      // binary search
      let low = 0, high = lyrics.length - 1, ans = -1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lyrics[mid].time <= t) {
          ans = mid; low = mid + 1;
        } else high = mid - 1;
      }
      if (ans !== currentIndexRef.current) {
        currentIndexRef.current = ans;
        setIndex(ans);
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelled = true; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [lyrics]);

  // sample LRC helper for testing
  function loadSample() {
    const sample = `[00:00.00] Sample demo lyric line\n[00:04.00] The next big line shows\n[00:08.50] Apple-like centered lyric\n[00:12.00] Another sample line`;
    setRawLrc(sample);
    setLyrics(parseLRC(sample));
  }

  // visual component
  function LyricVisual() {
    const center = (lyrics[index]?.text) || (lyrics[0]?.text) || "";
    const layers = 6;
    const stack = [];
    for (let i = 0; i < layers; i++) {
      stack.push({ text: lyrics[(index + i) < lyrics.length ? index + i : 0]?.text || center, i });
    }

    return (
      <div className="relative w-full flex-1 flex items-center justify-center px-8">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/60 pointer-events-none" />
        <div className="relative z-10 w-full max-w-4xl text-center">
          <div className="absolute inset-0 flex items-center justify-center -z-0 pointer-events-none">
            {stack.map(s => {
              const depth = s.i;
              const opacity = Math.max(0, 0.6 - depth * 0.11);
              const translate = depth * 24;
              const scale = 1 - depth * 0.03;
              const blur = depth * 3;
              return (
                <div key={depth} style={{
                  position: "absolute",
                  left: "50%",
                  transform: `translate(-50%, ${translate}px) scale(${scale})`,
                  filter: `blur(${blur}px)`,
                  opacity,
                  transition: "all 420ms ease",
                  width: "100%",
                  textAlign: "center"
                }}>
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
          <button onClick={loadSample} className="mt-2 px-3 py-2 rounded bg-white/5 text-sm">Load sample LRC</button>
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
              {lyrics.map((l, i) => <div key={i} className={i===index ? "text-white font-semibold" : "text-white/60"}>{l.text}</div>)}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}