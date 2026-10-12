import { cn } from '@/lib/utils';

interface PoweredByGoogleProps {
  className?: string;
  /** Light wordmark for dark photos. Default follows the app color scheme. */
  onPhoto?: boolean;
  /** Dark wordmark for a fixed light chip. Ignores the app color scheme. */
  onLightSurface?: boolean;
}

const LOGO_CLASS = 'h-[18px] w-auto max-w-none';
const LIGHT_LOGO = '/attribution/powered-by-google-light.svg';
const DARK_LOGO = '/attribution/powered-by-google-dark.svg';

function Logo({ src, className }: { src: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={cn(LOGO_CLASS, className)} width={120} height={14} />
  );
}

export function PoweredByGoogle({
  className,
  onPhoto = false,
  onLightSurface = false,
}: PoweredByGoogleProps) {
  const cls = cn('inline-flex shrink-0 items-center', className);

  if (onLightSurface || onPhoto) {
    return (
      <span className={cls} aria-label="Powered by Google">
        <Logo
          src={onLightSurface ? LIGHT_LOGO : DARK_LOGO}
          className={onPhoto ? 'max-w-full object-contain object-left' : undefined}
        />
      </span>
    );
  }

  return (
    <span className={cls} aria-label="Powered by Google">
      <Logo src={LIGHT_LOGO} className="dark:hidden" />
      <Logo src={DARK_LOGO} className="hidden dark:block" />
    </span>
  );
}
