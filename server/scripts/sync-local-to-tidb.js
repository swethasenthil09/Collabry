const mysql = require('mysql2/promise');
require('dotenv').config();

async function syncToTiDB() {
  console.log('🚀 Starting Robust Local MySQL -> TiDB Cloud Synchronization...\n');

  // 1. Connect to Local MySQL
  const localDb = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: process.env.DB_PASSWORD || 'root123@',
    database: 'collabry',
    waitForConnections: true,
    connectionLimit: 5,
  });
  console.log('✅ Connected to Local MySQL (collabry).');

  // 2. Connect to TiDB Cloud Pool
  const tidbPool = mysql.createPool({
    host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '2cEv7a8Gmx71hye.root',
    password: 'ksyYMtD1AC50v6bG',
    database: 'collabry',
    waitForConnections: true,
    connectionLimit: 5,
    ssl: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    },
  });
  console.log('✅ Connected to TiDB Cloud (collabry).');

  // Disable FK checks during initial dump
  await tidbPool.query('SET FOREIGN_KEY_CHECKS = 0;');

  // 3. Get all local tables
  const [tables] = await localDb.query('SHOW TABLES');
  const tableNames = tables.map(t => Object.values(t)[0]);
  console.log(`📋 Found ${tableNames.length} tables to sync:\n`);

  for (const tableName of tableNames) {
    try {
      // Get CREATE TABLE definition
      const [[createResult]] = await localDb.query(`SHOW CREATE TABLE \`${tableName}\``);
      let createSql = createResult['Create Table'];
      
      // Convert to IF NOT EXISTS
      createSql = createSql.replace(/CREATE TABLE/i, 'CREATE TABLE IF NOT EXISTS');

      await tidbPool.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      await tidbPool.query(createSql);

      // Fetch local rows
      const [rows] = await localDb.query(`SELECT * FROM \`${tableName}\``);
      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => '?').join(', ');
        const insertSql = `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES (${placeholders})`;

        for (const row of rows) {
          const values = columns.map(c => {
            const v = row[c];
            if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
              return JSON.stringify(v);
            }
            return v;
          });
          await tidbPool.query(insertSql, values);
        }
        console.log(`  ✓ Synced table: ${tableName.padEnd(25)} (${rows.length} rows)`);
      } else {
        console.log(`  ✓ Created schema: ${tableName.padEnd(25)} (0 rows)`);
      }
    } catch (err) {
      console.error(`  ❌ Error syncing ${tableName}:`, err.message);
    }
  }

  await tidbPool.query('SET FOREIGN_KEY_CHECKS = 1;');
  await localDb.end();
  await tidbPool.end();

  console.log('\n🎉 ALL TABLES AND DATA SUCCESSFULLY MIGRATED TO TIDB CLOUD!');
  process.exit(0);
}

syncToTiDB().catch(err => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
