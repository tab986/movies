const Orders = require("../models/ordersModel");
const APIFeatures = require("../utils/APIFeatures");
const appError = require("../utils/appError");
const catchAsyncErrors = require("../utils/catchAsyncErrors");

exports.getTotalRevenue = catchAsyncErrors(async (req, res, next) => {
  const result = await Orders.aggregate([
    {
      $match: {
        status: "delivered",
      },
    },
    {
      $addFields: {
        numericPrice: {
          $toDouble: {
            $substrBytes: ["$totalPrice", 1, -1],
          },
        },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$numericPrice" },
      },
    },
  ]);

  const totalRevenue = result.length > 0 ? result[0].totalRevenue : 0;

  res.status(200).json({
    status: "success",
    totalRevenue,
  });
});

exports.getTotalCustomers = catchAsyncErrors(async (req, res, next) => {
  const result = await Orders.aggregate([
    {
      $group: {
        _id: "$phoneNumber",
      },
    },
    {
      $count: "totalCustomers",
    },
  ]);

  const totalCustomers = result.length > 0 ? result[0].totalCustomers : 0;

  res.status(200).json({
    status: "success",
    totalCustomers,
  });
});
