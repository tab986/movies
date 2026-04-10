module.exports = (sequelize, DataTypes) => {
  const Merchant = sequelize.define(
    "Merchant",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
      },
      storeName: { type: DataTypes.STRING, allowNull: false },
      status: {
        type: DataTypes.STRING,
        defaultValue: "active",
        validate: { isIn: [["active", "suspended"]] },
      },
      discountType: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      discountValue: { type: DataTypes.FLOAT, allowNull: true },
      discountActive: { type: DataTypes.BOOLEAN, defaultValue: false },
      phone: DataTypes.STRING,
      address: DataTypes.STRING,
      notes: DataTypes.TEXT,
    },
    {
      tableName: "merchants",
      timestamps: true,
    }
  );

  Merchant.associate = (models) => {
    if (models.Users) {
      Merchant.belongsTo(models.Users, { foreignKey: "userId", as: "user" });
    }
    if (models.MerchantPurchaseLog) {
      Merchant.hasMany(models.MerchantPurchaseLog, {
        foreignKey: "merchantId",
        as: "purchaseLogs",
      });
    }
  };

  return Merchant;
};
