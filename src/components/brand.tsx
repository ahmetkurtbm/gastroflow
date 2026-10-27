/** Logo: tabak ve akış çizgisi. Koyu ve açık zeminde aynı turuncu kare. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className="shrink-0">
      <rect width="512" height="512" rx="112" fill="#c2410c" />
      <circle cx="256" cy="256" r="150" fill="none" stroke="#fff" strokeWidth="36" />
      <path d="M168 276c30-34 58-34 88 0s58 34 88 0" fill="none" stroke="#fff" strokeWidth="36" strokeLinecap="round" />
    </svg>
  );
}

export function BrandName({ className = "" }: { className?: string }) {
  return <span className={`font-semibold tracking-tight ${className}`}>GastroFlow</span>;
}
