import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db.js';
import { createId } from '@paralleldrive/cuid2';

interface ConversionAttributes {
  id: string;
  contact_id: string;
  event_type: string;
  event_data: object | null;
  occurred_at: Date;
}

type ConversionCreationAttributes = Optional<ConversionAttributes,
  'id' | 'event_data' | 'occurred_at'
>;

export class Conversion extends Model<ConversionAttributes, ConversionCreationAttributes> implements ConversionAttributes {
  declare id: string;
  declare contact_id: string;
  declare event_type: string;
  declare event_data: object | null;
  declare occurred_at: Date;
}

Conversion.init({
  id: { type: DataTypes.TEXT, primaryKey: true, defaultValue: () => createId() },
  contact_id: { type: DataTypes.TEXT, allowNull: false, references: { model: { tableName: 'contacts', schema: 'sales_engine' }, key: 'id' } },
  event_type: { type: DataTypes.TEXT, allowNull: false },
  event_data: { type: DataTypes.JSONB },
  occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  schema: 'sales_engine',
  tableName: 'conversions',
  timestamps: false,
  indexes: [
    { fields: ['contact_id'] },
    { fields: ['event_type'] },
  ],
});

export default Conversion;
