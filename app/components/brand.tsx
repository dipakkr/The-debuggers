/**
 * Mastercard interlocking-circles mark, drawn as inline SVG.
 * The overlap is the brand's own interlock colour (#FF5F00) rather than a
 * blend mode, so it renders identically in every theme and in print.
 */
export function MastercardMark({ size = 28 }: { size?: number }) {
  const h = size;
  const w = Math.round(size * 1.62);
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 152 94"
      role="img"
      aria-label="Mastercard"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <circle cx="47" cy="47" r="47" fill="#EB001B" />
      <circle cx="105" cy="47" r="47" fill="#F79E1B" />
      <path
        d="M76 9.6a46.9 46.9 0 0 0 0 74.8 46.9 46.9 0 0 0 0-74.8Z"
        fill="#FF5F00"
      />
    </svg>
  );
}

export function StatusDot({ tone }: { tone: "allow" | "review" | "block" | "muted" }) {
  const fill = { allow: "var(--allow)", review: "var(--review)", block: "var(--block)", muted: "var(--faint)" }[tone];
  return <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: fill, flexShrink: 0 }} />;
}
