module.exports = (sequelize, DataTypes) => {
  const SyncState = sequelize.define(
    "SyncState",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      key: { type: DataTypes.STRING, unique: true },
      value: DataTypes.JSONB,
    },
    {
      tableName: "sync_states",
      timestamps: true,
    }
  );

  return SyncState;
};
