'use client';

interface PoweredByGoogleProps {
  className?: string;
}

const baseClass =
  'inline-flex items-center text-[11px] font-medium text-[#5E5E5E] tracking-wide';

export function PoweredByGoogle({ className }: PoweredByGoogleProps) {
  const cls = className ? `${baseClass} ${className}` : baseClass;
  return (
    <span className={cls} aria-label="Powered by Google">
      Powered by{' '}
      <span className="ml-1 text-[#1F1F1F]">Google</span>
    </span>
  );
}
