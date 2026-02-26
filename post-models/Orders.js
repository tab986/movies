module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define(
    "Order",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user: { type: DataTypes.UUID, allowNull: false },
      product: DataTypes.STRING,
      quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
      unitPrice: DataTypes.FLOAT,
      products: { type: DataTypes.JSONB, defaultValue: [] },
      merchants: DataTypes.UUID,
      coupon: DataTypes.STRING,
      discount: { type: DataTypes.FLOAT, defaultValue: 0 },
      totalPrice: { type: DataTypes.FLOAT, allowNull: false },
      waylReference: { type: DataTypes.STRING, allowNull: false },
      country: { type: DataTypes.STRING, defaultValue: "IQ" },
      waylPaymentStatus: {
        type: DataTypes.STRING,
        defaultValue: "pending",
        validate: { isIn: [["pending", "paid", "failed"]] },
      },
      kinguinOrderId: DataTypes.STRING,
      keys: { type: DataTypes.JSONB, defaultValue: [] },
      key: DataTypes.STRING,
      status: {
        type: DataTypes.STRING,
        defaultValue: "pending",
        validate: {
          isIn: [["pending", "completed", "wayle", "kingwin", "cancelled"]],
        },
      },
    },
    {
      tableName: "orders",
      timestamps: true,
      comment:
        "Mongo subdocuments/virtual detail population mapped to JSONB in SQL.",
    }
  );

  Order.associate = (models) => {
    if (models.Users) {
      Order.belongsTo(models.Users, { foreignKey: "user", as: "userRef" });
      Order.belongsTo(models.Users, { foreignKey: "merchants", as: "merchantRef" });
    }
  };

  return Order;
};
