const { Op } = require("sequelize");
const { Article, sequelize } = require("../post-models");
const AppError = require("../utils/appError");
const catchAsyncErrors = require("../utils/catchAsyncErrors.js");

function slugify(input) {
  const s = String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "article";
}

async function resolveUniqueSlug(baseSlug, excludeId = null) {
  const root = baseSlug || "article";
  let candidate = root;
  let n = 2;
  while (true) {
    const where = { slug: candidate };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const clash = await Article.findOne({ where });
    if (!clash) return candidate;
    candidate = `${root}-${n}`;
    n += 1;
  }
}

exports.listPublished = catchAsyncErrors(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
  const offset = (page - 1) * limit;

  const { count, rows } = await Article.findAndCountAll({
    where: { status: "published" },
    order: [[sequelize.literal('"publishedAt" DESC NULLS LAST')]],
    limit,
    offset,
  });

  const pageCount = Math.ceil(count / limit) || 0;

  res.status(200).json({
    status: "success",
    data: { articles: rows },
    meta: { page, limit, total: count, pageCount },
  });
});

exports.getPublishedBySlug = catchAsyncErrors(async (req, res, next) => {
  const article = await Article.findOne({
    where: { slug: req.params.slug, status: "published" },
  });
  if (!article) {
    return next(new AppError("Article not found", 404));
  }
  res.status(200).json({ status: "success", data: { article } });
});

exports.listAdmin = catchAsyncErrors(async (req, res) => {
  const articles = await Article.findAll({
    order: [["updatedAt", "DESC"]],
  });
  res.status(200).json({ status: "success", data: { articles } });
});

exports.getById = catchAsyncErrors(async (req, res, next) => {
  const article = await Article.findByPk(req.params.id);
  if (!article) {
    return next(new AppError("Article not found", 404));
  }
  res.status(200).json({ status: "success", data: { article } });
});

exports.create = catchAsyncErrors(async (req, res, next) => {
  const { title, slug, excerpt, body, status, publishedAt } = req.body;

  if (!title || !body) {
    return next(new AppError("title and body are required", 400));
  }

  const st = status === "published" ? "published" : "draft";
  const baseSlug = slug != null && String(slug).trim() !== "" ? slugify(slug) : slugify(title);
  const uniqueSlug = await resolveUniqueSlug(baseSlug);

  let pubAt = null;
  if (st === "published") {
    pubAt = publishedAt ? new Date(publishedAt) : new Date();
  }

  const article = await Article.create({
    title,
    slug: uniqueSlug,
    excerpt: excerpt ?? null,
    body,
    status: st,
    publishedAt: pubAt,
  });

  res.status(201).json({ status: "success", data: { article } });
});

exports.update = catchAsyncErrors(async (req, res, next) => {
  const article = await Article.findByPk(req.params.id);
  if (!article) {
    return next(new AppError("Article not found", 404));
  }

  const { title, slug, excerpt, body, status, publishedAt } = req.body;
  const patch = {};

  if (title !== undefined) patch.title = title;
  if (excerpt !== undefined) patch.excerpt = excerpt;
  if (body !== undefined) patch.body = body;

  if (status !== undefined) {
    patch.status = status === "published" ? "published" : "draft";
  }

  if (slug !== undefined && String(slug).trim() !== "") {
    const nextBase = slugify(slug);
    patch.slug = await resolveUniqueSlug(nextBase, article.id);
  }

  const nextStatus = patch.status !== undefined ? patch.status : article.status;

  if (publishedAt !== undefined) {
    patch.publishedAt = publishedAt ? new Date(publishedAt) : null;
  } else if (nextStatus === "published" && !article.publishedAt) {
    patch.publishedAt = new Date();
  }

  await article.update(patch);
  const updated = await Article.findByPk(req.params.id);

  res.status(200).json({ status: "success", data: { article: updated } });
});

exports.delete = catchAsyncErrors(async (req, res, next) => {
  const article = await Article.findByPk(req.params.id);
  if (!article) {
    return next(new AppError("Article not found", 404));
  }
  await article.destroy();
  res.status(204).send();
});
