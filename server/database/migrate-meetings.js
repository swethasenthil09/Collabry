const pool = require('../config/db');

async function migrateMeetings() {
  console.log('🚀 Running Module 13 Meetings Migration...');

  try {
    // 1. Create meetings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        organizer_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        meeting_url VARCHAR(500) DEFAULT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        agenda TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL DEFAULT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_project_meetings (project_id, start_time)
      ) ENGINE=InnoDB;
    `);
    console.log('✅ Created `meetings` table');

    // 2. Create meeting_attendees table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meeting_attendees (
        id INT AUTO_INCREMENT PRIMARY KEY,
        meeting_id INT NOT NULL,
        user_id INT NOT NULL,
        status ENUM('invited', 'accepted', 'declined', 'tentative') DEFAULT 'invited',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_meeting_attendee (meeting_id, user_id)
      ) ENGINE=InnoDB;
    `);
    console.log('✅ Created `meeting_attendees` table');

    console.log('🎉 Meetings tables successfully created and ready!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrateMeetings();
