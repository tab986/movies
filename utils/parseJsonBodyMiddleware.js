const AppError = require("./appError");

const parseJsonBody = (req, res, next) => {
  if (req.is("multipart/form-data") && req.body && req.body.json) {
    try {
      const jsonData = JSON.parse(req.body.json);

      Object.assign(req.body, jsonData);

      delete req.body.json;
    } catch (err) {
      return next(new AppError("INVALID_JSON_PAYLOAD", 400));
    }
  }
  next();
};

module.exports = parseJsonBody;
