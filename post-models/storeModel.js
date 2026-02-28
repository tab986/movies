module.exports = (sequelize, DataTypes) => {
  const Store = sequelize.define(
    "Store",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      logoImage: DataTypes.STRING,
      description: DataTypes.TEXT,
    },
    {
      tableName: "stores",
      timestamps: true,
    }
  );

  Store.associate = (models) => {
    if (models.Products) {
      Store.hasMany(models.Products, { foreignKey: "store", as: "productIds" });
    }
  };

  return Store;
};
