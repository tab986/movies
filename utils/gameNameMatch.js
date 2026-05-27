/**
 * Normalize game titles for cross-source matching (Steam Spy ↔ catalog).
 * Strips platform/key suffixes and punctuation so names compare on core title only.
 */

const PLATFORM_SUFFIX_RE =
  /\s+(?:pc\s+)?(?:steam|epic\s+games?|ea\s+app|origin|uplay|ubisoft\s+connect|battle\.?net|gog|rockstar\s+games?|mog\s+station)(?:\s+(?:cd\s+key|key|activation\s+code))?$/i;

const CONSOLE_SUFFIX_RE =
  /\s+(?:xbox(?:\s+(?:one|360|series\s*x\|s|series\s*x|series\s*s))?|playstation\s*[345]|ps[345]|nintendo\s+switch)(?:\s*(?:\/|\|)\s*(?:xbox\s+one|xbox\s+series\s*x\|s|xbox\s+series\s*x|xbox\s+series\s*s|cd\s+key|key|activation\s+code))*$/i;

const KEY_SUFFIX_RE =
  /\s+(?:global\s+)?(?:cd\s+key|activation\s+code|digital\s+code|product\s+key|key)$/i;

function isDlcTitle(name) {
  return /\bdlc\b/i.test(String(name || ""));
}

function normalizeGameNameForMatch(name) {
  let s = String(name || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!s || isDlcTitle(s)) return "";

  // Drop edition / bundle tails after " - " when they look like add-ons.
  s = s.replace(/\s+-\s+(?:.*\bdlc\b.*)$/i, "");

  for (let i = 0; i < 4; i += 1) {
    const prev = s;
    s = s
      .replace(PLATFORM_SUFFIX_RE, "")
      .replace(CONSOLE_SUFFIX_RE, "")
      .replace(KEY_SUFFIX_RE, "")
      .replace(/\s+global$/i, "")
      .trim();
    if (s === prev) break;
  }

  return s
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCatalogNameIndex(products) {
  const index = new Map();

  for (const product of products) {
    const rawName =
      product.overrides?.name ||
      product.remote?.name ||
      product.remote?.originalName ||
      "";

    if (!rawName || product.remote?.isDLC === true || isDlcTitle(rawName)) {
      continue;
    }

    const key = normalizeGameNameForMatch(rawName);
    if (!key) continue;

    const existing = index.get(key);
    if (!existing) {
      index.set(key, product);
      continue;
    }

    // Prefer the shorter display name (usually the base game listing).
    const existingName =
      existing.overrides?.name ||
      existing.remote?.name ||
      existing.remote?.originalName ||
      "";
    if (rawName.length < existingName.length) {
      index.set(key, product);
    }
  }

  return index;
}

function findCatalogMatch(steamSpyName, catalogIndex) {
  const key = normalizeGameNameForMatch(steamSpyName);
  if (!key) return null;
  return catalogIndex.get(key) || null;
}

module.exports = {
  isDlcTitle,
  normalizeGameNameForMatch,
  buildCatalogNameIndex,
  findCatalogMatch,
};
