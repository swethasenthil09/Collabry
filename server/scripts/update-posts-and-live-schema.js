const pool = require('../config/db');

async function migrate() {
  console.log('Migrating database schema for posts & live sessions...');
  try {
    // 1. Update posts table
    try {
      await pool.query('ALTER TABLE posts MODIFY community_id INT NULL');
      console.log('✅ Modified posts.community_id to allow NULL');
    } catch (e) {
      console.log('Notice: posts.community_id modification:', e.message);
    }

    try {
      await pool.query('ALTER TABLE posts ADD COLUMN custom_category VARCHAR(100) NULL');
      console.log('✅ Added posts.custom_category');
    } catch (e) {
      console.log('Notice: custom_category already exists or skipped:', e.message);
    }

    try {
      await pool.query('ALTER TABLE posts ADD COLUMN media_url VARCHAR(500) NULL');
      console.log('✅ Added posts.media_url');
    } catch (e) {
      console.log('Notice: media_url already exists or skipped:', e.message);
    }

    try {
      await pool.query('ALTER TABLE posts ADD COLUMN media_type VARCHAR(20) NULL');
      console.log('✅ Added posts.media_type');
    } catch (e) {
      console.log('Notice: media_type already exists or skipped:', e.message);
    }

    // 2. Update live_sessions table
    try {
      await pool.query("ALTER TABLE live_sessions ADD COLUMN session_type ENUM('video', 'voice') DEFAULT 'video'");
      console.log('✅ Added live_sessions.session_type');
    } catch (e) {
      console.log('Notice: session_type already exists or skipped:', e.message);
    }

    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
