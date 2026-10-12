const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function createAdmin() {
  try {
    const username = 'admin@09';
    const email = 'admin09@collabry.io';
    const password = 'adminpwd09@';
    const passwordHash = await bcrypt.hash(password, 12);

    const [existing] = await pool.query(
      'SELECT id, username, email FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE users SET username = ?, email = ?, password_hash = ?, role = "admin", status = "active", email_verified = 1 WHERE id = ?',
        [username, email, passwordHash, existing[0].id]
      );
      console.log('✅ Successfully updated system admin user (ID:', existing[0].id, ')');
    } else {
      const [res] = await pool.query(
        'INSERT INTO users (username, email, password_hash, name, alias, role, status, email_verified, report_count) VALUES (?, ?, ?, ?, ?, "admin", "active", 1, 0)',
        [username, email, passwordHash, 'System Admin', 'Admin_09']
      );
      console.log('✅ Successfully created dedicated system admin user (ID:', res.insertId, ')');
    }
    process.exit(0);
  } catch (err) {
    console.error('Error creating admin:', err);
    process.exit(1);
  }
}

createAdmin();
