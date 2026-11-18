import React from "react";

/** Знак NeoCore — сетка точек 3×3. Декоративный (рядом всегда есть название). */
export default function BrandMark({ size = 30, color = "#3CC8B4" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true" focusable="false">
      <g fill={color}>
        <circle cx="7" cy="7" r="2.2" />
        <circle cx="17" cy="7" r="3.2" />
        <circle cx="27" cy="7" r="2.2" />
        <circle cx="7" cy="17" r="3.2" />
        <circle cx="17" cy="17" r="4.2" />
        <circle cx="27" cy="17" r="3.2" />
        <circle cx="7" cy="27" r="2.2" />
        <circle cx="17" cy="27" r="3.2" />
        <circle cx="27" cy="27" r="2.2" />
      </g>
    </svg>
  );
}
