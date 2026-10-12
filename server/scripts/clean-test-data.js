require('dotenv').config();
const pool = require('../config/db');

async function cleanTestData() {
  console.log('--- Cleaning test logins and actions created by alice & bob ---');

  // 1. Identify test user IDs
  const [testUsers] = await pool.query(`
    SELECT id, username, email FROM users
    WHERE username LIKE 'alice%'
       OR username LIKE 'bob%'
       OR email LIKE '%@collabry.test'
       OR email LIKE '%@test.com'
       OR email LIKE '%@example.com'
       OR username = 'demouser'
       OR username LIKE 'test_%'
       OR username LIKE 'host_%'
       OR username LIKE 'h179%'
  `);

  const testUserIds = testUsers.map(u => u.id);
  console.log(`Found ${testUserIds.length} test users to delete.`);

  if (testUserIds.length === 0) {
    console.log('No test users found.');
    process.exit(0);
  }

  const idsPlaceholder = testUserIds.map(() => '?').join(',');

  // 2. Identify communities created by test users (e.g. c/web3-builders-179...)
  const [testCommunities] = await pool.query(`
    SELECT id, slug, name FROM communities
    WHERE creator_id IN (${idsPlaceholder})
       OR slug LIKE 'web3-builders%'
  `, testUserIds);
  console.log(`Found ${testCommunities.length} test communities to clean up.`);

  if (testCommunities.length > 0) {
    const commIds = testCommunities.map(c => c.id);
    const commPlaceholder = commIds.map(() => '?').join(',');
    try { await pool.query(`DELETE FROM community_members WHERE community_id IN (${commPlaceholder})`, commIds); } catch(e){}
    try { await pool.query(`DELETE FROM posts WHERE community_id IN (${commPlaceholder})`, commIds); } catch(e){}
    try { await pool.query(`DELETE FROM communities WHERE id IN (${commPlaceholder})`, commIds); } catch(e){}
    console.log(`✅ Deleted test communities.`);
  }

  // 3. Identify projects created by test users
  const [testProjects] = await pool.query(`
    SELECT id, name FROM projects
    WHERE creator_id IN (${idsPlaceholder})
       OR name LIKE 'Building an Open-Source%'
  `, testUserIds);
  console.log(`Found ${testProjects.length} test projects to clean up.`);

  if (testProjects.length > 0) {
    const projIds = testProjects.map(p => p.id);
    const projPlaceholder = projIds.map(() => '?').join(',');
    
    try { await pool.query(`DELETE FROM project_canvas WHERE project_id IN (${projPlaceholder})`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM project_notes WHERE project_id IN (${projPlaceholder})`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM project_resources WHERE project_id IN (${projPlaceholder})`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM project_files WHERE project_id IN (${projPlaceholder})`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM files WHERE project_id IN (${projPlaceholder})`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM meeting_participants WHERE meeting_id IN (SELECT id FROM meetings WHERE project_id IN (${projPlaceholder}))`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM meetings WHERE project_id IN (${projPlaceholder})`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE project_id IN (${projPlaceholder}))`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM tasks WHERE project_id IN (${projPlaceholder})`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id IN (${projPlaceholder}))`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM conversation_members WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id IN (${projPlaceholder}))`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM conversations WHERE project_id IN (${projPlaceholder})`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM channels WHERE project_id IN (${projPlaceholder})`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM project_invitations WHERE project_id IN (${projPlaceholder})`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM project_members WHERE project_id IN (${projPlaceholder})`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM activity_logs WHERE project_id IN (${projPlaceholder})`, projIds); } catch(e){}
    try { await pool.query(`DELETE FROM projects WHERE id IN (${projPlaceholder})`, projIds); } catch(e){}
    console.log(`✅ Deleted test projects and workspaces.`);
  }

  // 4. Delete user actions across other tables for these test users
  try { await pool.query(`DELETE FROM live_broadcast_viewers WHERE user_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}
  try { await pool.query(`DELETE FROM live_broadcasts WHERE host_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}
  try { await pool.query(`DELETE FROM post_interests WHERE user_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}
  try { await pool.query(`DELETE FROM post_votes WHERE user_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}
  try { await pool.query(`DELETE FROM comment_votes WHERE user_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}
  try { await pool.query(`DELETE FROM comments WHERE author_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}
  try { await pool.query(`DELETE FROM posts WHERE author_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}
  try { await pool.query(`DELETE FROM messages WHERE sender_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}
  try { await pool.query(`DELETE FROM conversation_members WHERE user_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}
  try { await pool.query(`DELETE FROM notifications WHERE user_id IN (${idsPlaceholder}) OR actor_id IN (${idsPlaceholder})`, [...testUserIds, ...testUserIds]); } catch(e){}
  try { await pool.query(`DELETE FROM community_members WHERE user_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}
  try { await pool.query(`DELETE FROM user_skills WHERE user_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}
  try { await pool.query(`DELETE FROM alias_history WHERE user_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}
  try { await pool.query(`DELETE FROM email_otps WHERE user_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}
  try { await pool.query(`DELETE FROM refresh_tokens WHERE user_id IN (${idsPlaceholder})`, testUserIds); } catch(e){}

  // 5. Delete test users
  const [delRes] = await pool.query(`DELETE FROM users WHERE id IN (${idsPlaceholder})`, testUserIds);
  console.log(`🎉 Deleted ${delRes.affectedRows} test users!`);

  // Verify remaining users
  const [remaining] = await pool.query('SELECT id, username, email, name, email_verified, created_at FROM users ORDER BY id ASC');
  console.log('--- REMAINING USERS IN DATABASE ---');
  console.table(remaining);

  process.exit(0);
}

cleanTestData().catch(err => {
  console.error('Error cleaning test data:', err);
  process.exit(1);
});
