module.exports = (sequelize, DataTypes) => {
  const Products = sequelize.define(
    "Products",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: DataTypes.STRING,
      isVisible: { type: DataTypes.BOOLEAN, defaultValue: true },
      originalPrice: DataTypes.FLOAT,
      isBestseller: DataTypes.BOOLEAN,
      isNew: DataTypes.BOOLEAN,
      category: DataTypes.STRING,
      image: { type: DataTypes.STRING, allowNull: false },
      sizes: { type: DataTypes.JSONB, defaultValue: [] },
      description: DataTypes.TEXT,
      size: DataTypes.STRING,
      expireDate: DataTypes.STRING,
      usage: DataTypes.STRING,
      skinType: DataTypes.STRING,
      origin: DataTypes.STRING,
      content: DataTypes.TEXT,
      store: DataTypes.UUID,
      cardType: DataTypes.STRING,
      productStock: DataTypes.INTEGER,
    },
    {
      tableName: "products",
      timestamps: true,
      indexes: [
        { fields: ["isVisible"] },
        { fields: ["isBestseller"] },
        { fields: ["isNew"] },
        { fields: ["category"] },
        { fields: ["createdAt"] },
      ],
    }
  );

  Products.associate = (models) => {
    if (models.Store) {
      Products.belongsTo(models.Store, { foreignKey: "store", as: "storeRef" });
    }
    if (models.Reviews) {
      Products.hasMany(models.Reviews, { foreignKey: "product", as: "reviews" });
    }
  };

  return Products;
};
