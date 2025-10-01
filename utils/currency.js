// utils/currency.js
const axios = require("axios");

// simple in-memory cache for FX rates
const fxCache = {
  // key: base->symbols (e.g., "IQD->USD,EUR"), value: { ts, rates }
};

const ONE_HOUR = 60 * 60 * 1000;

// Best-effort client IP extraction
function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) {
    // may contain "client, proxy1, proxy2"
    return fwd.split(",")[0].trim();
  }
  return (
    req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || null
  );
}

// Map some edge-case countries to a specific currency if provider is vague
function normalizeCurrency(countryCode, currencyCode) {
  if (!currencyCode) return null;
  // Example overrides if needed:
  // if (countryCode === "TR") return "TRY";
  // if (countryCode === "AE") return "AED";
  return currencyCode.toUpperCase();
}

// Fetch country + currency from IP (ipwho.is is generous & no key needed)
async function geolocateCurrencyByIp(ip) {
  try {
    if (
      !ip ||
      ip === "::1" ||
      ip.startsWith("127.") ||
      ip.startsWith("10.") ||
      ip.startsWith("192.168.")
    ) {
      return { countryCode: "IQ", currency: "IQD" }; // local/dev -> default to IQD
    }
    const { data } = await axios.get(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=country_code,currency`
    );
    const countryCode = data?.country_code || "IQ";
    const rawCurrency = data?.currency?.code || "IQD";
    return {
      countryCode,
      currency: normalizeCurrency(countryCode, rawCurrency) || "IQD",
    };
  } catch {
    return { countryCode: "IQ", currency: "IQD" }; // safe fallback
  }
}

// Fetch FX rate IQD -> target with cache
async function getRateIQDTo(targetCurrency) {
  const base = "IQD";
  const symbols = targetCurrency.toUpperCase();
  const key = `${base}->${symbols}`;

  const cached = fxCache[key];
  const now = Date.now();
  if (cached && now - cached.ts < ONE_HOUR) {
    return cached.rates[symbols];
  }

  const url = `https://api.exchangerate.host/latest?base=${base}&symbols=${symbols}`;
  const { data } = await axios.get(url, { timeout: 8000 });
  const rate = data?.rates?.[symbols];
  if (typeof rate !== "number" || !isFinite(rate)) {
    throw new Error(`No FX rate for ${base}->${symbols}`);
  }
  fxCache[key] = { ts: now, rates: data.rates };
  return rate;
}

/**
 * Convert an IQD price to the user's currency inferred from IP.
 * Allows explicit override via req.query.currency or req.headers['x-currency'].
 *
 * @param {import('express').Request} req
 * @param {number} iqdAmount - amount in IQD
 * @returns {Promise<{ amountIQD:number, currency:string, rate:number, amount:number, formatted:string, countryCode:string }>}
 */
async function convertFromIQD(req, iqdAmount) {
  // 1) target currency override (beats geo)
  const override = (req.query?.currency || req.headers["x-currency"] || "")
    .toString()
    .trim()
    .toUpperCase();
  let targetCurrency =
    override && /^[A-Z]{3}$/.test(override) ? override : null;

  // 2) if no override, geolocate by IP
  let countryCode = "IQ";
  if (!targetCurrency) {
    const ip = getClientIp(req);
    const geo = await geolocateCurrencyByIp(ip);
    countryCode = geo.countryCode || "IQ";
    targetCurrency = geo.currency || "IQD";
  }

  // 3) if target is IQD, short-circuit
  if (targetCurrency === "IQD") {
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
    };
  }

  // 4) fetch FX and convert
  let rate = 1;
  try {
    rate = await getRateIQDTo(targetCurrency);
  } catch {
    // fall back to IQD if rate missing
    targetCurrency = "IQD";
    rate = 1;
  }

  const converted = iqdAmount * rate;

  // 5) format nicely for the user's locale (let runtime pick)
  let formatted = `${converted.toFixed(2)} ${targetCurrency}`;
  try {
    formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: targetCurrency,
      maximumFractionDigits: 2,
    }).format(converted);
  } catch {
    // some exotic currencies might not be supported by the Intl runtime;
    // keep the simple fallback string
  }

  return {
    amountIQD: iqdAmount,
    currency: targetCurrency,
    rate,
    amount: converted,
    formatted,
    countryCode,
  };
}

module.exports = { convertFromIQD };
