require('dotenv').config();
const pool = require('../config/db');

async function migrateReportsAndAdmin() {
  console.log('--- Migrating Database for Reports & System Admin System ---');

  // 1. Add moderation columns to users table
  const [userCols] = await pool.query('DESCRIBE users');
  const userColNames = userCols.map(c => c.Field);

  if (!userColNames.includes('role')) {
    await pool.query("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'");
    console.log('✅ Added role column to users');
  }

  if (!userColNames.includes('status')) {
    await pool.query("ALTER TABLE users ADD COLUMN status ENUM('active','frozen','blocked') NOT NULL DEFAULT 'active'");
    console.log('✅ Added status column to users');
  }

  if (!userColNames.includes('frozen_until')) {
    await pool.query("ALTER TABLE users ADD COLUMN frozen_until DATETIME DEFAULT NULL");
    console.log('✅ Added frozen_until column to users');
  }

  if (!userColNames.includes('freeze_reason')) {
    await pool.query("ALTER TABLE users ADD COLUMN freeze_reason TEXT DEFAULT NULL");
    console.log('✅ Added freeze_reason column to users');
  }

  if (!userColNames.includes('report_count')) {
    await pool.query("ALTER TABLE users ADD COLUMN report_count INT NOT NULL DEFAULT 0");
    console.log('✅ Added report_count column to users');
  }

  // Grant admin role to site owners/admins
  await pool.query(`
    UPDATE users 
    SET role = 'admin' 
    WHERE username IN ('goshh', 'swarna', 'summer@09', 'demodeveloper')
       OR email IN ('swethasenthil.0910@gmail.com', 'swethasenthil.07910@gmail.com', 'gomthaguys@gmail.com')
  `);
  console.log('✅ Designated system admins');

  // 2. Enhance reports table
  const [reportCols] = await pool.query('DESCRIBE reports');
  const reportColNames = reportCols.map(c => c.Field);

  if (!reportColNames.includes('reported_user_id')) {
    await pool.query("ALTER TABLE reports ADD COLUMN reported_user_id INT DEFAULT NULL AFTER target_id");
    console.log('✅ Added reported_user_id to reports');
  }

  if (!reportColNames.includes('reason_category')) {
    await pool.query("ALTER TABLE reports ADD COLUMN reason_category VARCHAR(100) DEFAULT NULL AFTER reason");
    console.log('✅ Added reason_category to reports');
  }

  if (!reportColNames.includes('action_taken')) {
    await pool.query("ALTER TABLE reports ADD COLUMN action_taken VARCHAR(100) DEFAULT NULL");
    console.log('✅ Added action_taken to reports');
  }

  if (!reportColNames.includes('admin_notes')) {
    await pool.query("ALTER TABLE reports ADD COLUMN admin_notes TEXT DEFAULT NULL");
    console.log('✅ Added admin_notes to reports');
  }

  // 3. Create unfreeze_appeals table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS unfreeze_appeals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      reason TEXT NOT NULL,
      status ENUM('pending','approved','rejected') DEFAULT 'pending',
      admin_notes TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP NULL,
      reviewed_by INT DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
  console.log('✅ Created unfreeze_appeals table');

  // 4. Clean up development-time seed notifications & test activity logs
  // Keep only authentic user interactions
  const [delNotifs] = await pool.query(`
    DELETE FROM notifications 
    WHERE body LIKE '%Test review%' 
       OR body LIKE '%Real Google Meet Sync Test%'
       OR body LIKE '%im very intelligent student%'
  `);
  console.log(`✅ Cleaned up ${delNotifs.affectedRows} development-time test notifications`);

  console.log('🎉 Migration completed successfully!');
  process.exit(0);
}

migrateReportsAndAdmin().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
