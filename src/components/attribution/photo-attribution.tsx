'use client';

import type { AttributionMeta } from '@/db/schema/attachments';

interface PhotoAttributionProps {
  attribution: AttributionMeta | null | undefined;
  className?: string;
}

const baseClass = 'text-xs text-muted-foreground mt-1 line-clamp-1';

export function PhotoAttribution({ attribution, className }: PhotoAttributionProps) {
  if (!attribution) return null;

  const cls = className ? `${baseClass} ${className}` : baseClass;

  if (attribution.kind === 'google_places') {
    const authors = attribution.authorAttributions ?? [];
    if (authors.length === 0) {
      return <p className={cls}>Photo via Google</p>;
    }
    return (
      <p className={cls}>
        Photo by{' '}
        {authors.map((a, i) => (
          <span key={`${a.uri}-${i}`}>
            {i > 0 && ', '}
            <a
              href={a.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {a.displayName}
            </a>
          </span>
        ))}{' '}
        on Google
      </p>
    );
  }

  if (attribution.kind === 'wikimedia') {
    const { authorText, licenseShortName, licenseUrl, descriptionUrl } = attribution;
    const authorLabel = authorText.trim() || 'Public Domain';
    const licenseNode = licenseUrl ? (
      <a
        href={licenseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline"
      >
        {licenseShortName}
      </a>
    ) : (
      <span>{licenseShortName}</span>
    );
    return (
      <p className={cls}>
        {authorLabel}
        {licenseShortName && <> / {licenseNode}</>}
        {descriptionUrl && (
          <>
            {' '}
            (
            <a
              href={descriptionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Wikimedia
            </a>
            )
          </>
        )}
      </p>
    );
  }

  if (attribution.kind === 'pexels') {
    const { photographer, photographerUrl, photoUrl } = attribution;
    return (
      <p className={cls}>
        Photo by{' '}
        <a
          href={photographerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {photographer}
        </a>{' '}
        on{' '}
        <a
          href={photoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Pexels
        </a>
      </p>
    );
  }

  return null;
}
