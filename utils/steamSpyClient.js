const STEAMSPY_BASE_URL =
  process.env.STEAMSPY_BASE_URL || "https://steamspy.com/api.php";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let top100In2WeeksCache = { data: null, ts: 0 };

async function steamSpyRequest(params = {}) {
  const qs = new URLSearchParams(params);
  const url = `${STEAMSPY_BASE_URL}?${qs.toString()}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Steam Spy request failed (${res.status}): ${text.slice(0, 300)}`
    );
  }

  return res.json();
}

function toTrendingList(payload) {
  if (!payload || typeof payload !== "object") return [];

  return Object.values(payload)
    .filter((entry) => entry && entry.appid && entry.appid !== 999999)
    .sort(
      (a, b) =>
        Number(b.average_2weeks || 0) - Number(a.average_2weeks || 0) ||
        Number(b.ccu || 0) - Number(a.ccu || 0)
    )
    .map((entry, index) => ({
      rank: index + 1,
      appid: entry.appid,
      name: entry.name,
      developer: entry.developer,
      publisher: entry.publisher,
      owners: entry.owners,
      average_2weeks: entry.average_2weeks,
      average_forever: entry.average_forever,
      median_2weeks: entry.median_2weeks,
      ccu: entry.ccu,
      price: entry.price,
      initialprice: entry.initialprice,
      discount: entry.discount,
      genre: entry.genre,
    }));
}

async function getTop100In2Weeks({ forceRefresh = false } = {}) {
  const isFresh =
    top100In2WeeksCache.data &&
    Date.now() - top100In2WeeksCache.ts < CACHE_TTL_MS;

  if (!forceRefresh && isFresh) {
    return top100In2WeeksCache.data;
  }

  const payload = await steamSpyRequest({ request: "top100in2weeks" });
  const list = toTrendingList(payload);

  top100In2WeeksCache = { data: list, ts: Date.now() };
  return list;
}

module.exports = {
  getTop100In2Weeks,
};
