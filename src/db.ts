import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

export const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: { rejectUnauthorized: false },
  },
  schema: 'sales_engine',
});

export default sequelize;
