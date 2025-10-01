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
async function getRateIQDTo(targetCurrency) {
  const sym = targetCurrency.toUpperCase();
  if (sym === "IQD") return 1;

  const key = `IQD->${sym}`;
  const cached = cacheGet(fxCache, key, FX_TTL_MS);
  if (cached != null) return cached;

  const url = `https://api.exchangerate.host/latest?base=USD&symbols=IQD,${sym}`;
  const { data } = await axios.get(url, { timeout: 8000 });
  const rIQD = Number(data?.rates?.IQD); // IQD per USD
  const rSym = Number(data?.rates?.[sym]); // sym per USD

  if (!isFinite(rIQD) || !isFinite(rSym) || rIQD === 0) {
    throw new Error(`Missing cross rates for USD->{IQD, ${sym}}`);
  }

  const rate = rSym / rIQD;
  cacheSet(fxCache, key, rate);
  return rate;
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

  const ip = pickClientIp(req);
  const geo = await geolocateByIp(ip);
  const countryCode = geo.countryCode;

  if (!target) {
    target = geo.currency || (await currencyForCountry(countryCode)) || "IQD";
  }

  // Short-circuit if we ended up with IQD
  if (target === "IQD") {
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
