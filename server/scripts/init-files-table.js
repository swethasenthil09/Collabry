const pool = require('../config/db');

async function initFiles() {
  const sql = `
    CREATE TABLE IF NOT EXISTS files (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      uploader_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      file_url VARCHAR(500) NOT NULL,
      file_size BIGINT NOT NULL DEFAULT 0,
      mime_type VARCHAR(100) DEFAULT NULL,
      category VARCHAR(50) DEFAULT 'document',
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      folder_path VARCHAR(255) DEFAULT NULL,
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await pool.query(sql);
  console.log('✅ files table initialized successfully');
  process.exit(0);
}

initFiles().catch(err => {
  console.error('Failed to init files table:', err);
  process.exit(1);
});
