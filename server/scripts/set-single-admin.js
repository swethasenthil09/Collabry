const pool = require('../config/db');

async function setSingleAdmin() {
  try {
    // Demote all users to 'user' except admin@09
    await pool.query('UPDATE users SET role = "user" WHERE username != ?', ['admin@09']);
    await pool.query('UPDATE users SET role = "admin" WHERE username = ?', ['admin@09']);

    const [admins] = await pool.query(
      'SELECT id, username, email, role, status FROM users WHERE role = "admin"'
    );
    console.log('✅ Current System Admin(s):', admins);
    process.exit(0);
  } catch (err) {
    console.error('Error updating admin role:', err);
    process.exit(1);
  }
}

setSingleAdmin();
