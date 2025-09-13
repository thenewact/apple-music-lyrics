"use client";
import React, { useEffect, useRef, useState } from "react";
import TimingCore, { Segment } from "./TimingCore";
import { FixedSizeList } from "react-window";

type Props = { initialSegments?: Segment[] };

export default function Player({ initialSegments = [] }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // listRef typed as any to avoid react-window instance typing friction
  const listRef = useRef<any>(null);

  const timing = useRef(new TimingCore()).current;

  const [segments, setSegments] = useState<Segment[]>(initialSegments);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [rms, setRms] = useState<number>(0);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    timing.setSegments(initialSegments);
    setSegments(initialSegments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSegments]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      sourceRef.current = audioCtxRef.current.createMediaElementSource(audio);
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioCtxRef.current.destination);
    }
    return () => {
      // keep audio context around for subsequent plays
    };
  }, []);

  useEffect(() => {
    function loop() {
      const audio = audioRef.current;
      if (!audio) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const playbackMs = Math.floor((audio.currentTime || 0) * 1000);
      const drift = performance.now() - playbackMs;
      timing.pushDrift(drift);
      const segIdx = timing.getCurrentSegmentIndex(playbackMs);
      if (segIdx !== currentIdx) {
        setCurrentIdx(segIdx);
        if (autoScroll && listRef.current && segIdx >= 0) {
          // react-window instance exposes scrollToItem
          try {
            listRef.current.scrollToItem(segIdx, "center");
          } catch {
            // fallback: set scrollTop manually if needed
            const outer = listRef.current && listRef.current._outerRef;
            if (outer && typeof outer.scrollTo === "function") {
              outer.scrollTo({ top: segIdx * 56 - outer.clientHeight / 2, behavior: "smooth" });
            }
          }
        }
      }

      const analyser = analyserRef.current;
      if (analyser) {
        const arr = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(arr);
        let sum = 0;
        for (let v of arr) {
          const x = (v - 128) / 128;
          sum += x * x;
        }
        const _rms = Math.sqrt(sum / arr.length);
        setRms((prev) => prev * 0.85 + _rms * 0.15);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // depend on segments and autoScroll only
  }, [segments, autoScroll, currentIdx, timing]);

  function loadSegments(newSegments: Segment[]) {
    timing.setSegments(newSegments);
    setSegments(newSegments);
    setCurrentIdx(-1);
  }

  function onClickLine(i: number) {
    const seg = segments[i];
    if (!seg) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seg.start_ms / 1000;
    audio.play().catch(() => {});
    setCurrentIdx(i);
    timing.pushDrift(0);
  }

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const s = segments[index];
    const isCurrent = index === currentIdx;
    return (
      <div
        style={style}
        onClick={() => onClickLine(index)}
        className={`px-3 py-2 ${isCurrent ? "bg-white/6 text-white font-semibold" : "text-white/60"}`}
        role="listitem"
      >
        {s?.words?.length ? (
          s.words.map((w, wi) => {
            const audio = audioRef.current;
            const active =
              isCurrent &&
              audio &&
              audio.currentTime * 1000 >= w.start_ms &&
              audio.currentTime * 1000 <= w.end_ms;
            return (
              <span key={wi} style={{ paddingRight: 6, color: active ? "#fff" : "#ddd", transition: "color .08s" }}>
                {w.text}
              </span>
            );
          })
        ) : (
          <span>{s?.text}</span>
        )}
      </div>
    );
  };

  return (
    <div className="flex gap-6">
      <div style={{ width: 360 }}>
        <div style={{ height: 360, background: "#0b2746", borderRadius: 14 }} />
        <audio ref={audioRef} controls className="w-full mt-4" />
        <div className="mt-3 text-sm text-slate-300">RMS: {rms.toFixed(3)}</div>
        <div className="mt-2 flex gap-2">
          <button onClick={() => setAutoScroll((v) => !v)}>{autoScroll ? "Pause Auto-Scroll" : "Resume Auto-Scroll"}</button>
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <FixedSizeList
          height={560}
          itemCount={segments.length}
          itemSize={56}
          width={"100%"}
          ref={(r) => {
            listRef.current = r;
          }}
          role="list"
        >
          {Row}
        </FixedSizeList>
      </div>
    </div>
  );
}
