// utils/currency.js
const axios = require("axios");

// ---------- caches ----------
const FX_TTL_MS = 60 * 60 * 1000; // 1 hour
const CC_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const fxCache = new Map(); // key: "IQD->EUR" -> { ts, rate }
const ccCache = new Map(); // key: "NL"      -> { ts, code: "EUR" }

// ---------- helpers ----------
function cacheGet(map, key, ttl) {
  const v = map.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > ttl) return null;
  return v.value;
}
function cacheSet(map, key, value) {
  map.set(key, { ts: Date.now(), value });
}

function pickClientIp(req) {
  // easy dev/test overrides
  const forced = (req.query?.ip || req.headers["x-debug-ip"] || "")
    .toString()
    .trim();
  if (forced) return forced;

  // x-forwarded-for (works with Postman/Reverse proxies)
  const xff = (req.headers["x-forwarded-for"] || "").toString();
  if (xff) return xff.split(",")[0].trim();

  // fallbacks
  return (
    req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || ""
  );
}

// ---------- geo: IP -> { countryCode, currency? } ----------
async function geolocateByIp(ip) {
  try {
    const privateIP =
      !ip ||
      ip === "::1" ||
      ip.startsWith("127.") ||
      ip.startsWith("10.") ||
      ip.startsWith("192.168.");
    if (privateIP) return { countryCode: "IQ", currency: "IQD" };

    const { data } = await axios.get(
      `https://ipwho.is/${encodeURIComponent(
        ip
      )}?fields=success,country_code,currency`,
      { timeout: 5000 }
    );

    if (data?.success === false) return { countryCode: "IQ", currency: "IQD" };

    return {
      countryCode: (data?.country_code || "IQ").toUpperCase(),
      currency: (data?.currency?.code || "").toUpperCase() || null, // may be null
    };
  } catch {
    return { countryCode: "IQ", currency: "IQD" };
  }
}

// ---------- country -> currency (REST Countries, cached) ----------
async function currencyForCountry(countryCode) {
  const cc = String(countryCode || "").toUpperCase();
  if (!cc) return null;

  const cached = cacheGet(ccCache, cc, CC_TTL_MS);
  if (cached) return cached;

  try {
    // returns: [{ currencies: { EUR: {...}, USD: {...} } }]
    const { data } = await axios.get(
      `https://restcountries.com/v3.1/alpha/${encodeURIComponent(
        cc
      )}?fields=currencies`,
      { timeout: 5000 }
    );
    const currencies = Array.isArray(data)
      ? data[0]?.currencies
      : data?.currencies;
    const code = currencies ? Object.keys(currencies)[0] : null; // pick first if multiple
    if (code) cacheSet(ccCache, cc, code);
    return code || null;
  } catch {
    return null;
  }
}

