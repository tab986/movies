require("dotenv").config({ path: process.env.DOTENV_PATH || "./config.env" });

const { Op } = require("sequelize");
const {
  KinguinProduct,
  Order,
  Users,
  Coupon,
  SyncState,
  SyncProfile,
  sequelize,
} = require("../post-models");

const DEFAULT_BATCH_SIZE = 1000;

function safeBatchSize(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
  return Math.floor(parsed);
}

function isEnabled() {
  return String(process.env.MONGO_IMPORT_ENABLED || "").toLowerCase() === "true";
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumberOrDefault(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function emptySummary() {
  return {
    scanned: 0,
    inserted: 0,
    skippedExisting: 0,
    updated: 0,
    failed: 0,
  };
}

async function scanAndNormalizeModel({
  label,
  model,
  batchSize,
  logger,
  normalizeRecord,
}) {
  const summary = emptySummary();
  const pkField = model?.primaryKeyAttributes?.[0] || "id";
  let lastPk = null;

  while (true) {
    const where = lastPk == null ? undefined : { [pkField]: { [Op.gt]: lastPk } };
    const rows = await model.findAll({
      where,
      order: [[pkField, "ASC"]],
      limit: batchSize,
    });

    if (!rows.length) break;

    for (const row of rows) {
      summary.scanned += 1;
      try {
        const changed = await normalizeRecord(row);
        if (changed) {
          await row.save();
          summary.updated += 1;
        } else {
          summary.skippedExisting += 1;
        }
      } catch (error) {
        summary.failed += 1;
      }
    }

    lastPk = rows[rows.length - 1][pkField];
    logger.log(
      `[mongo-import] ${label} progress scanned=${summary.scanned} updated=${summary.updated} skippedExisting=${summary.skippedExisting} failed=${summary.failed}`,
    );
  }

  return summary;
}

function normalizeKinguinProduct(record) {
  let changed = false;

  const officialStore = asObject(record.officialStore);
  const remote = asObject(record.remote);
  const overrides = asObject(record.overrides);
  const derived = asObject(record.derived);
  const flags = asObject(record.flags);

  if (record.officialStore !== officialStore) {
    record.officialStore = officialStore;
    changed = true;
  }
  if (record.remote !== remote) {
    record.remote = remote;
    changed = true;
  }
  if (record.overrides !== overrides) {
    record.overrides = overrides;
    changed = true;
  }
  if (record.derived !== derived) {
    record.derived = derived;
    changed = true;
  }
  if (record.flags !== flags) {
    record.flags = flags;
    changed = true;
  }

  return changed;
}

function normalizeUser(record) {
  let changed = false;

  if (!record.role) {
    record.role = "user";
    changed = true;
  }
  if (record.isActive == null) {
    record.isActive = true;
    changed = true;
  }

  return changed;
}

function normalizeCoupon(record) {
  if (record.active != null) return false;
  record.active = true;
  return true;
}

function normalizeSyncState(record) {
  if (record.value !== undefined) return false;
  record.value = null;
  return true;
}

function normalizeSyncProfile(record) {
  let changed = false;

  const filters = asObject(record.filters);
  const fields = asArray(record.fields);

  if (record.filters !== filters) {
    record.filters = filters;
    changed = true;
  }
  if (record.fields !== fields) {
    record.fields = fields;
    changed = true;
  }

  return changed;
}

function normalizeOrder(record) {
  let changed = false;

  const quantity = toNumberOrDefault(record.quantity, 1);
  if (record.quantity !== quantity) {
    record.quantity = quantity;
    changed = true;
  }

  const discount = toNumberOrDefault(record.discount, 0);
  if (record.discount !== discount) {
    record.discount = discount;
    changed = true;
  }

  const keys = asArray(record.keys);
  if (record.keys !== keys) {
    record.keys = keys;
    changed = true;
  }

  const products = asArray(record.products);
  if (record.products !== products) {
    record.products = products;
    changed = true;
  }

  if (!record.country) {
    record.country = "IQ";
    changed = true;
  }

  if (!record.status) {
    record.status = "pending";
    changed = true;
  }

  return changed;
}

async function runMongoToPostgresImport({
  logger = console,
  batchSize = safeBatchSize(process.env.MONGO_IMPORT_BATCH_SIZE),
} = {}) {
  if (!isEnabled()) {
    return {
      status: "disabled",
      message:
        "Postgres-only import utility is disabled. Set MONGO_IMPORT_ENABLED=true to run.",
      source: "postgres",
      target: "postgres",
      summary: {},
    };
  }

  logger.log(
    `[mongo-import] starting source=postgres target=postgres mode=consistency batchSize=${batchSize}`,
  );

  await sequelize.authenticate();

  const summary = {};
  summary.KinguinProduct = await scanAndNormalizeModel({
    label: "KinguinProduct",
    model: KinguinProduct,
    batchSize,
    logger,
    normalizeRecord: normalizeKinguinProduct,
  });
  summary.Users = await scanAndNormalizeModel({
    label: "Users",
    model: Users,
    batchSize,
    logger,
    normalizeRecord: normalizeUser,
  });
  summary.Coupon = await scanAndNormalizeModel({
    label: "Coupon",
    model: Coupon,
    batchSize,
    logger,
    normalizeRecord: normalizeCoupon,
  });
  summary.SyncState = await scanAndNormalizeModel({
    label: "SyncState",
    model: SyncState,
    batchSize,
    logger,
    normalizeRecord: normalizeSyncState,
  });
  summary.SyncProfile = await scanAndNormalizeModel({
    label: "SyncProfile",
    model: SyncProfile,
    batchSize,
    logger,
    normalizeRecord: normalizeSyncProfile,
  });
  summary.Order = await scanAndNormalizeModel({
    label: "Order",
    model: Order,
    batchSize,
    logger,
    normalizeRecord: normalizeOrder,
  });

  const totals = Object.values(summary).reduce(
    (acc, item) => {
      acc.scanned += Number(item.scanned || 0);
      acc.updated += Number(item.updated || 0);
      acc.failed += Number(item.failed || 0);
      return acc;
    },
    { scanned: 0, updated: 0, failed: 0 },
  );

  logger.log("[mongo-import] completed source=postgres target=postgres mode=consistency");
  logger.log(`[mongo-import] summary=${JSON.stringify(summary)}`);

  return {
    status: "success",
    source: "postgres",
    target: "postgres",
    mode: "postgres-only-consistency",
    batchSize,
    summary,
    totals,
  };
}

async function validateMongoImportIdempotency({ logger = console } = {}) {
  const originalFlag = process.env.MONGO_IMPORT_ENABLED;

  process.env.MONGO_IMPORT_ENABLED = "false";
  const disabledCheck = await runMongoToPostgresImport({ logger });

  process.env.MONGO_IMPORT_ENABLED = originalFlag;
  if (!isEnabled()) {
    return {
      status: "partial",
      message:
        "Disabled validation passed. Enable MONGO_IMPORT_ENABLED=true to run first/second Postgres-only validation.",
      validation: {
        disabledCheck,
        firstRun: null,
        secondRun: null,
      },
    };
  }

  const firstRun = await runMongoToPostgresImport({ logger });
  const secondRun = await runMongoToPostgresImport({ logger });

  const secondInsertedTotal = Object.values(secondRun.summary || {}).reduce(
    (sum, item) => sum + Number(item?.inserted || 0),
    0,
  );
  const secondUpdatedTotal = Object.values(secondRun.summary || {}).reduce(
    (sum, item) => sum + Number(item?.updated || 0),
    0,
  );
  const idempotent = secondInsertedTotal === 0 && secondUpdatedTotal === 0;

  return {
    status: idempotent ? "success" : "warning",
    validation: {
      disabledCheck,
      firstRun,
      secondRun,
      secondInsertedTotal,
      secondUpdatedTotal,
      idempotentInsertOnly: secondInsertedTotal === 0,
      idempotentConsistencyPass: idempotent,
    },
  };
}

module.exports = {
  runMongoToPostgresImport,
  validateMongoImportIdempotency,
};

