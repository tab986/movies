module.exports = (sequelize, DataTypes) => {
  const MerchantPurchaseLog = sequelize.define(
    "MerchantPurchaseLog",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      merchantId: { type: DataTypes.UUID, allowNull: false },
      merchantUserId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      orderId: { type: DataTypes.UUID, allowNull: false },
      productId: { type: DataTypes.STRING, allowNull: false },
      productName: DataTypes.STRING,
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      baseUnitPriceIQD: { type: DataTypes.FLOAT, allowNull: false },
      discountType: DataTypes.STRING,
      discountValue: DataTypes.FLOAT,
      discountAmountIQD: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
      finalUnitPriceIQD: { type: DataTypes.FLOAT, allowNull: false },
      gainIQD: { type: DataTypes.FLOAT, allowNull: false },
      lossIQD: { type: DataTypes.FLOAT, allowNull: false },
      earningIQD: { type: DataTypes.FLOAT, allowNull: false },
    },
    {
      tableName: "merchant_purchase_logs",
      timestamps: true,
      indexes: [
        { fields: ["merchantId"] },
        { fields: ["merchantUserId"] },
        { fields: ["orderId"] },
        { fields: ["createdAt"] },
      ],
    }
  );

  MerchantPurchaseLog.associate = (models) => {
    if (models.Merchant) {
      MerchantPurchaseLog.belongsTo(models.Merchant, {
        foreignKey: "merchantId",
        as: "merchant",
      });
    }
    if (models.Users) {
      MerchantPurchaseLog.belongsTo(models.Users, {
        foreignKey: "merchantUserId",
        as: "merchantUser",
      });
      MerchantPurchaseLog.belongsTo(models.Users, {
        foreignKey: "userId",
        as: "buyer",
      });
    }
    if (models.Order) {
      MerchantPurchaseLog.belongsTo(models.Order, {
        foreignKey: "orderId",
        as: "order",
      });
    }
  };

  return MerchantPurchaseLog;
};
