import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db.js';
import { createId } from '@paralleldrive/cuid2';

interface SequenceStep {
  step: number;
  delay_days: number;
  subject: string;
  body: string;
}

interface SequenceAttributes {
  id: string;
  project: string;
  name: string;
  steps: SequenceStep[];
  status: string;
  created_at: Date;
  updated_at: Date;
}

type SequenceCreationAttributes = Optional<SequenceAttributes,
  'id' | 'project' | 'status' | 'created_at' | 'updated_at'
>;

export class Sequence extends Model<SequenceAttributes, SequenceCreationAttributes> implements SequenceAttributes {
  declare id: string;
  declare project: string;
  declare name: string;
  declare steps: SequenceStep[];
  declare status: string;
  declare created_at: Date;
  declare updated_at: Date;
}

Sequence.init({
  id: { type: DataTypes.TEXT, primaryKey: true, defaultValue: () => createId() },
  project: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'talkspresso' },
  name: { type: DataTypes.TEXT, allowNull: false },
  steps: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'active' },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  schema: 'sales_engine',
  tableName: 'sequences',
  timestamps: false,
});

export default Sequence;
