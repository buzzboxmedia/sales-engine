import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db.js';
import { createId } from '@paralleldrive/cuid2';

interface EmailTemplateAttributes {
  id: string;
  project: string;
  name: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  category: string;
  thumbnail_url: string | null;
  created_at: Date;
  updated_at: Date;
}

type EmailTemplateCreationAttributes = Optional<EmailTemplateAttributes,
  'id' | 'project' | 'text_body' | 'category' | 'thumbnail_url' | 'created_at' | 'updated_at'
>;

export class EmailTemplate extends Model<EmailTemplateAttributes, EmailTemplateCreationAttributes> implements EmailTemplateAttributes {
  declare id: string;
  declare project: string;
  declare name: string;
  declare subject: string;
  declare html_body: string;
  declare text_body: string | null;
  declare category: string;
  declare thumbnail_url: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

EmailTemplate.init({
  id: { type: DataTypes.TEXT, primaryKey: true, defaultValue: () => createId() },
  project: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'talkspresso' },
  name: { type: DataTypes.TEXT, allowNull: false },
  subject: { type: DataTypes.TEXT, allowNull: false },
  html_body: { type: DataTypes.TEXT, allowNull: false },
  text_body: { type: DataTypes.TEXT },
  category: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'outreach' },
  thumbnail_url: { type: DataTypes.TEXT },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  schema: 'sales_engine',
  tableName: 'email_templates',
  timestamps: false,
  indexes: [
    { fields: ['project'] },
    { fields: ['category'] },
  ],
});

export default EmailTemplate;