// ---------- FX: cross-rate via USD (cached) ----------
// Computes rate(IQD -> target) = (target/USD) / (IQD/USD)
// ---------- FX: robust IQD -> target with fallbacks ----------
// ---------- FX: robust IQD -> target using free sources (no keys) ----------
async function getRateIQDTo(targetCurrency) {
  const sym = targetCurrency.toUpperCase();
  if (sym === "IQD") return 1;

  const key = `IQD->${sym}`;
  const cached = cacheGet(fxCache, key, FX_TTL_MS);
  if (cached != null) return cached;

  // 1) Primary: Fawaz Ahmed's currency API via jsDelivr (pair endpoint)
  //   Docs/pattern: https://cdn.jsdelivr.net/gh/fawazahmed0/currency-api@1/latest/currencies/iqd/eur.json
  try {
    const url = `https://cdn.jsdelivr.net/gh/fawazahmed0/currency-api@1/latest/currencies/iqd/${encodeURIComponent(
      sym.toLowerCase()
    )}.json`;
    const { data } = await axios.get(url, { timeout: 8000 });
    // response shape: { date: "YYYY-MM-DD", eur: 0.00069 }
    const k = sym.toLowerCase();
    const rate1 = Number(data?.[k]);
    if (isFinite(rate1) && rate1 > 0) {
      cacheSet(fxCache, key, rate1);
      return rate1;
    }
  } catch {
    /* continue */
  }

  // 2) Fallback A: same dataset, cross-rate via USD
  //    IQD->SYM = (SYM/USD) / (IQD/USD)
  try {
    const [iqdUsd, symUsd] = await Promise.all([
      axios.get(
        "https://cdn.jsdelivr.net/gh/fawazahmed0/currency-api@1/latest/currencies/usd/iqd.json",
        { timeout: 8000 }
      ),
      axios.get(
        `https://cdn.jsdelivr.net/gh/fawazahmed0/currency-api@1/latest/currencies/usd/${encodeURIComponent(
          sym.toLowerCase()
        )}.json`,
        { timeout: 8000 }
      ),
    ]);
    const rIQD = Number(iqdUsd?.data?.iqd); // IQD per USD
    const rSYM = Number(symUsd?.data?.[sym.toLowerCase()]); // sym per USD
    if (isFinite(rIQD) && isFinite(rSYM) && rIQD !== 0) {
      const rate2 = rSYM / rIQD;
      cacheSet(fxCache, key, rate2);
      return rate2;
    }
  } catch {
    /* continue */
  }

  // 3) Fallback B: Open ER API (USD base) cross-rate
  try {
    const { data } = await axios.get("https://open.er-api.com/v6/latest/USD", {
      timeout: 8000,
    });
    // shape: { result:"success", rates:{ USD:1, EUR:0.92, IQD:1309.5, ... } }
    const rIQD = Number(data?.rates?.IQD);
    const rSYM = Number(data?.rates?.[sym]);
    if (isFinite(rIQD) && isFinite(rSYM) && rIQD !== 0) {
      const rate3 = rSYM / rIQD;
      cacheSet(fxCache, key, rate3);
      return rate3;
    }
  } catch {
    /* continue */
  }

  throw new Error(`Could not obtain rate for IQD->${sym} from free sources`);
}

// ---------- main: convert IQD using IP (with overrides) ----------
/**
 * Convert an IQD amount based on requester location (by IP).
 * Override with ?currency=USD or header x-currency: USD
 *
 * @param {import('express').Request} req
 * @param {number} iqdAmount
 * @returns {Promise<{ amountIQD:number, currency:string, rate:number, amount:number, formatted:string, countryCode:string, ipUsed:string }>}
 */
async function convertFromIQD(req, iqdAmount) {
  const override = (req.query?.currency || req.headers["x-currency"] || "")
    .toString()
    .trim()
    .toUpperCase();
  let target = /^[A-Z]{3}$/.test(override) ? override : null;
  console.log(target);
  console.log("0");
  const ip = pickClientIp(req);
  const geo = await geolocateByIp(ip);
  const countryCode = geo.countryCode;

  if (!target) {
    console.log(target);
    console.log("1");

    target = geo.currency || (await currencyForCountry(countryCode)) || "IQD";
  }

  // Short-circuit if we ended up with IQD
  if (target === "IQD") {
    console.log(target);

    return {
      amountIQD: iqdAmount,
      currency: "IQD",
      rate: 1,
      amount: iqdAmount,
      formatted: safeFormat(iqdAmount, "IQD"),
      countryCode,
      ipUsed: ip,
    };
  }

  // Convert using cross-rate; on failure, return IQD but include diagnostics.
  let rate;
  try {
    rate = await getRateIQDTo(target);
  } catch (e) {
    return {
      amountIQD: iqdAmount,
      currency: "IQD",
      rate: 1,
      amount: iqdAmount,
      formatted: safeFormat(iqdAmount, "IQD"),
      countryCode,
      ipUsed: ip,
      fxFallback: true,
      fxError: e.message,
      wantedCurrency: target,
    };
  }

  const amount = iqdAmount * rate;
  return {
    amountIQD: iqdAmount,
    currency: target,
    rate,
    amount,
    formatted: safeFormat(amount, target),
    countryCode,
    ipUsed: ip,
  };
}

function safeFormat(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

module.exports = { convertFromIQD };
