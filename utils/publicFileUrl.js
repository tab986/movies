function ensureHttps(url) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function trimSlashes(value) {
  return String(value || "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function isDomainLike(value) {
  return /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(String(value || "").trim());
}

function getPublicBaseUrl() {
  const raw = String(process.env.R2_BUCKET_PATH || "").trim();
  if (!raw) return null;
  return ensureHttps(raw).replace(/\/+$/, "");
}

function buildPublicFileUrl(value) {
  if (!value) return null;

  const input = String(value).trim();
  if (!input) return null;

  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  if (input.startsWith("//")) {
    return `https:${input}`;
  }

  if (isDomainLike(input)) {
    return ensureHttps(input);
  }

  const base = getPublicBaseUrl();
  if (!base) return input;

  const key = trimSlashes(input);
  return `${base}/${key}`;
}

module.exports = {
  buildPublicFileUrl,
};
