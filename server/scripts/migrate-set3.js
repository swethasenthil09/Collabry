// Migration script for Set 3 & Full System Enhancements
const pool = require('../config/db');

async function migrateSet3() {
  console.log('🔄 Running Set 3 & System Enhancements database migration...');

  try {
    // 1. Create comment_reactions table for rich emoji reactions on comments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comment_reactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        comment_id INT NOT NULL,
        user_id INT NOT NULL,
        emoji VARCHAR(32) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_comment_user_emoji (comment_id, user_id, emoji),
        INDEX idx_comment_reactions (comment_id)
      ) ENGINE=InnoDB;
    `);
    console.log('✅ Verified comment_reactions table');

    // 2. Add custom status text and status emoji to users table
    const [statusCols] = await pool.query(`SHOW COLUMNS FROM users LIKE 'custom_status_text'`);
    if (statusCols.length === 0) {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN custom_status_text VARCHAR(120) NULL DEFAULT NULL AFTER pinned_project_id,
        ADD COLUMN custom_status_emoji VARCHAR(16) NULL DEFAULT NULL AFTER custom_status_text
      `);
      console.log('✅ Added custom_status_text and custom_status_emoji columns to users table');
    } else {
      console.log('ℹ️ User status columns already exist');
    }

    console.log('🎉 Set 3 database migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrateSet3();
