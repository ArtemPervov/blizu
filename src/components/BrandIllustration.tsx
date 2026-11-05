export type IllustrationKind =
  | "search"
  | "orders"
  | "favorites"
  | "conversation"
  | "route";

export function BrandSpark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`brand-spark ${className}`}
      width="24"
      height="24"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 3v26M4.75 9.5l22.5 13M4.75 22.5l22.5-13"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BrandIllustration({
  kind = "search",
  className = "",
}: {
  kind?: IllustrationKind;
  className?: string;
}) {
  return (
    <svg
      className={`brand-illustration ${className}`}
      viewBox="0 0 220 148"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse
        cx="108"
        cy="88"
        rx="78"
        ry="47"
        fill="var(--illustration-wash, #e8eee5)"
      />
      <path
        d="M20 127c30-20 39 12 74-4s42-9 56-1 33 4 49-8"
        stroke="currentColor"
        strokeOpacity=".22"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <g
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === "search" ? (
          <>
            <path d="M51 101V70l25-19 25 19v14M45 73l31-24 25 19M65 102V85h15v17" />
            <path
              d="M105 63V48l18-12 19 12v14M100 51l23-17 25 17"
              opacity=".55"
            />
            <circle cx="129" cy="88" r="24" fill="var(--canvas)" />
            <circle cx="129" cy="88" r="18" strokeOpacity=".25" />
            <path d="m147 106 21 21" strokeWidth="4" />
            <path d="m121 89 5 5 10-11" />
          </>
        ) : kind === "orders" ? (
          <>
            <path
              d="m66 69 42-21 43 21v46l-43 21-42-21Z"
              fill="var(--canvas)"
            />
            <path d="m66 69 42 21 43-21M108 90v46M87 59l44 21v16l-12 6V85L77 64" />
            <path d="m77 103 15 7M77 110l10 5" opacity=".4" />
            <path
              d="M147 43c6-15 22-19 26-15-1 14-14 24-26 15Zm0 0-8 8"
              stroke="#9a825c"
            />
          </>
        ) : kind === "favorites" ? (
          <>
            <rect
              x="60"
              y="48"
              width="77"
              height="64"
              rx="7"
              transform="rotate(-12 60 48)"
              strokeOpacity=".35"
            />
            <rect
              x="78"
              y="49"
              width="82"
              height="70"
              rx="8"
              fill="var(--canvas)"
            />
            <path
              d="M119 96c-5-4-20-13-20-23 0-11 14-15 20-5 6-10 20-6 20 5 0 10-15 19-20 23Z"
              fill="#d5e6df"
            />
            <path d="M91 108h24" strokeOpacity=".4" />
          </>
        ) : kind === "conversation" ? (
          <>
            <path
              d="M61 54h77a10 10 0 0 1 10 10v35a10 10 0 0 1-10 10H89l-19 13v-13h-9a10 10 0 0 1-10-10V64a10 10 0 0 1 10-10Z"
              fill="var(--canvas)"
            />
            <path d="M95 37h57a10 10 0 0 1 10 10v29l12 10h-12" opacity=".4" />
            <path d="M70 74h51M70 88h32" strokeOpacity=".55" />
            <circle cx="132" cy="91" r="3" fill="currentColor" stroke="none" />
          </>
        ) : (
          <>
            <path
              d="M43 104c18-18 39 9 54-8s-9-31 8-43 32 21 50 7"
              strokeDasharray="3 6"
            />
            <path d="m39 105-9-13a12 12 0 1 1 20 0Z" fill="var(--canvas)" />
            <circle cx="40" cy="86" r="3" />
            <path d="m166 70-13-19a17 17 0 1 1 28 0Z" fill="var(--canvas)" />
            <circle cx="167" cy="42" r="5" />
            <path
              d="m130 111 13-10 13 10v17h-26ZM140 128v-10h6v10"
              opacity=".55"
            />
          </>
        )}
        <path
          d="M177 83v14m-6-10 12 6m-12 0 12-6"
          stroke="#aa8b5c"
          strokeWidth="2.5"
        />
        <path d="M42 44h7m-3.5-3.5v7" strokeOpacity=".4" />
      </g>
    </svg>
  );
}
