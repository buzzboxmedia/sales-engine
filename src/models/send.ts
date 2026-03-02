import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db.js';
import { createId } from '@paralleldrive/cuid2';

interface SendAttributes {
  id: string;
  contact_id: string;
  sequence_id: string | null;
  step_number: number | null;
  sender_email: string;
  subject: string;
  body: string;
  status: string;
  sent_at: Date | null;
  opened_at: Date | null;
  replied_at: Date | null;
  bounced_at: Date | null;
  reply_category: string | null;
  reply_snippet: string | null;
  created_at: Date;
}

type SendCreationAttributes = Optional<SendAttributes,
  'id' | 'sequence_id' | 'step_number' | 'status' | 'sent_at' | 'opened_at' |
  'replied_at' | 'bounced_at' | 'reply_category' | 'reply_snippet' | 'created_at'
>;

export class Send extends Model<SendAttributes, SendCreationAttributes> implements SendAttributes {
  declare id: string;
  declare contact_id: string;
  declare sequence_id: string | null;
  declare step_number: number | null;
  declare sender_email: string;
  declare subject: string;
  declare body: string;
  declare status: string;
  declare sent_at: Date | null;
  declare opened_at: Date | null;
  declare replied_at: Date | null;
  declare bounced_at: Date | null;
  declare reply_category: string | null;
  declare reply_snippet: string | null;
  declare created_at: Date;
}

Send.init({
  id: { type: DataTypes.TEXT, primaryKey: true, defaultValue: () => createId() },
  contact_id: { type: DataTypes.TEXT, allowNull: false, references: { model: { tableName: 'contacts', schema: 'sales_engine' }, key: 'id' } },
  sequence_id: { type: DataTypes.TEXT, references: { model: { tableName: 'sequences', schema: 'sales_engine' }, key: 'id' } },
  step_number: { type: DataTypes.INTEGER },
  sender_email: { type: DataTypes.TEXT, allowNull: false },
  subject: { type: DataTypes.TEXT, allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'queued' },
  sent_at: { type: DataTypes.DATE },
  opened_at: { type: DataTypes.DATE },
  replied_at: { type: DataTypes.DATE },
  bounced_at: { type: DataTypes.DATE },
  reply_category: { type: DataTypes.TEXT },
  reply_snippet: { type: DataTypes.TEXT },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  schema: 'sales_engine',
  tableName: 'sends',
  timestamps: false,
  indexes: [
    { fields: ['contact_id'] },
    { fields: ['sequence_id'] },
    { fields: ['status'] },
    { fields: ['sent_at'] },
  ],
});

export default Send;
