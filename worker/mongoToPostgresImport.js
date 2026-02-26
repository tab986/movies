require("dotenv").config({ path: process.env.DOTENV_PATH || "./config.env" });

const mongoose = require("mongoose");
const { Op, UniqueConstraintError } = require("sequelize");

const MongoKinguinProduct = require("../models/KinguinProduct");
const MongoOrder = require("../models/Orders");
const MongoUsers = require("../models/userModel");
const MongoCoupon = require("../models/Coupon");
const {
  SyncState: MongoSyncState,
  SyncProfile: MongoSyncProfile,
} = require("../models/SyncState");

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

function toDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isEnabled() {
  return String(process.env.MONGO_IMPORT_ENABLED || "").toLowerCase() === "true";
}

function normalizeKey(value) {
  if (value == null) return "";
  if (typeof value === "object" && typeof value.toString === "function") {
    return value.toString();
  }
  return String(value);
}

async function ensureMongoConnection(mongoUri) {
  if (mongoose.connection.readyState === 1) return false;
  await mongoose.connect(mongoUri);
  return true;
}

function initialModelSummary() {
  return { scanned: 0, inserted: 0, skippedExisting: 0, failed: 0 };
}

function stripInternalImportKey(row) {
  const { __importKey, ...clean } = row;
  return clean;
}

async function bulkInsertSafely({ pgModel, rows }) {
  if (!rows.length) return { inserted: 0, skippedExisting: 0, failed: 0 };

  try {
    await pgModel.bulkCreate(rows);
    return { inserted: rows.length, skippedExisting: 0, failed: 0 };
  } catch (error) {
    let inserted = 0;
    let skippedExisting = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        await pgModel.create(row);
        inserted += 1;
      } catch (singleError) {
        if (singleError instanceof UniqueConstraintError) {
          skippedExisting += 1;
        } else {
          failed += 1;
        }
      }
    }

    return { inserted, skippedExisting, failed };
  }
}

async function importCollection({
  label,
  mongoModel,
  pgModel,
  keyField,
  mapDoc,
  batchSize,
  logger,
  progressEvery = 1000,
  prepareBatch,
}) {
  const summary = initialModelSummary();
  const cursor = mongoModel.find({}).lean().cursor({ batchSize });
  let batch = [];

  async function flush() {
    if (!batch.length) return;

    const batchContext = prepareBatch ? await prepareBatch(batch) : undefined;
    const mappedRows = [];

    for (const doc of batch) {
      summary.scanned += 1;
      try {
        const mapped = await mapDoc(doc, batchContext);
        if (!mapped || mapped.__importKey == null || mapped.__importKey === "") {
          summary.failed += 1;
          continue;
        }
        mappedRows.push(mapped);
      } catch (error) {
        summary.failed += 1;
      }

      if (summary.scanned % progressEvery === 0) {
        logger.log(
          `[mongo-import] ${label} progress scanned=${summary.scanned} inserted=${summary.inserted} skippedExisting=${summary.skippedExisting} failed=${summary.failed}`,
        );
      }
    }

    batch = [];
    if (!mappedRows.length) return;

    const keys = [...new Set(mappedRows.map((row) => row.__importKey))];
    const existingRows = await pgModel.findAll({
      attributes: [keyField],
      where: { [keyField]: { [Op.in]: keys } },
      raw: true,
    });
    const existing = new Set(existingRows.map((row) => normalizeKey(row[keyField])));

    const toInsert = mappedRows
      .filter((row) => !existing.has(row.__importKey))
      .map(stripInternalImportKey);

    summary.skippedExisting += mappedRows.length - toInsert.length;
    if (!toInsert.length) return;

    const writeResult = await bulkInsertSafely({ pgModel, rows: toInsert });
    summary.inserted += writeResult.inserted;
    summary.skippedExisting += writeResult.skippedExisting;
    summary.failed += writeResult.failed;
  }

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= batchSize) {
      await flush();
    }
  }
  await flush();

  return summary;
}

