import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db.js';
import { createId } from '@paralleldrive/cuid2';

interface EmailEventAttributes {
  id: string;
  send_id: string | null;
  event_type: string;
  metadata: object;
  occurred_at: Date;
}

type EmailEventCreationAttributes = Optional<EmailEventAttributes,
  'id' | 'send_id' | 'metadata' | 'occurred_at'
>;

export class EmailEvent extends Model<EmailEventAttributes, EmailEventCreationAttributes> implements EmailEventAttributes {
  declare id: string;
  declare send_id: string | null;
  declare event_type: string;
  declare metadata: object;
  declare occurred_at: Date;
}

EmailEvent.init({
  id: { type: DataTypes.TEXT, primaryKey: true, defaultValue: () => createId() },
  send_id: { type: DataTypes.TEXT, references: { model: { tableName: 'sends', schema: 'sales_engine' }, key: 'id' } },
  event_type: { type: DataTypes.TEXT, allowNull: false },
  metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  schema: 'sales_engine',
  tableName: 'email_events',
  timestamps: false,
  indexes: [
    { fields: ['send_id'] },
    { fields: ['event_type'] },
  ],
});

export default EmailEvent;
