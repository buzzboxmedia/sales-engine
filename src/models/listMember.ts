import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db.js';

interface ListMemberAttributes {
  list_id: string;
  contact_id: string;
  added_at: Date;
}

type ListMemberCreationAttributes = Optional<ListMemberAttributes, 'added_at'>;

export class ListMember extends Model<ListMemberAttributes, ListMemberCreationAttributes> implements ListMemberAttributes {
  declare list_id: string;
  declare contact_id: string;
  declare added_at: Date;
}

ListMember.init({
  list_id: { type: DataTypes.TEXT, allowNull: false, primaryKey: true, references: { model: { tableName: 'lists', schema: 'sales_engine' }, key: 'id' } },
  contact_id: { type: DataTypes.TEXT, allowNull: false, primaryKey: true, references: { model: { tableName: 'contacts', schema: 'sales_engine' }, key: 'id' } },
  added_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  schema: 'sales_engine',
  tableName: 'list_members',
  timestamps: false,
});

export default ListMember;
