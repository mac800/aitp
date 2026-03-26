export type UrlMetadata = {
  title: string | null;
  description: string | null;
  ogImage: string | null;
};

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const OG_IMAGE_RE =
  /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i;
const OG_DESCRIPTION_RE =
  /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i;
const META_DESCRIPTION_RE =
  /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i;

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function extract(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return normalizeText(match?.[1]);
}

function absoluteUrl(candidate: string | null, baseUrl: string): string | null {
  if (!candidate) return null;
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

export async function fetchUrlMetadata(url: string): Promise<UrlMetadata> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AITP-MVP/1.0)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return { title: null, description: null, ogImage: null };
    }

    const html = await response.text();
    const title = extract(html, TITLE_RE);
    const ogDescription = extract(html, OG_DESCRIPTION_RE);
    const metaDescription = extract(html, META_DESCRIPTION_RE);
    const ogImage = absoluteUrl(extract(html, OG_IMAGE_RE), url);

    return {
      title,
      description: ogDescription ?? metaDescription,
      ogImage,
    };
  } catch {
    return { title: null, description: null, ogImage: null };
  }
}
