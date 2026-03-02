const exp = require("express");

const dashboardRoutes = require("./routes/dashboardRoutes");
const orderRoutes = require("./routes/orderRoutes");
const productsRouter = require("./routes/productsRoutes");

// Import new routes for Kinguin sync and local catalog
const syncRoutes = require("./routes/syncRoutes");
const webhooks = require("./routes/webhooks");
const kinguinCacheRoutes = require("./routes/kinguinCacheRoutes");
const liveSRouter = require("./routes/liveS");

const errorControllers = require("./controllers/errorControllers");
const appError = require("./utils/appError");

const rateLimit = require("express-rate-limit");
const path = require("path");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = exp();

//security
const limiter = rateLimit({
  max: 10000,
  windowMs: 60 * 60 * 1000,
  message: "too many requests from this IP, try again later",
});

// Mount sync control endpoints under /api/v1/sync
// app.use('/api', limiter)
app.use(helmet());

app.use(bodyParser.json());
app.use(exp.json({ limit: "10Kb" }));

app.use(mongoSanitize());
app.use(xss());
app.use(hpp());


// !!!! the cros options depens on the cloud service this api will run on -- it may needs addtion settings
// Replace with your frontend's URL
app.use(
  cors({
    origin: "*", // Allow requests from any origin
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], // Allow all common methods
    credentials: false, // Cannot be true when origin is '*'
  })
);

// Trust only the first proxy (Render's reverse proxy)
app.set("trust proxy", 1);

// app.options('*', cors());
app.use(exp.static(path.join(__dirname, "public")));

// Lightweight probe endpoint for platform health checks.
app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/", (req, res) => {
  console.log("working");
  res.send({ jason: "working" });
});

const userRoutes = require("./routes/userRoutes");

// server.js
require("dotenv").config();
const express = require("express");
const axios = require("axios");

// Small in-memory cache (60s) to avoid hammering Cloudflare
let cache = { data: null, key: "", ts: 0 };
const cacheTTLms = 60 * 1000;

// Helper: format YYYY-MM-DD
const fmt = (d) => d.toISOString().slice(0, 10);

// GET /api/cloudflare/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
// Defaults to the last 7 days [from, to] inclusive (daily granularity)
app.get("/api/v1/cloudflare/stats", async (req, res) => {
  try {
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(Date.now() - 6 * 24 * 60 * 60 * 1000); // 7 days window

    const key = `${fmt(from)}_${fmt(to)}`;
    if (cache.data && cache.key === key && Date.now() - cache.ts < cacheTTLms) {
      return res.json(cache.data);
    }

    const query = `
      query($zone: string, $from: Date!, $to: Date!) {
        viewer {
          zones(filter: { zoneTag: $zone }) {
            httpRequests1dGroups(
              limit: 1000,
              orderBy: [date_ASC],
              filter: { date_geq: $from, date_leq: $to }
            ) {
              dimensions { date }
              sum {
                requests
                bytes
                threats
                cachedBytes
                cachedRequests
              }
              uniq { uniques }  # <-- unique visitors
            }
          }
        }
      }
    `;

    const resp = await axios.post(
      "https://api.cloudflare.com/client/v4/graphql",
      {
        query,
        variables: {
          zone: process.env.CF_ZONE_ID,
          from: fmt(from),
          to: fmt(to),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    // Basic sanity checks
    const groups =
      resp.data?.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];

    // Shape the response
    const timeseries = groups.map((g) => ({
      date: g.dimensions.date,
      requests: g.sum.requests,
      uniqueVisitors: g.uniq.uniques,
      bytes: g.sum.bytes,
      cachedRequests: g.sum.cachedRequests,
      cachedBytes: g.sum.cachedBytes,
      threats: g.sum.threats,
    }));

    const totals = timeseries.reduce(
      (acc, d) => {
        acc.requests += d.requests || 0;
        acc.uniqueVisitors += d.uniqueVisitors || 0;
        acc.bytes += d.bytes || 0;
        acc.cachedRequests += d.cachedRequests || 0;
        acc.cachedBytes += d.cachedBytes || 0;
        acc.threats += d.threats || 0;
        return acc;
      },
      {
        requests: 0,
        uniqueVisitors: 0,
        bytes: 0,
        cachedRequests: 0,
        cachedBytes: 0,
        threats: 0,
      }
    );

    const payload = {
      range: { from: fmt(from), to: fmt(to) },
      totals,
      timeseries,
    };

    cache = { data: payload, key, ts: Date.now() };
    res.json(payload);
  } catch (err) {
    const message =
      err.response?.data?.errors?.[0]?.message ||
      err.response?.data?.errors ||
      err.message;
    res
      .status(500)
      .json({ error: "Cloudflare query failed", details: message });
  }
});

// Optional: quick “last 24h” summary
app.get("/api/cloudflare/last24h", async (req, res) => {
  const to = new Date();
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
  req.query.from = fmt(from);
  req.query.to = fmt(to);
  return app._router.handle(req, res, require("express/lib/router/layer")());
});

app.use("/api/v1/sync", syncRoutes);

app.use(limiter);

app.use("/api/v1/users", userRoutes);

app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/products", productsRouter);
app.use("/api/v1", liveSRouter);

// Mount webhooks for Kinguin events
app.use("/webhooks", webhooks);
// Serve your local cached catalog under /api/v1/catalog
app.use("/api/v1/catalog", kinguinCacheRoutes);

app.all("*", (req, res, next) => {
  next(new appError(`can't find ${req.originalUrl}`, 404));
});

app.use(errorControllers);

module.exports = app;
