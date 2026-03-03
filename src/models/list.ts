import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db.js';
import { createId } from '@paralleldrive/cuid2';

interface ListAttributes {
  id: string;
  project: string;
  name: string;
  description: string | null;
  filter_criteria: object | null;
  is_dynamic: boolean;
  created_at: Date;
  updated_at: Date;
}

type ListCreationAttributes = Optional<ListAttributes,
  'id' | 'project' | 'description' | 'filter_criteria' | 'is_dynamic' | 'created_at' | 'updated_at'
>;

export class List extends Model<ListAttributes, ListCreationAttributes> implements ListAttributes {
  declare id: string;
  declare project: string;
  declare name: string;
  declare description: string | null;
  declare filter_criteria: object | null;
  declare is_dynamic: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

List.init({
  id: { type: DataTypes.TEXT, primaryKey: true, defaultValue: () => createId() },
  project: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'talkspresso' },
  name: { type: DataTypes.TEXT, allowNull: false },
  description: { type: DataTypes.TEXT },
  filter_criteria: { type: DataTypes.JSONB },
  is_dynamic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  schema: 'sales_engine',
  tableName: 'lists',
  timestamps: false,
  indexes: [
    { fields: ['project'] },
  ],
});

export default List;
