const mysql = require('mysql2/promise');

async function testConnection() {
  try {
    console.log('Testing connection to TiDB Cloud...');
    const connection = await mysql.createConnection({
      host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
      port: 4000,
      user: '2cEv7a8Gmx71hye.root',
      password: 'ksyYMtD1AC50v6bG',
      ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      },
    });

    console.log('✅ Connected to TiDB Cloud successfully!');
    
    // Create 'collabry' database if it doesn't exist
    await connection.query('CREATE DATABASE IF NOT EXISTS collabry');
    console.log('✅ Database "collabry" created or verified.');
    
    await connection.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection error:', err);
    process.exit(1);
  }
}

testConnection();
