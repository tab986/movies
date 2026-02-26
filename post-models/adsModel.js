module.exports = (sequelize, DataTypes) => {
  const Ad = sequelize.define(
    "Ad",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      title: { type: DataTypes.STRING, allowNull: false },
      adPicture: DataTypes.STRING,
      link: DataTypes.STRING,
      string: DataTypes.STRING,
      position: DataTypes.STRING,
      active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: "ads",
      timestamps: true,
    }
  );

  return Ad;
};
