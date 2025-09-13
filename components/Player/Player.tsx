"use client";
import React, { useEffect, useRef, useState } from "react";
import TimingCore, { Segment } from "./TimingCore";
import VirtualList, { VirtualListHandle } from "./VirtualList";
import WaveformEditor from "./WaveformEditor";
import { parseAnyToSegments } from "./parsers";
import { cacheSegments, loadSegmentsFromCache } from "../../lib/db";

export default function PlayerComponent() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timing = useRef(new TimingCore()).current;
  const listRef = useRef<VirtualListHandle | null>(null);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [offsetMs, setOffsetMs] = useState<number>(0);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    timing.setOffset(offsetMs);
  }, [offsetMs, timing]);

  useEffect(() => {
    function loop() {
      const a = audioRef.current;
      if (!a) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const playbackMs = Math.floor((a.currentTime || 0) * 1000);
      timing.pushDrift(performance.now() - playbackMs);
      const idx = timing.getCurrentSegmentIndex(playbackMs);
      if (idx !== currentIdx) {
        setCurrentIdx(idx);
        if (autoScroll && idx >= 0 && listRef.current) listRef.current.scrollToIndex(idx, "center");
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [segments, autoScroll, currentIdx, timing]);

  async function onAudioFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAudioFile(f);
    const url = URL.createObjectURL(f);
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.load();
    }
    try {
      const cached = await loadSegmentsFromCache(f.name);
      if (cached) {
        setSegments(cached);
        timing.setSegments(cached);
      }
    } catch {}
  }

  async function onLrcFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const segs = parseAnyToSegments(text, f.name.endsWith(".vtt") ? "vtt" : f.name.endsWith(".json") ? "json" : "lrc");
    for (let i = 0; i < segs.length - 1; i++) {
      if (!segs[i].end_ms || segs[i].end_ms <= segs[i].start_ms) segs[i].end_ms = segs[i + 1].start_ms - 1;
    }
    setSegments(segs);
    timing.setSegments(segs);
    if (audioFile) {
      try {
        await cacheSegments(audioFile.name, segs);
      } catch {}
    }
  }

  function onWaveSelection(startMs: number, endMs: number) {
    const seg: Segment = { id: `manual-${startMs}`, start_ms: Math.floor(startMs), end_ms: Math.floor(endMs), text: "Selected segment" };
    setSegments((s) => {
      const ns = [...s, seg].sort((a, b) => a.start_ms - b.start_ms);
      timing.setSegments(ns);
      return ns;
    });
  }

  return (
    <div className="flex gap-6 p-6">
      <div style={{ width: 380 }}>
        <div style={{ height: 380, borderRadius: 14, background: "#071226" }} />
        <audio ref={audioRef} controls className="w-full mt-4" />
        <div className="mt-3">
          <label>Upload audio</label>
          <input accept="audio/*" onChange={onAudioFileInput} type="file" />
        </div>
        <div className="mt-2">
          <label>Upload .lrc/.vtt/.json</label>
          <input accept=".lrc,.vtt,application/json,text/plain" onChange={onLrcFileInput} type="file" />
        </div>

        <div className="mt-4">
          <button onClick={() => setAutoScroll((v) => !v)}>{autoScroll ? "Pause Auto-Scroll" : "Resume Auto-Scroll"}</button>
        </div>

        <div className="mt-4">
          <label>Manual offset (ms)</label>
          <input value={offsetMs} onChange={(e) => setOffsetMs(parseInt(e.target.value || "0"))} type="number" />
        </div>

        <div className="mt-6">
          <WaveformEditor file={audioFile ?? undefined} onSelection={onWaveSelection} />
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ height: 640 }}>
          <VirtualList
            ref={listRef}
            items={segments}
            itemHeight={56}
            height={640}
            renderItem={(it: Segment, i: number, style) => {
              const isCurrent = i === currentIdx;
              return (
                <div
                  onClick={() => {
                    if (!audioRef.current) return;
                    audioRef.current.currentTime = it.start_ms / 1000;
                    audioRef.current.play().catch(() => {});
                  }}
                  style={{
                    padding: "8px 12px",
                    background: isCurrent ? "rgba(255,255,255,0.06)" : "transparent",
                    color: isCurrent ? "#fff" : "#cbd5e1",
                    ...style,
                  }}
                  role="listitem"
                >
                  <div style={{ fontWeight: isCurrent ? 700 : 500 }}>{it.text}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{msToTime(it.start_ms)}</div>
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}

function msToTime(ms: number) {
  if (!ms && ms !== 0) return "";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
