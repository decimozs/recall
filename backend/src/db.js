import pg from 'pg';
const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://quiz:quiz@localhost:5432/notion_quiz' });
export const query = (text, params) => pool.query(text, params);
