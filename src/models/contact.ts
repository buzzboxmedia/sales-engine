import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db.js';
import { createId } from '@paralleldrive/cuid2';

interface ContactAttributes {
  id: string;
  project: string;
  email: string;
  name: string | null;
  first_name: string | null;
  company: string | null;
  title: string | null;
  platform: string | null;
  niche: string | null;
  profile_url: string | null;
  followers: number | null;
  source: string;
  status: string;
  talkspresso_user_id: string | null;
  suppressed: boolean;
  tags: string[];
  notes: object | null;
  metadata: object | null;
  created_at: Date;
  updated_at: Date;
}

type ContactCreationAttributes = Optional<ContactAttributes,
  'id' | 'project' | 'name' | 'first_name' | 'company' | 'title' | 'platform' |
  'niche' | 'profile_url' | 'followers' | 'source' | 'status' | 'talkspresso_user_id' |
  'suppressed' | 'tags' | 'notes' | 'metadata' | 'created_at' | 'updated_at'
>;

export class Contact extends Model<ContactAttributes, ContactCreationAttributes> implements ContactAttributes {
  declare id: string;
  declare project: string;
  declare email: string;
  declare name: string | null;
  declare first_name: string | null;
  declare company: string | null;
  declare title: string | null;
  declare platform: string | null;
  declare niche: string | null;
  declare profile_url: string | null;
  declare followers: number | null;
  declare source: string;
  declare status: string;
  declare talkspresso_user_id: string | null;
  declare suppressed: boolean;
  declare tags: string[];
  declare notes: object | null;
  declare metadata: object | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Contact.init({
  id: { type: DataTypes.TEXT, primaryKey: true, defaultValue: () => createId() },
  project: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'talkspresso' },
  email: { type: DataTypes.TEXT, allowNull: false },
  name: { type: DataTypes.TEXT },
  first_name: { type: DataTypes.TEXT },
  company: { type: DataTypes.TEXT },
  title: { type: DataTypes.TEXT },
  platform: { type: DataTypes.TEXT },
  niche: { type: DataTypes.TEXT },
  profile_url: { type: DataTypes.TEXT },
  followers: { type: DataTypes.INTEGER },
  source: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'manual' },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'new' },
  talkspresso_user_id: { type: DataTypes.TEXT },
  suppressed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  tags: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
  notes: { type: DataTypes.JSONB },
  metadata: { type: DataTypes.JSONB },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  schema: 'sales_engine',
  tableName: 'contacts',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['project', 'email'] },
    { fields: ['status'] },
    { fields: ['project'] },
    { fields: ['talkspresso_user_id'] },
  ],
});

export default Contact;
