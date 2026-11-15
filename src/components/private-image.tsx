import type { ImgHTMLAttributes } from 'react'
import { privateBlobDisplayUrl } from '@/lib/photo-url'

type PrivateImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string }

/** Renders private Blob URLs through authenticated delivery and leaves other image URLs alone. */
export function PrivateImage({ src, ...props }: PrivateImageProps) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={privateBlobDisplayUrl(src)} {...props} />
}
