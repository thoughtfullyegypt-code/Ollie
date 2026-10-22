import type { CSSProperties } from "react";
/** An original little loaf, with a little good beside it. Editable SVG artwork. */
export default function BreadHeart({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={`bread-heart-art ${className}`}
      style={style}
      viewBox="0 0 150 106"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g
        stroke="#34372d"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M14 69C10 40 27 28 55 29c29-3 46 7 47 31l-2 25q-40 15-82 0Z"
          fill="#e8ca80"
        />
        <path d="M16 72q41 15 85-1v14q-43 16-83 0Z" fill="#d1aa65" />
        <path
          d="M30 39q3 7 1 16m17-20q5 8 3 18m19-16q5 8 3 17"
          stroke="#a47d43"
          strokeWidth="4"
        />
        <path d="M17 76q41 15 82-1" stroke="#b88e4f" strokeWidth="1.3" />
        <path
          d="M116 21c-16-15-32 7-9 24l13 9 11-12c19-22 0-37-15-21Z"
          fill="#c7543a"
        />
        <path d="m108 22 4 1" stroke="#f6d8aa" strokeWidth="3" />
        <path d="m111 68 4-3m9 12 4 1m-18 11 3 2" stroke="#b68c52" />
        <path
          d="m132 9 1-5m7 13 5-2M94 10l-3-4"
          stroke="#9aa985"
          strokeWidth="1.5"
        />
      </g>
    </svg>
  );
}
