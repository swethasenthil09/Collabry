const pool = require('../config/db');

async function migrate() {
  console.log('Running migration for Items 3, 4, 5...');

  // 1. Group DMs enhancements on conversations & conversation_members
  try {
    await pool.query('ALTER TABLE conversations ADD COLUMN avatar_url VARCHAR(500) NULL');
    console.log('Added avatar_url to conversations');
  } catch (e) {
    console.log('conversations.avatar_url already exists or note:', e.message);
  }

  try {
    await pool.query('ALTER TABLE conversations ADD COLUMN created_by INT NULL');
    console.log('Added created_by to conversations');
  } catch (e) {
    console.log('conversations.created_by already exists or note:', e.message);
  }

  try {
    await pool.query("ALTER TABLE conversation_members ADD COLUMN role ENUM('admin','member') DEFAULT 'member'");
    console.log('Added role to conversation_members');
  } catch (e) {
    console.log('conversation_members.role already exists or note:', e.message);
  }

  // 2. Rich User Profile & Portfolio enhancements on users
  const userColumns = [
    'banner_url VARCHAR(500) NULL',
    'github_url VARCHAR(255) NULL',
    'linkedin_url VARCHAR(255) NULL',
    'twitter_url VARCHAR(255) NULL',
    'portfolio_url VARCHAR(255) NULL',
    'pinned_project_id INT NULL',
  ];

  for (const col of userColumns) {
    const colName = col.split(' ')[0];
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN ${col}`);
      console.log(`Added ${colName} to users`);
    } catch (e) {
      console.log(`users.${colName} already exists or note:`, e.message);
    }
  }

  console.log('Migration completed successfully!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
