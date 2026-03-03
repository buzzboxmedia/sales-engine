import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db.js';
import { createId } from '@paralleldrive/cuid2';

interface ActivityLogAttributes {
  id: string;
  contact_id: string | null;
  activity_type: string;
  description: string | null;
  metadata: object;
  occurred_at: Date;
}

type ActivityLogCreationAttributes = Optional<ActivityLogAttributes,
  'id' | 'contact_id' | 'description' | 'metadata' | 'occurred_at'
>;

export class ActivityLog extends Model<ActivityLogAttributes, ActivityLogCreationAttributes> implements ActivityLogAttributes {
  declare id: string;
  declare contact_id: string | null;
  declare activity_type: string;
  declare description: string | null;
  declare metadata: object;
  declare occurred_at: Date;
}

ActivityLog.init({
  id: { type: DataTypes.TEXT, primaryKey: true, defaultValue: () => createId() },
  contact_id: { type: DataTypes.TEXT, references: { model: { tableName: 'contacts', schema: 'sales_engine' }, key: 'id' } },
  activity_type: { type: DataTypes.TEXT, allowNull: false },
  description: { type: DataTypes.TEXT },
  metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  schema: 'sales_engine',
  tableName: 'activity_log',
  timestamps: false,
  indexes: [
    { fields: ['contact_id', 'occurred_at'] },
  ],
});

export default ActivityLog;
