// Migration script for Set 2 & Workspace enhancements
const pool = require('../config/db');

async function migrateSet2() {
  console.log('🔄 Running Set 2 & Workspace enhancements database migration...');

  try {
    // 1. Ensure project_invitations has 'declined' status
    await pool.query(`
      ALTER TABLE project_invitations
      MODIFY COLUMN status ENUM('pending','accepted','declined','cancelled') DEFAULT 'pending'
    `);
    console.log('✅ Updated project_invitations status enum');

    // 2. Add project_id to posts table if it does not exist
    const [postsCols] = await pool.query(`SHOW COLUMNS FROM posts LIKE 'project_id'`);
    if (postsCols.length === 0) {
      await pool.query(`
        ALTER TABLE posts
        ADD COLUMN project_id INT NULL DEFAULT NULL AFTER community_id,
        ADD CONSTRAINT fk_posts_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        ADD INDEX idx_posts_project (project_id)
      `);
      console.log('✅ Added project_id column to posts table');
    } else {
      console.log('ℹ️ project_id column already exists on posts table');
    }

    // 3. Create project_join_requests table for "Interested / Request to Join" workflow
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_join_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        user_id INT NOT NULL,
        message TEXT DEFAULT NULL,
        skills_offered JSON DEFAULT NULL,
        status ENUM('pending','accepted','declined') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_project_join_req (project_id, user_id),
        INDEX idx_pjr_status (project_id, status)
      ) ENGINE=InnoDB;
    `);
    console.log('✅ Verified project_join_requests table');

    // 4. Create saved_posts table for Bookmarks Hub
    await pool.query(`
      CREATE TABLE IF NOT EXISTS saved_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        post_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_saved_post (user_id, post_id),
        INDEX idx_saved_posts_user (user_id, created_at DESC)
      ) ENGINE=InnoDB;
    `);
    console.log('✅ Verified saved_posts table');

    // 5. Create message_reactions table for Rich Emoji Reactions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id INT NOT NULL,
        user_id INT NOT NULL,
        emoji VARCHAR(32) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_msg_user_emoji (message_id, user_id, emoji),
        INDEX idx_msg_reactions (message_id)
      ) ENGINE=InnoDB;
    `);
    console.log('✅ Verified message_reactions table');

    console.log('🎉 Set 2 database migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrateSet2();
