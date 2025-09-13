"use client";
import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";

type ItemRender = (item: any, index: number, style: React.CSSProperties) => React.ReactNode;

type Props = {
  items: any[];
  itemHeight: number;
  height: number;
  renderItem: ItemRender;
  overscan?: number;
};

export type VirtualListHandle = {
  scrollToIndex: (i: number, align?: "center" | "start") => void;
};

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

const VirtualList = forwardRef(function VirtualList(props: Props, ref: React.ForwardedRef<VirtualListHandle>) {
  const { items, itemHeight, height, renderItem, overscan = 5 } = props;
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState<number>(0);

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex(i: number, align: "center" | "start" = "center") {
        const outer = outerRef.current;
        if (!outer) return;
        const maxScroll = Math.max(0, items.length * itemHeight - outer.clientHeight);
        const target = clamp(
          i * itemHeight - (align === "center" ? outer.clientHeight / 2 - itemHeight / 2 : 0),
          0,
          maxScroll
        );
        const start = outer.scrollTop;
        const delta = target - start;
        const dur = 340;
        const t0 = performance.now();
        function frame(t: number) {
          const p = clamp((t - t0) / dur, 0, 1);
          const ease = 1 - Math.cos((p * Math.PI) / 2);
          outer.scrollTop = start + delta * ease;
          if (p < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      },
    }),
    // no deps to avoid stale closure warnings; method reads latest outerRef and items on call
    []
  );

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const onScroll = () => setScrollTop(outer.scrollTop);
    outer.addEventListener("scroll", onScroll);
    setScrollTop(outer.scrollTop || 0);
    return () => outer.removeEventListener("scroll", onScroll);
  }, []);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(items.length - 1, Math.floor((scrollTop + height) / itemHeight) + overscan);
  const topPad = startIndex * itemHeight;
  const visible = items.slice(startIndex, endIndex + 1);

  return (
    <div style={{ height, overflow: "auto" }} ref={outerRef} role="list" aria-label="Lyrics list">
      <div style={{ position: "relative", height: items.length * itemHeight }}>
        <div style={{ position: "absolute", top: topPad, left: 0, right: 0 }}>
          {visible.map((it, i) => (
            <div key={startIndex + i} style={{ height: itemHeight }}>
              {renderItem(it, startIndex + i, { height: itemHeight })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default VirtualList;
