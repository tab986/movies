const ITAD_BASE_URL =
  process.env.ITAD_BASE_URL || "https://api.isthereanydeal.com";
const ITAD_API_KEY = process.env.ITAD_API_KEY;

const DEFAULT_COUNTRY = process.env.ITAD_DEFAULT_COUNTRY || "US";
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 500;

function buildQuery(params = {}) {
  const qs = new URLSearchParams();

  if (ITAD_API_KEY) qs.set("key", ITAD_API_KEY);

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;

    if (Array.isArray(v)) {
      qs.set(k, v.join(","));
    } else {
      qs.set(k, String(v));
    }
  }

  return qs.toString();
}

async function itadRequest(path, { method = "GET", params, body } = {}) {
  const query = buildQuery(params);
  const url = query
    ? `${ITAD_BASE_URL}${path}?${query}`
    : `${ITAD_BASE_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `ITAD ${method} ${path} ${res.status}: ${text.slice(0, 300)}`
    );
  }

  return res.json();
}

async function lookupGameIdsByTitle(titles) {
  if (!Array.isArray(titles) || titles.length === 0) {
    throw new Error("lookupGameIdsByTitle: titles[] is required");
  }

  return itadRequest("/lookup/id/title/v1", {
    method: "POST",
    params: {},
    body: titles,
  });
}

async function getPricesByGameIds(gameIds, options = {}) {
  if (!Array.isArray(gameIds) || gameIds.length === 0) {
    throw new Error("getPricesByGameIds: gameIds[] is required");
  }

  const {
    country = DEFAULT_COUNTRY,
    shopIds,
    deals,
    vouchers,
    capacity,
  } = options;

  const params = { country };

  if (Array.isArray(shopIds) && shopIds.length > 0) {
    params.shops = shopIds;
  }
  if (typeof deals === "boolean") params.deals = deals;
  if (typeof vouchers === "boolean") params.vouchers = vouchers;
  if (typeof capacity === "number") params.capacity = capacity;

  return itadRequest("/games/prices/v3", {
    method: "POST",
    params,
    body: gameIds,
  });
}

async function getOfficialDealForTitle(title, { country, shopIds } = {}) {
  if (!title) return null;

  const lookup = await lookupGameIdsByTitle([title]);
  const gameId = lookup[title] || Object.values(lookup).find(Boolean);

  if (!gameId) {
    return null;
  }

  const [priceEntry] = await getPricesByGameIds([gameId], {
    country: country || DEFAULT_COUNTRY,
    shopIds,
  });

  if (
    !priceEntry ||
    !Array.isArray(priceEntry.deals) ||
    priceEntry.deals.length === 0
  ) {
    return null;
  }

  let deals = priceEntry.deals;

  if (Array.isArray(shopIds) && shopIds.length > 0) {
    const set = new Set(shopIds);
    deals = deals.filter((d) => set.has(d.shop.id));
    if (deals.length === 0) return null;
  }

  deals.sort((a, b) => a.price.amount - b.price.amount);
  const best = deals[0];

  if (!best || !best.price || !best.regular) return null;

  return {
    itadGameId: gameId,
    shopId: best.shop.id,
    shopName: best.shop.name,
    url: best.url,
    country: country || DEFAULT_COUNTRY,
    currency: best.price.currency,
    priceAmount: best.price.amount,
    regularAmount: best.regular.amount,
    cut: best.cut,
  };
}

function normalizeOffset(rawOffset) {
  const value = Number(rawOffset);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function normalizeLimit(rawLimit) {
  const value = Number(rawLimit);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(MAX_LIST_LIMIT, Math.floor(value));
}

async function getMostPopularGames(options = {}) {
  const offset = normalizeOffset(options.offset);
  const limit = normalizeLimit(options.limit);

  const results = await itadRequest("/stats/most-popular/v1", {
    method: "GET",
    params: { offset, limit },
  });

  return {
    offset,
    limit,
    results: Array.isArray(results) ? results : [],
  };
}

module.exports = {
  lookupGameIdsByTitle,
  getPricesByGameIds,
  getOfficialDealForTitle,
  getMostPopularGames,
};
