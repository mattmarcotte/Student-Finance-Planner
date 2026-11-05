import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Buffer home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M5 16V9m7 7V5m7 11v-4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </span>
      buffer<span className="brand-dot">.</span>
    </Link>
  );
}
