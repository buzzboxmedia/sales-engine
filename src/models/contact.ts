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
  // v2 columns
  company_id: string | null;
  lead_score: number;
  last_activity_at: Date | null;
  linkedin_url: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
}

type ContactCreationAttributes = Optional<ContactAttributes,
  'id' | 'project' | 'name' | 'first_name' | 'company' | 'title' | 'platform' |
  'niche' | 'profile_url' | 'followers' | 'source' | 'status' | 'talkspresso_user_id' |
  'suppressed' | 'tags' | 'notes' | 'metadata' | 'created_at' | 'updated_at' |
  'company_id' | 'lead_score' | 'last_activity_at' | 'linkedin_url' | 'phone' |
  'city' | 'state' | 'avatar_url'
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
  // v2 columns
  declare company_id: string | null;
  declare lead_score: number;
  declare last_activity_at: Date | null;
  declare linkedin_url: string | null;
  declare phone: string | null;
  declare city: string | null;
  declare state: string | null;
  declare avatar_url: string | null;
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
  // v2 columns
  company_id: { type: DataTypes.TEXT, references: { model: { tableName: 'companies', schema: 'sales_engine' }, key: 'id' } },
  lead_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  last_activity_at: { type: DataTypes.DATE },
  linkedin_url: { type: DataTypes.TEXT },
  phone: { type: DataTypes.TEXT },
  city: { type: DataTypes.TEXT },
  state: { type: DataTypes.TEXT },
  avatar_url: { type: DataTypes.TEXT },
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
    { fields: ['company_id'] },
    { fields: ['lead_score'] },
    { fields: ['last_activity_at'] },
  ],
});

export default Contact;
