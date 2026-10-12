const mysql = require('mysql2/promise');
require('dotenv').config();

const useSsl = process.env.DB_SSL === 'true' || 
  process.env.DB_PORT == 4000 || 
  (process.env.DB_HOST && (process.env.DB_HOST.includes('tidb') || process.env.DB_HOST.includes('aiven')));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'collabry',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  ...(useSsl ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } } : {}),
});

module.exports = pool;
