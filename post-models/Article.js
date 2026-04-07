module.exports = (sequelize, DataTypes) => {
  const Article = sequelize.define(
    "Article",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      slug: { type: DataTypes.STRING, allowNull: false, unique: true },
      title: { type: DataTypes.STRING, allowNull: false },
      excerpt: DataTypes.TEXT,
      body: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.ENUM("draft", "published"),
        allowNull: false,
        defaultValue: "draft",
      },
      publishedAt: DataTypes.DATE,
    },
    {
      tableName: "articles",
      timestamps: true,
      indexes: [{ fields: ["status", "publishedAt"] }],
    }
  );

  return Article;
};
