import { cn } from '@/lib/utils';

interface PoweredByGoogleProps {
  className?: string;
  /** Use the light-on-dark asset (e.g. over photos). Default follows app color scheme. */
  onPhoto?: boolean;
}

const LOGO_CLASS = 'h-[18px] w-auto max-w-none';

export function PoweredByGoogle({ className, onPhoto = false }: PoweredByGoogleProps) {
  const cls = cn('inline-flex shrink-0 items-center', className);

  if (onPhoto) {
    return (
      <span className={cls} aria-label="Powered by Google">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/attribution/powered-by-google-dark.svg"
          alt=""
          className={LOGO_CLASS}
          width={120}
          height={14}
        />
      </span>
    );
  }

  return (
    <span className={cls} aria-label="Powered by Google">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/attribution/powered-by-google-light.svg"
        alt=""
        className={cn(LOGO_CLASS, 'dark:hidden')}
        width={120}
        height={14}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/attribution/powered-by-google-dark.svg"
        alt=""
        className={cn(LOGO_CLASS, 'hidden dark:block')}
        width={120}
        height={14}
      />
    </span>
  );
}