function mapKinguinProduct(doc) {
  return {
    __importKey: normalizeKey(doc._id),
    id: Number(doc._id),
    officialStore: doc.officialStore || {},
    remote: doc.remote || {},
    overrides: doc.overrides || {},
    derived: doc.derived || {},
    flags: doc.flags || {},
    createdAt: toDate(doc.createdAt),
    updatedAt: toDate(doc.updatedAt),
  };
}

function mapUser(doc) {
  return {
    __importKey: normalizeKey(doc.phone),
    fullName: doc.fullName || null,
    phone: doc.phone,
    governorate: doc.governorate || null,
    city: doc.city || null,
    address: doc.address || null,
    email: doc.email || null,
    isActive: doc.isActive !== false,
    profileImage: doc.profileImage || null,
    role: doc.role || "user",
    password: doc.password,
    passwordChangedAt: toDate(doc.passwordChangedAt),
    passwordResetToken: doc.passwordResetToken || null,
    passwordResetTokenExp: toDate(doc.passwordResetTokenExp),
    createdAt: toDate(doc.createdAt),
    updatedAt: toDate(doc.updatedAt),
  };
}

function mapCoupon(doc) {
  return {
    __importKey: normalizeKey(doc.code),
    code: doc.code,
    type: doc.type,
    value: Number(doc.value),
    expiresAt: toDate(doc.expiresAt),
    active: doc.active !== false,
    createdAt: toDate(doc.createdAt),
    updatedAt: toDate(doc.updatedAt),
  };
}

function mapSyncState(doc) {
  return {
    __importKey: normalizeKey(doc.key),
    key: doc.key,
    value: doc.value ?? null,
    createdAt: toDate(doc.createdAt),
    updatedAt: toDate(doc.updatedAt),
  };
}

function mapSyncProfile(doc) {
  return {
    __importKey: normalizeKey(doc.name),
    name: doc.name,
    filters: doc.filters || {},
    fields: Array.isArray(doc.fields) ? doc.fields : [],
  };
}

async function prepareOrderBatch(batchDocs) {
  const objectIds = new Set();
  for (const order of batchDocs) {
    if (order.user) objectIds.add(normalizeKey(order.user));
    if (order.merchants) objectIds.add(normalizeKey(order.merchants));
  }

  if (!objectIds.size) return { mongoIdToPgUserId: new Map() };

  const mongoUsers = await MongoUsers.find(
    { _id: { $in: Array.from(objectIds) } },
    { _id: 1, phone: 1 },
  ).lean();

  const mongoIdToPhone = new Map();
  const phones = new Set();
  for (const user of mongoUsers) {
    const id = normalizeKey(user._id);
    const phone = user.phone ? String(user.phone) : "";
    if (!id || !phone) continue;
    mongoIdToPhone.set(id, phone);
    phones.add(phone);
  }

  if (!phones.size) return { mongoIdToPgUserId: new Map() };

  const pgUsers = await Users.findAll({
    attributes: ["id", "phone"],
    where: { phone: { [Op.in]: Array.from(phones) } },
    raw: true,
  });

  const phoneToPgId = new Map();
  for (const user of pgUsers) {
    phoneToPgId.set(String(user.phone), user.id);
  }

  const mongoIdToPgUserId = new Map();
  for (const [mongoId, phone] of mongoIdToPhone.entries()) {
    const pgId = phoneToPgId.get(phone);
    if (pgId) mongoIdToPgUserId.set(mongoId, pgId);
  }

  return { mongoIdToPgUserId };
}

