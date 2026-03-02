import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db.js';
import { createId } from '@paralleldrive/cuid2';

interface SendingAccountAttributes {
  id: string;
  email: string;
  display_name: string;
  app_password: string;
  daily_limit: number;
  daily_sent: number;
  warmup_complete: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}

type SendingAccountCreationAttributes = Optional<SendingAccountAttributes,
  'id' | 'daily_limit' | 'daily_sent' | 'warmup_complete' | 'status' | 'created_at' | 'updated_at'
>;

export class SendingAccount extends Model<SendingAccountAttributes, SendingAccountCreationAttributes> implements SendingAccountAttributes {
  declare id: string;
  declare email: string;
  declare display_name: string;
  declare app_password: string;
  declare daily_limit: number;
  declare daily_sent: number;
  declare warmup_complete: boolean;
  declare status: string;
  declare created_at: Date;
  declare updated_at: Date;
}

SendingAccount.init({
  id: { type: DataTypes.TEXT, primaryKey: true, defaultValue: () => createId() },
  email: { type: DataTypes.TEXT, allowNull: false, unique: true },
  display_name: { type: DataTypes.TEXT, allowNull: false },
  app_password: { type: DataTypes.TEXT, allowNull: false },
  daily_limit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
  daily_sent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  warmup_complete: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'warmup' },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  schema: 'sales_engine',
  tableName: 'sending_accounts',
  timestamps: false,
});

export default SendingAccount;
