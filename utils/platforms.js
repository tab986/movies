// utils/platforms.js

const PLATFORM_SYNONYMS = new Map([
  ["steam", "pc steam"],
  ["pc steam", "pc steam"],

  // Ubisoft
  ["uplay", "pc ubisoft connect"],
  ["ubisoft", "pc ubisoft connect"],
  ["ubisoft connect", "pc ubisoft connect"],
  ["uplay pc", "pc ubisoft connect"],
  ["ubisoft connect pc", "pc ubisoft connect"],

  // EA
  ["origin", "ea app"],
  ["ea app", "ea app"],
  ["eaapp", "ea app"],

  // Battle.net
  ["battle.net", "pc battle.net"],
  ["battlenet", "pc battle.net"],
  ["battle net", "pc battle.net"],
  ["blizzard", "pc battle.net"],

  // Epic
  ["epic", "pc epic games"],
  ["epic games", "pc epic games"],
  ["epicgames", "pc epic games"],

  // GOG
  ["gog", "pc gog"],

  // Rockstar
  ["rockstar", "pc rockstar games"],
  ["rockstar games", "pc rockstar games"],
  ["rockstar launcher", "pc rockstar games"],
  ["social club", "pc rockstar games"],
  ["rockstar social club", "pc rockstar games"],

  // Mog Station (FFXIV)
  ["mog station", "pc mog station"],

  // Generic PC
  ["pc", "pc"],

  // PlayStation family
  ["playstation", "playstation"],
  ["playstation 4", "playstation"],
  ["playstation 3", "playstation"],
  ["ps", "playstation"],
  ["ps4", "playstation"],
  ["ps3", "playstation"],
  ["playstation network", "playstation"],
  ["psn", "playstation"],

  // Nintendo / eShop
  ["nintendo", "nintendo"],
  ["nintendo switch", "nintendo"],
  ["nintendo eshop", "nintendo"],
  ["eshop", "nintendo"],
  ["switch", "nintendo"],

  // Mobile & digital stores
  ["android", "android"],
  ["google play", "android"],
  ["play", "android"],
  ["play store", "android"],
  ["ios", "itunes"],
  ["itunes", "itunes"],
  ["itunes card", "itunes"],
  ["app store", "itunes"],
  ["app store & itunes", "itunes"],
  ["apple", "itunes"],

  // Misc / fallback
  ["other", "other"],

  // Xbox
  ["xbox one", "xbox one"],
  ["xbox series x|s", "xbox series x|s"],
  ["xbox series x", "xbox series x|s"],
  ["xbox series s", "xbox series x|s"],
  ["xbox 360", "xbox 360"],
]);

function normalizePlatform(raw) {
  if (!raw) return null;
  const key = String(raw).toLowerCase().trim();
  return PLATFORM_SYNONYMS.get(key) || key;
}

/**
 * Map canonical platform → ITAD shop IDs
 *
 * ⚠️ YOU MUST fill these IDs using GET /service/shops/v1 from ITAD.
 * Example:
 *   Steam shop id might be something like 1 (check their response).
 */
const PLATFORM_TO_ITAD_SHOPS = {
  "pc steam": [61],
  "pc epic games": [16],
  "pc gog": [35],
  "pc ubisoft connect": [62],
  "ea app": [52],
  "pc battle.net": [
    /* ... */
  ],
  "pc rockstar games": [
    /* ... */
  ],
  playstation: [
    /* PSN shop id(s) */
  ],
  "xbox one": [
    /* Microsoft Store id */
  ],
  "xbox series x|s": [
    /* Microsoft Store id */
  ],
  "xbox 360": [
    /* Microsoft Store id */
  ],
  nintendo: [
    /* Nintendo eShop id */
  ],
  android: [
    /* Google Play id */
  ],
  itunes: [
    /* Apple App Store id */
  ],
};

function getShopIdsForPlatform(platformRaw) {
  const normalized = normalizePlatform(platformRaw);
  if (!normalized) return null;
  return PLATFORM_TO_ITAD_SHOPS[normalized] || null;
}

module.exports = {
  PLATFORM_SYNONYMS,
  normalizePlatform,
  getShopIdsForPlatform,
};
