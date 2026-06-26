type LogomarkProps = {
  /** Pixel size of the (square) glyph. Defaults to 1em so it scales with font-size. */
  size?: number | string;
  className?: string;
};

/**
 * Driftmail logomark — an origami "send" plane (mail in motion / drift).
 * Renders the plane only, in `currentColor`, so it inherits the badge's text color.
 * The keel facet is drawn at reduced opacity for a folded, two-tone look.
 */
export function Logomark({ size = "1em", className }: LogomarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label="Driftmail"
      className={className}
    >
      {/* top wing */}
      <path d="M20.4 4 3.6 11.2l6.6 2.6L20.4 4Z" />
      {/* keel / fold */}
      <path d="M20.4 4 10.2 13.8l2.7 6.4L20.4 4Z" fillOpacity={0.72} />
    </svg>
  );
}