function mapOrder(doc, context) {
  const key = normalizeKey(doc.waylReference);
  const userId = context?.mongoIdToPgUserId.get(normalizeKey(doc.user));
  if (!key || !userId) return null;

  const merchantId =
    context?.mongoIdToPgUserId.get(normalizeKey(doc.merchants)) || null;

  return {
    __importKey: key,
    user: userId,
    product: doc.product || null,
    quantity: Number.isFinite(Number(doc.quantity)) ? Number(doc.quantity) : 1,
    unitPrice: Number.isFinite(Number(doc.unitPrice)) ? Number(doc.unitPrice) : null,
    products: Array.isArray(doc.products) ? doc.products : [],
    merchants: merchantId,
    coupon: doc.coupon || null,
    discount: Number.isFinite(Number(doc.discount)) ? Number(doc.discount) : 0,
    totalPrice: Number(doc.totalPrice),
    waylReference: doc.waylReference,
    country: doc.country || "IQ",
    waylPaymentStatus: doc.waylPaymentStatus || "pending",
    kinguinOrderId: doc.kinguinOrderId || null,
    keys: Array.isArray(doc.keys) ? doc.keys : [],
    key: doc.key || null,
    status: doc.status || "pending",
    createdAt: toDate(doc.createdAt),
    updatedAt: toDate(doc.updatedAt),
  };
}

async function runMongoToPostgresImport({
  logger = console,
  batchSize = safeBatchSize(process.env.MONGO_IMPORT_BATCH_SIZE),
} = {}) {
  if (!isEnabled()) {
    return {
      status: "disabled",
      message: "Mongo import is disabled. Set MONGO_IMPORT_ENABLED=true to run.",
      source: "mongo-test",
      target: "postgres",
      summary: {},
    };
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing");
  }

  logger.log(
    `[mongo-import] starting source=mongo-test target=postgres batchSize=${batchSize}`,
  );

  await sequelize.authenticate();
  const openedMongoHere = await ensureMongoConnection(mongoUri);

  const summary = {};
  try {
    summary.KinguinProduct = await importCollection({
      label: "KinguinProduct",
      mongoModel: MongoKinguinProduct,
      pgModel: KinguinProduct,
      keyField: "id",
      mapDoc: mapKinguinProduct,
      batchSize,
      logger,
    });

    summary.Users = await importCollection({
      label: "Users",
      mongoModel: MongoUsers,
      pgModel: Users,
      keyField: "phone",
      mapDoc: mapUser,
      batchSize,
      logger,
    });

    summary.Coupon = await importCollection({
      label: "Coupon",
      mongoModel: MongoCoupon,
      pgModel: Coupon,
      keyField: "code",
      mapDoc: mapCoupon,
      batchSize,
      logger,
    });

    summary.SyncState = await importCollection({
      label: "SyncState",
      mongoModel: MongoSyncState,
      pgModel: SyncState,
      keyField: "key",
      mapDoc: mapSyncState,
      batchSize,
      logger,
    });

    summary.SyncProfile = await importCollection({
      label: "SyncProfile",
      mongoModel: MongoSyncProfile,
      pgModel: SyncProfile,
      keyField: "name",
      mapDoc: mapSyncProfile,
      batchSize,
      logger,
    });

    summary.Order = await importCollection({
      label: "Order",
      mongoModel: MongoOrder,
      pgModel: Order,
      keyField: "waylReference",
      mapDoc: mapOrder,
      prepareBatch: prepareOrderBatch,
      batchSize,
      logger,
    });
  } finally {
    if (openedMongoHere) {
      await mongoose.disconnect();
    }
  }

  logger.log(`[mongo-import] completed source=mongo-test target=postgres`);
  logger.log(`[mongo-import] summary=${JSON.stringify(summary)}`);

  return {
    status: "success",
    source: "mongo-test",
    target: "postgres",
    batchSize,
    summary,
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
        "Disabled validation passed. Enable MONGO_IMPORT_ENABLED=true to run first/second import validation.",
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

  return {
    status: secondInsertedTotal === 0 ? "success" : "warning",
    validation: {
      disabledCheck,
      firstRun,
      secondRun,
      secondInsertedTotal,
      idempotentInsertOnly: secondInsertedTotal === 0,
    },
  };
}

module.exports = {
  runMongoToPostgresImport,
  validateMongoImportIdempotency,
};

