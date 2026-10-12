const pool = require('../config/db');

async function migrate() {
  console.log('Running migration for Canvas, Notes, and Rich DMs...');

  // 1. project_canvas table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_canvas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        canvas_data LONGTEXT NULL,
        updated_by INT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_project_canvas (project_id)
      )
    `);
    console.log('✅ project_canvas table created / verified');
  } catch (e) {
    console.warn('project_canvas note:', e.message);
  }

  // 2. project_notes table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        title VARCHAR(255) DEFAULT 'Project Notes & Architecture Specs',
        content LONGTEXT NULL,
        updated_by INT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_project_notes (project_id)
      )
    `);
    console.log('✅ project_notes table created / verified');
  } catch (e) {
    console.warn('project_notes note:', e.message);
  }

  // 3. messages table columns: status, read_at, message_type, media_url, duration
  try {
    await pool.query("ALTER TABLE messages ADD COLUMN status ENUM('sent','delivered','read') DEFAULT 'sent'");
    console.log('✅ Added status to messages');
  } catch (e) {
    console.log('status column note:', e.message);
  }

  try {
    await pool.query('ALTER TABLE messages ADD COLUMN read_at DATETIME NULL');
    console.log('✅ Added read_at to messages');
  } catch (e) {
    console.log('read_at column note:', e.message);
  }

  try {
    await pool.query("ALTER TABLE messages ADD COLUMN message_type ENUM('text','audio') DEFAULT 'text'");
    console.log('✅ Added message_type to messages');
  } catch (e) {
    console.log('message_type column note:', e.message);
  }

  try {
    await pool.query('ALTER TABLE messages ADD COLUMN media_url LONGTEXT NULL');
    console.log('✅ Added media_url to messages');
  } catch (e) {
    console.log('media_url column note:', e.message);
  }

  try {
    await pool.query('ALTER TABLE messages ADD COLUMN duration INT NULL');
    console.log('✅ Added duration to messages');
  } catch (e) {
    console.log('duration column note:', e.message);
  }

  console.log('🎉 Database migrations completed successfully!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
