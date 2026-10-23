import type { ImageLoaderProps } from 'next/image';

type Meta = Record<string, { xs?: string; md?: string; lg?: string; lowResUrl?: string; blurDataURL?: string }> | undefined;

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find(Boolean);
}

export function getMetaForUrl(metadata: Meta, url: string | undefined | null) {
  if (!url || !metadata || typeof metadata !== 'object') return undefined;
  if (metadata[url]) return metadata[url];
  const urlBase = url.split('/').pop()?.split('?')[0];
  if (urlBase) {
    const matches = Object.entries(metadata).filter(([k]) => {
      const kBase = k.split('/').pop()?.split('?')[0];
      return kBase === urlBase;
    });
    if (matches.length === 1) return matches[0][1];
  }
  return undefined;
}

export function getOptimizedImageUrl(
  metadata: Meta,
  url: string | undefined | null,
  targetSize: 'xs' | 'md' | 'lg' | 'lowResUrl' = 'md'
): string {
  if (!url) return '/placeholder.png';
  if (url.toLowerCase().endsWith('.mp4')) return url;

  const m = getMetaForUrl(metadata, url);
  if (m) {
    if (targetSize === 'xs' || targetSize === 'lowResUrl') {
      return m.lowResUrl || m.xs || m.md || m.lg || url;
    }
    if (targetSize === 'md') {
      return m.md || m.lg || m.xs || m.lowResUrl || url;
    }
    if (targetSize === 'lg') {
      return m.lg || m.md || m.xs || m.lowResUrl || url;
    }
  }

  // If already an optimized webp variant or svg, keep it
  if (url.endsWith('.webp') || url.endsWith('.svg')) return url;

  return url;
}

export function getOptimizedSrcSet(
  metadata: Meta,
  url: string | undefined | null
): string | undefined {
  if (!url || url.toLowerCase().endsWith('.mp4')) return undefined;
  const m = getMetaForUrl(metadata, url);
  if (!m) return undefined;

  const parts: string[] = [];
  if (m.xs) parts.push(`${m.xs} 640w`);
  if (m.md) parts.push(`${m.md} 828w`);
  if (m.lg) parts.push(`${m.lg} 1080w`);

  return parts.length > 0 ? parts.join(', ') : undefined;
}

export function makeVariantLoader(metadata: Meta) {
  return ({ src, width }: ImageLoaderProps): string => {
    const m = getMetaForUrl(metadata, src);
    if (!m) return src;

    const selected = firstDefined(
      width <= 420 ? m.lowResUrl : undefined,
      width <= 640 ? m.xs : undefined,
      width <= 828 ? m.md : undefined,
      m.lg,
      m.md,
      m.xs,
      m.lowResUrl
    );

    return selected || src;
  };
}

export function hasVariants(metadata: Meta, url: string): boolean {
  const m = getMetaForUrl(metadata, url);
  return !!(m?.lowResUrl || m?.xs || m?.md || m?.lg);
}
