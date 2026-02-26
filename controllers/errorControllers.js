const appError = require('../utils/appError');

const handleCastErrorDB = (err) => {
  const msg = `Invalid ${err.path}: ${err.value}`;
  return new appError(msg, 400);
};

const handleValidationErrorDB = (err) => {
  const msg = err.message;
  return new appError(msg, 400);
};

const handleJsonWebTokenError = (_) => new appError('invalid token', 401);

const handleTokenExpiredError = (_) =>
  new appError('token expired logoin again', 401);

const handleDuplicatefieldsDB = (err) => {
  const msg = `Dublicate field value :${JSON.stringify(err.keyValue)}`;
  return new appError(msg, 400);
};

const sendErrorsDevelopment = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    error: err,
    stack: err.stack,
  });
};

const sendErrorsProduction = (err, res) => {
  // console.log(err);
  if (err.isOperational === true) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    console.error('Error!!!!!!!!!!');

    res.status(500).json({
      status: 'error',
      message: 'something went wrorng',
    });
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  if (process.env.NODE_ENV === 'development') {
    sendErrorsDevelopment(err, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err };
    console.log(err == error);

    if (err.name === 'CastError') error = handleCastErrorDB(error);
    if (err.code === 11000) error = handleDuplicatefieldsDB(error);
    if (err.name === 'ValidationError') error = handleValidationErrorDB(err);
    if (err.name === 'JsonWebTokenError') error = handleJsonWebTokenError();
    if (err.name === 'TokenExpiredError') error = handleTokenExpiredError();

    sendErrorsProduction(error, res);
  }
};
