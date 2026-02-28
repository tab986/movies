module.exports = (sequelize, DataTypes) => {
  const PhysicalOrder = sequelize.define(
    "PhysicalOrder",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user: { type: DataTypes.UUID, allowNull: false },
      seller: DataTypes.UUID,
      product: { type: DataTypes.UUID, allowNull: false },
      quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
      totalPrice: { type: DataTypes.FLOAT, allowNull: false },
      status: {
        type: DataTypes.STRING,
        validate: {
          isIn: [["pending", "confirmed", "shipped", "delivered", "cancelled"]],
        },
      },
    },
    {
      tableName: "physical_orders",
      timestamps: true,
      comment:
        "Source file is currently commented in Mongo; represented here for parity.",
    }
  );

  PhysicalOrder.associate = (models) => {
    if (models.Users) {
      PhysicalOrder.belongsTo(models.Users, { foreignKey: "user", as: "userRef" });
      PhysicalOrder.belongsTo(models.Users, {
        foreignKey: "seller",
        as: "sellerRef",
      });
    }
    if (models.PhysicalProduct) {
      PhysicalOrder.belongsTo(models.PhysicalProduct, {
        foreignKey: "product",
        as: "productRef",
      });
    }
  };

  return PhysicalOrder;
};
