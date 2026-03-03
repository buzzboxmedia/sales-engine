import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db.js';
import { createId } from '@paralleldrive/cuid2';

interface CompanyAttributes {
  id: string;
  project: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  website: string | null;
  linkedin_url: string | null;
  metadata: object;
  created_at: Date;
  updated_at: Date;
}

type CompanyCreationAttributes = Optional<CompanyAttributes,
  'id' | 'project' | 'domain' | 'industry' | 'size' | 'website' | 'linkedin_url' |
  'metadata' | 'created_at' | 'updated_at'
>;

export class Company extends Model<CompanyAttributes, CompanyCreationAttributes> implements CompanyAttributes {
  declare id: string;
  declare project: string;
  declare name: string;
  declare domain: string | null;
  declare industry: string | null;
  declare size: string | null;
  declare website: string | null;
  declare linkedin_url: string | null;
  declare metadata: object;
  declare created_at: Date;
  declare updated_at: Date;
}

Company.init({
  id: { type: DataTypes.TEXT, primaryKey: true, defaultValue: () => createId() },
  project: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'talkspresso' },
  name: { type: DataTypes.TEXT, allowNull: false },
  domain: { type: DataTypes.TEXT },
  industry: { type: DataTypes.TEXT },
  size: { type: DataTypes.TEXT },
  website: { type: DataTypes.TEXT },
  linkedin_url: { type: DataTypes.TEXT },
  metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  schema: 'sales_engine',
  tableName: 'companies',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['project', 'domain'] },
    { fields: ['project'] },
  ],
});

export default Company;
