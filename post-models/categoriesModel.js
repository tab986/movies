module.exports = (sequelize, DataTypes) => {
  const Category = sequelize.define(
    "Category",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false, unique: true },
      isFeatured: { type: DataTypes.BOOLEAN, defaultValue: false },
      categoryType: {
        type: DataTypes.STRING,
        validate: { isIn: [["base", "sub"]] },
      },
      baseCategory: DataTypes.UUID,
    },
    {
      tableName: "categories",
      timestamps: true,
    }
  );

  Category.associate = (models) => {
    Category.belongsTo(models.Category, {
      foreignKey: "baseCategory",
      as: "baseCategoryRef",
    });
    Category.hasMany(models.Category, {
      foreignKey: "baseCategory",
      as: "subCategories",
    });
  };

  return Category;
};
