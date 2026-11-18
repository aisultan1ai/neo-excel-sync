import React, { useEffect, useRef } from "react";

/**
 * Декоративное поле точек «волны»: размер и яркость точек задают бегущие волны,
 * возле курсора расходятся круги. Только декор (aria-hidden, без событий).
 *
 * variant: "dark"  — светлые точки на тёмном фоне (экран входа)
 *          "light" — бирюзово-серые точки на светлом (шапки страниц)
 * При prefers-reduced-motion рисуется один неподвижный кадр.
 * Когда вкладка скрыта, браузер сам останавливает requestAnimationFrame.
 */
const COLORS = {
  dark:  { rgb: "150,196,201", base: 0.06, range: 0.8 },
  light: { rgb: "46,118,126",  base: 0.03, range: 0.34 },
  medium: { rgb: "20,120,116", base: 0.06, range: 0.5 },
  mid:   { rgb: "214,240,236", base: 0.05, range: 0.5 },   // шапки разделов: светлые точки на среднем тоне
};

export default function DotField({ variant = "light", spacing = 8, speed = 1, focusX = 0.75, focusY = 0.3, className, style }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const host = el.parentElement;
    const ctx = el.getContext("2d");
    if (!ctx || !host) return undefined;

    const palette = COLORS[variant] || COLORS.light;
    const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const BUCKETS = 10;
    const fills = Array.from({ length: BUCKETS }, (_, i) =>
      `rgba(${palette.rgb},${(palette.base + palette.range * (i + 0.5) / BUCKETS).toFixed(3)})`);

    let raf = 0;
    let alive = true;
    let w = 1, h = 1, dpr = 1;
    let mx = -9999, my = -9999;

    const draw = (now) => {
      if (!alive) return;
      const t = (reduce ? 4000 : now || 0) * 0.001 * speed;
      const step = spacing;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const paths = Array.from({ length: BUCKETS }, () => new Path2D());
      const cx = w * focusX, cy = h * focusY;
      const ring = Math.max(120, Math.min(200, h * 0.8));
      const ring2 = ring * ring;
      for (let y = step / 2; y < h; y += step) {
        for (let x = step / 2; x < w; x += step) {
          let v = Math.sin(x * 0.0065 + t * 0.9) * Math.cos(y * 0.011 - t * 0.6)
            + Math.sin((x * 0.7 + y) * 0.0045 - t * 0.5)
            + 0.6 * Math.sin(Math.hypot(x - cx, y - cy) * 0.013 - t * 1.1);
          v = (v + 2.6) / 5.2;
          const dx = x - mx, dy = y - my, d2 = dx * dx + dy * dy;
          if (d2 < ring2) {
            const d = Math.sqrt(d2);
            v += (1 - d / ring) * 0.45 * (0.6 + 0.4 * Math.sin(d * 0.085 - t * 6));
          }
          v = v < 0 ? 0 : v > 1 ? 1 : v;
          const r = 0.3 + v * v * step * 0.42;
          const b = Math.min(BUCKETS - 1, Math.floor(v * BUCKETS));
          paths[b].moveTo(x + r, y);
          paths[b].arc(x, y, r, 0, Math.PI * 2);
        }
      }
      for (let i = 0; i < BUCKETS; i++) {
        ctx.fillStyle = fills[i];
        ctx.fill(paths[i]);
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    const fit = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, host.clientWidth);
      h = Math.max(1, host.clientHeight);
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      if (reduce) draw(0);
    };

    // курсор отслеживаем на окне: поле лежит под контентом и само событий не получает
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < -50 || y < -50 || x > r.width + 50 || y > r.height + 50) { mx = -9999; my = -9999; return; }
      mx = x; my = y;
    };
    const onLeave = () => { mx = -9999; my = -9999; };

    fit();
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(host);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    if (!reduce) raf = requestAnimationFrame(draw);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [variant, spacing, speed, focusX, focusY]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none", ...style }}
    />
  );
}
