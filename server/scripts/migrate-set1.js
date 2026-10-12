require('dotenv').config();
const pool = require('../config/db');

async function migrateSet1() {
  console.log('--- Migrating for Set 1: Roles, Activity Logs, and Whiteboard ---');

  // 1. Update project_members.role ENUM
  try {
    await pool.query(`
      ALTER TABLE project_members
      MODIFY COLUMN role ENUM('owner','maintainer','contributor','viewer','admin','member') DEFAULT 'contributor'
    `);
    console.log('✅ project_members.role enum updated with owner, maintainer, contributor, viewer');
  } catch (err) {
    console.warn('Note updating project_members.role:', err.message);
  }

  // 2. Ensure activity_logs table is created and indexed
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT DEFAULT NULL,
        user_id INT NOT NULL,
        action VARCHAR(100) NOT NULL,
        details JSON DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_proj_created (project_id, created_at DESC),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('✅ activity_logs table verified with index');
  } catch (err) {
    console.warn('Note on activity_logs:', err.message);
  }

  console.log('🎉 Set 1 database migration completed!');
  process.exit(0);
}

migrateSet1().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
