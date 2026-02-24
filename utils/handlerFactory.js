const catchAsyncErrors = require("./catchAsyncErrors");
const AppError = require("./appError");
const APIFeatures = require("./APIFeatures");
const { Op } = require("sequelize");

exports.deleteOne = (Model, docName = "document") =>
  catchAsyncErrors(async (req, res, next) => {
    const docId = req.params.id || req.params[`${docName}Id`]; // Try common patterns
    if (!docId) {
      return next(new AppError(`MISSING_${docName.toUpperCase()}_ID`, 400)); // Need to add keys like MISSING_CATEGORY_ID etc.
    }

    const doc = await Model.findByPk(docId);

    if (!doc) {
      const errorKey = `${docName.toUpperCase()}_NOT_FOUND`;
      return next(new AppError(errorKey, 404));
    }

    await doc.destroy();

    res.status(204).json({
      status: "success",
      data: null,
    });
  });

exports.updateOne = (Model, docName = "document") =>
  catchAsyncErrors(async (req, res, next) => {
    const docId = req.params.id || req.params[`${docName}Id`];
    if (!docId) {
      return next(new AppError(`MISSING_${docName.toUpperCase()}_ID`, 400));
    }
    if (req.body.password || req.body.passwordConfirm) {
      return next(new AppError("PASSWORD_UPDATE_NOT_ALLOWED", 400));
    }

    const doc = await Model.findByPk(docId);

    if (!doc) {
      const errorKey = `${docName.toUpperCase()}_NOT_FOUND`;
      return next(new AppError(errorKey, 404));
    }

    await doc.update(req.body);

    res.status(200).json({
      status: "success",
      data: {
        [docName]: doc,
      },
    });
  });

exports.createOne = (Model, docName = "document") =>
  catchAsyncErrors(async (req, res, next) => {
    const newDoc = await Model.create(req.body);

    res.status(201).json({
      status: "success",
      data: {
        [docName]: newDoc,
      },
    });
  });

exports.getOne = (Model, populateOptions, docName = "document") =>
  catchAsyncErrors(async (req, res, next) => {
    const docId = req.params.id || req.params[`${docName}Id`];
    if (!docId) {
      return next(new AppError(`MISSING_${docName.toUpperCase()}_ID`, 400));
    }

    const options = {};
    if (populateOptions) {
      options.include = Array.isArray(populateOptions)
        ? populateOptions
        : [populateOptions];
    }
    const doc = await Model.findByPk(docId, options);

    if (!doc) {
      const errorKey = `${docName.toUpperCase()}_NOT_FOUND`;
      return next(new AppError(errorKey, 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        [docName]: doc,
      },
    });
  });

exports.getAll = (Model, docNamePlural = "documents") =>
  catchAsyncErrors(async (req, res, next) => {
    let filter = {};

    if (req.params.productId) {
      filter = { product: req.params.productId };
    }

    if (req.query.category) {
      try {
        const categoryIds = Array.isArray(req.query.category)
          ? req.query.category
          : req.query.category.split(",");

        filter.category = {
          [Op.in]: categoryIds,
        };

        delete req.query.category;
      } catch (err) {
        return next(new Error("Invalid category ID(s) format"));
      }
    }

    if (req.query.tags) {
      try {
        const tagIds = Array.isArray(req.query.tags)
          ? req.query.tags
          : req.query.tags.split(",");

        filter.tags = {
          [Op.in]: tagIds,
        };

        delete req.query.tags;
      } catch (err) {
        return next(new Error("Invalid tag ID(s) format"));
      }
    }

    let features = new APIFeatures(Model, req.query, filter)
      .filter()
      .sort()
      .selectFields();

    const total = await features.count();

    features = features.paginate();
    const doc = await features.execute();
    res.status(200).json({
      status: "success",
      results: doc.length,
      total,
      data: {
        [docNamePlural]: doc,
      },
    });
  });
