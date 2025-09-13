"use client";
import React, { useEffect, useRef, useState } from "react";

type Props = {
  file?: File | null;
  onSelection?: (startMs: number, endMs: number) => void;
};

export default function WaveformEditor({ file, onSelection }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioBufRef = useRef<AudioBuffer | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const selRef = useRef<{ a: number; b: number } | null>(null);
  const onSelectionRef = useRef<typeof onSelection | null>(onSelection);

  // keep latest onSelection in a ref to avoid reattaching listeners
  useEffect(() => {
    onSelectionRef.current = onSelection;
  }, [onSelection]);

  useEffect(() => {
    if (!file) {
      audioBufRef.current = null;
      setDuration(0);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const arr = reader.result as ArrayBuffer;
        const buf = await ctx.decodeAudioData(arr.slice(0));
        if (cancelled) return;
        audioBufRef.current = buf;
        setDuration(buf.duration * 1000);
        draw(buf);
      } catch (e) {
        console.warn("waveform decode", e);
      }
    };
    reader.readAsArrayBuffer(file);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  function draw(buf: AudioBuffer) {
    const canvas = canvasRef.current;
    if (!canvas || !buf) return;
    const ch = buf.numberOfChannels > 0 ? buf.getChannelData(0) : new Float32Array();
    const cssW = Math.max(300, canvas.clientWidth || 300);
    const cssH = Math.max(80, canvas.clientHeight || 80);
    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    const w = (canvas.width = Math.floor(cssW * dpr));
    const h = (canvas.height = Math.floor(cssH * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#071226";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2aa4d6";
    const step = Math.max(1, Math.floor(ch.length / w));
    for (let i = 0; i < w; i++) {
      let min = 1,
        max = -1;
      for (let j = 0; j < step; j++) {
        const idx = i * step + j;
        if (idx >= ch.length) break;
        const v = ch[idx];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const y1 = ((1 + min) / 2) * h;
      const y2 = ((1 + max) / 2) * h;
      ctx.fillRect(i, h - y2, 1, Math.max(1, y2 - y1));
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragging = false;

    function toMs(clientX: number) {
      const rect = canvas.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return audioBufRef.current ? audioBufRef.current.duration * 1000 * frac : 0;
    }

    function drawSelection() {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d");
      if (!ctx || !audioBufRef.current) return;
      draw(audioBufRef.current);
      if (!selRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
      const w = rect.width * dpr;
      const a = (selRef.current.a / (audioBufRef.current.duration * 1000)) * w;
      const b = (selRef.current.b / (audioBufRef.current.duration * 1000)) * w;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(Math.min(a, b), 0, Math.abs(b - a), canvas.height);
    }

    function onPointerDown(e: PointerEvent) {
      dragging = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      selRef.current = { a: toMs(e.clientX), b: toMs(e.clientX) };
      drawSelection();
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragging || !selRef.current) return;
      selRef.current.b = toMs(e.clientX);
      drawSelection();
    }
    function onPointerUp(e: PointerEvent) {
      if (!dragging || !selRef.current) return;
      dragging = false;
      selRef.current.b = toMs(e.clientX);
      const a = Math.min(selRef.current.a, selRef.current.b);
      const b = Math.max(selRef.current.a, selRef.current.b);
      onSelectionRef.current?.(a, b);
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // observe resize for redraw if available
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => audioBufRef.current && draw(audioBufRef.current)) : null;
    if (ro) ro.observe(canvas);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (ro) ro.disconnect();
    };
    // intentionally not including onSelectionRef in deps
  }, [/* no deps so handlers attach once */]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: 120, borderRadius: 8, display: "block" }} />;
}
