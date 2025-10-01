// utils/currency.js
const axios = require("axios");

// --- caches ---
const fxCache = {}; // "IQD->EUR" -> { ts, rate }
const ccCache = {}; // "NL" -> { ts, code: "EUR" }
const ONE_HOUR = 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

// pick client IP (works for Postman/Chrome behind proxies)
function pickClientIp(req) {
  const forced = (req.query?.ip || req.headers["x-debug-ip"] || "")
    .toString()
    .trim();
  if (forced) return forced;
  const xff = (req.headers["x-forwarded-for"] || "").toString();
  if (xff) return xff.split(",")[0].trim();
  return (
    req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || ""
  );
}

// 1) Geo: IP -> { countryCode, currency? } using ipwho.is
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
      countryCode: data?.country_code || "IQ",
      currency: (data?.currency?.code || "").toUpperCase() || null, // may be missing
    };
  } catch {
    return { countryCode: "IQ", currency: "IQD" };
  }
}

// 2) Country -> Currency via REST Countries (cached)
async function currencyForCountry(countryCode) {
  const cc = String(countryCode || "").toUpperCase();
  if (!cc) return null;

  const cached = ccCache[cc];
  if (cached && Date.now() - cached.ts < SEVEN_DAYS) return cached.code;

  try {
    // returns: { currencies: { EUR: {...}, ... } }
    const { data } = await axios.get(
      `https://restcountries.com/v3.1/alpha/${encodeURIComponent(
        cc
      )}?fields=currencies`,
      { timeout: 5000 }
    );
    const currencies = data?.[0]?.currencies || data?.currencies || null;
    const code = currencies ? Object.keys(currencies)[0] : null; // pick first if multiple
    if (code) ccCache[cc] = { ts: Date.now(), code };
    return code || null;
  } catch {
    return null;
  }
}

// 3) FX IQD -> target (cached)
function fxGet(key) {
  const e = fxCache[key];
  return e && Date.now() - e.ts < ONE_HOUR ? e.rate : null;
}
function fxSet(key, rate) {
  fxCache[key] = { ts: Date.now(), rate };
}
async function getRateIQDTo(targetCurrency) {
  const sym = targetCurrency.toUpperCase();
  const key = `IQD->${sym}`;
  const cached = fxGet(key);
  if (cached != null) return cached;

  const { data } = await axios.get(
    `https://api.exchangerate.host/latest?base=IQD&symbols=${sym}`,
    { timeout: 8000 }
  );
  const rate = data?.rates?.[sym];
  if (typeof rate !== "number" || !isFinite(rate)) {
    throw new Error(`No FX rate for IQD->${sym}`);
  }
  fxSet(key, rate);
  return rate;
}

// 4) Main: convert IQD amount using IP (or explicit currency override)
async function convertFromIQD(req, iqdAmount) {
  // explicit override wins
  const override = (req.query?.currency || req.headers["x-currency"] || "")
    .toString()
    .trim()
    .toUpperCase();
  let target = /^[A-Z]{3}$/.test(override) ? override : null;

  const ip = pickClientIp(req);
  const geo = await geolocateByIp(ip);

  const countryCode = geo.countryCode;
  if (!target) {
    // prefer provider currency when present, else resolve from country on-demand
    target = geo.currency || (await currencyForCountry(countryCode)) || "IQD";
  }

  if (target === "IQD") {
    return {
      amountIQD: iqdAmount,
      currency: "IQD",
      rate: 1,
      amount: iqdAmount,
      formatted: new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "IQD",
      }).format(iqdAmount),
      countryCode,
      ipUsed: ip,
    };
  }

  let rate = 1;
  try {
    rate = await getRateIQDTo(target);
  } catch {
    // if the rate provider doesn’t support an exotic, fall back to IQD
    target = "IQD";
  }

  const amount = iqdAmount * rate;
  let formatted = `${amount.toFixed(2)} ${target}`;
  try {
    formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: target,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {}

  return {
    amountIQD: iqdAmount,
    currency: target,
    rate,
    amount,
    formatted,
    countryCode,
    ipUsed: ip,
  };
}

module.exports = { convertFromIQD };
