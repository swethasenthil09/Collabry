const pool = require('../config/db');

async function init() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        host_id INT NOT NULL,
        community_id INT NULL,
        status ENUM('live', 'ended') DEFAULT 'live',
        viewer_count INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP NULL,
        FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ live_sessions table created successfully');
  } catch (err) {
    console.error('Error creating live_sessions table:', err);
  } finally {
    await pool.end();
  }
}

init();
