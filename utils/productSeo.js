/**
 * SEO helpers for public product (game) JSON responses.
 * Optional absolute canonical: set STOREFRONT_PUBLIC_URL (no trailing slash required).
 */

function stripHtmlToText(s) {
  if (s == null || typeof s !== "string") return "";
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateMetaDescription(s, maxLen = 160) {
  const t = stripHtmlToText(s);
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen - 1).trimEnd();
  return cut ? `${cut}…` : "…";
}

function resolveCoverImageUrl({ overrides, remote }) {
  const cover = remote?.images?.cover;
  return (
    overrides?.images?.cover ||
    (cover && typeof cover === "object" ? cover.url : null) ||
    (typeof cover === "string" ? cover : null) ||
    null
  );
}

function buildGamePath(kinguinId) {
  return `/games/${kinguinId}`;
}

function resolveCanonicalUrl(path) {
  const base = process.env.STOREFRONT_PUBLIC_URL;
  if (!base || typeof base !== "string") return null;
  const trimmed = base.replace(/\/+$/, "");
  try {
    return new URL(path, `${trimmed}/`).href;
  } catch {
    return null;
  }
}

function toIso8601(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function buildProductSeoDetail({ productRow, kinguinId }) {
  const name = productRow.overrides?.name || productRow.remote?.name || "";
  const rawDesc =
    productRow.overrides?.description || productRow.remote?.description || "";
  const path = buildGamePath(kinguinId);
  return {
    title: name,
    description: truncateMetaDescription(rawDesc),
    image: resolveCoverImageUrl({
      overrides: productRow.overrides,
      remote: productRow.remote,
    }),
    robots: "index, follow",
    path,
    canonicalUrl: resolveCanonicalUrl(path),
  };
}

function buildProductSeoListItem({ productRow, kinguinId }) {
  const path = buildGamePath(kinguinId);
  return {
    lastModified: toIso8601(productRow.updatedAt),
    path,
  };
}

module.exports = {
  stripHtmlToText,
  truncateMetaDescription,
  resolveCoverImageUrl,
  buildGamePath,
  resolveCanonicalUrl,
  buildProductSeoDetail,
  buildProductSeoListItem,
};
