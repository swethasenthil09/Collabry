const pool = require('../config/db');

const API_BASE = 'http://localhost:5000/api/v1';

async function req(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
  } else {
    data = await res.text();
  }
  return { status: res.status, ok: res.ok, data };
}

async function runSet3Tests() {
  console.log('🧪 Starting Set 3 & Full System Verification Suite...\n');

  try {
    const ts = Date.now();
    const user1Email = `tester1_${ts}@collabry.test`;
    const user2Email = `tester2_${ts}@collabry.test`;

    // 1. Register test users
    const u1Reg = await req('/auth/register', {
      method: 'POST',
      body: {
        username: `dev_${ts}`,
        email: user1Email,
        password: 'Password123!',
        name: 'Developer One',
      },
    });
    const token1 = u1Reg.data.accessToken;
    const user1Id = u1Reg.data.user.id;

    const u2Reg = await req('/auth/register', {
      method: 'POST',
      body: {
        username: `peer_${ts}`,
        email: user2Email,
        password: 'Password123!',
        name: 'Peer Two',
      },
    });
    const token2 = u2Reg.data.accessToken;
    const user2Id = u2Reg.data.user.id;

    const auth1 = { headers: { Authorization: `Bearer ${token1}` } };
    const auth2 = { headers: { Authorization: `Bearer ${token2}` } };

    console.log(`✅ Step 1: Users created (Dev: ${user1Id}, Peer: ${user2Id})`);

    // 2. Custom User Status Test
    console.log('Testing custom status updates...');
    const statusUpdateRes = await req('/users/status', {
      method: 'PATCH',
      ...auth1,
      body: {
        status_text: 'Building Set 3 features',
        status_emoji: '⚡',
      },
    });

    if (statusUpdateRes.ok && statusUpdateRes.data.custom_status_text === 'Building Set 3 features' && statusUpdateRes.data.custom_status_emoji === '⚡') {
      console.log('✅ Step 2: Custom status updated via PATCH /users/status');
    } else {
      throw new Error(`Custom status update failed: ${JSON.stringify(statusUpdateRes.data)}`);
    }

    // Verify status in user profile
    const profileRes = await req(`/users/${user1Id}/portfolio`, { method: 'GET', ...auth2 });
    if (profileRes.ok && profileRes.data.custom_status_text === 'Building Set 3 features' && profileRes.data.custom_status_emoji === '⚡') {
      console.log('✅ Step 3: Public profile reflects custom_status_text and custom_status_emoji');
    } else {
      throw new Error(`Profile does not reflect status: ${JSON.stringify(profileRes.data)}`);
    }

    // 3. Post & Comment Emoji Reactions
    console.log('Testing post and comment emoji reactions...');
    const postRes = await req('/posts', {
      method: 'POST',
      ...auth1,
      body: {
        title: `Set 3 Showcase Post ${ts}`,
        body: 'Testing comment emoji reactions and discussions.',
        post_type: 'discussion',
        identity_mode: 'public',
      },
    });
    const postId = postRes.data.id;

    // Dev adds a comment
    const commentRes = await req(`/posts/${postId}/comments`, {
      method: 'POST',
      ...auth1,
      body: {
        body: 'This is a test comment for emoji reactions! 🚀',
        identity_mode: 'public',
      },
    });
    const commentId = commentRes.data.id;
    console.log(`✅ Step 4: Post and comment created (Comment ID: ${commentId})`);

    // Dev reacts with 🚀
    const react1 = await req(`/posts/comments/${commentId}/reactions`, {
      method: 'POST',
      ...auth1,
      body: { emoji: '🚀' },
    });
    if (react1.ok && react1.data.reactions.some(r => r.emoji === '🚀' && r.count === 1 && r.has_reacted === true)) {
      console.log('✅ Step 5: User 1 added 🚀 reaction to comment (count: 1)');
    } else {
      throw new Error(`User 1 reaction failed: ${JSON.stringify(react1.data)}`);
    }

    // Peer reacts with 🚀 and ❤️
    const react2 = await req(`/posts/comments/${commentId}/reactions`, {
      method: 'POST',
      ...auth2,
      body: { emoji: '🚀' },
    });
    const react3 = await req(`/posts/comments/${commentId}/reactions`, {
      method: 'POST',
      ...auth2,
      body: { emoji: '❤️' },
    });
    const rocketReaction = react3.data.reactions.find(r => r.emoji === '🚀');
    const heartReaction = react3.data.reactions.find(r => r.emoji === '❤️');
    if (rocketReaction && rocketReaction.count === 2 && heartReaction && heartReaction.count === 1) {
      console.log('✅ Step 6: User 2 added 🚀 and ❤️ reactions (🚀 count: 2, ❤️ count: 1)');
    } else {
      throw new Error(`User 2 reactions failed: ${JSON.stringify(react3.data)}`);
    }

    // User 1 toggles 🚀 off
    const reactToggle = await req(`/posts/comments/${commentId}/reactions`, {
      method: 'POST',
      ...auth1,
      body: { emoji: '🚀' },
    });
    const rocketAfterToggle = reactToggle.data.reactions.find(r => r.emoji === '🚀');
    if (rocketAfterToggle && rocketAfterToggle.count === 1 && rocketAfterToggle.has_reacted === false) {
      console.log('✅ Step 7: User 1 removed 🚀 reaction (count reduced to 1, has_reacted: false)');
    } else {
      throw new Error(`Reaction toggle failed: ${JSON.stringify(reactToggle.data)}`);
    }

    // Verify GET /posts/:id includes comments with reactions
    const fullPostRes = await req(`/posts/${postId}`, { method: 'GET', ...auth2 });
    const targetComment = fullPostRes.data.comments.find(c => c.id === commentId);
    if (targetComment && targetComment.reactions.length > 0) {
      console.log('✅ Step 8: GET /posts/:id successfully returned comments with structured reactions');
    } else {
      throw new Error(`Post details missing comment reactions: ${JSON.stringify(fullPostRes.data)}`);
    }

    // 4. Workspace Data Export Tests
    console.log('Testing workspace data exports (Tasks, Chat, Backup)...');
    const createWsRes = await req('/projects', {
      method: 'POST',
      ...auth1,
      body: {
        name: `Export Workspace ${ts}`,
        description: 'Testing export functionality',
        visibility: 'private',
        join_mode: 'invite',
      },
    });
    const wsId = createWsRes.data.id;

    // Add a task
    await req(`/projects/${wsId}/tasks`, {
      method: 'POST',
      ...auth1,
      body: {
        title: 'Complete Set 3 verification',
        description: 'Verify all features end-to-end',
        priority: 'high',
        status: 'in_progress',
      },
    });

    // Fetch workspace to get general channel
    const wsDetailsRes = await req(`/projects/${wsId}`, { method: 'GET', ...auth1 });
    const channelId = wsDetailsRes.data.channels?.[0]?.id;

    // Send a message to the channel
    const msgRes = await req(`/messages/${channelId}`, {
      method: 'POST',
      ...auth1,
      body: {
        body: 'Hello team, export archive test message!',
      },
    });

    // Non-member unauthorized export check
    const unauthorizedExport = await req(`/projects/${wsId}/export/tasks?format=csv`, {
      method: 'GET',
      ...auth2,
    });
    if (unauthorizedExport.status === 403) {
      console.log('✅ Step 9: Unauthorized non-member export blocked with 403 Forbidden');
    } else {
      throw new Error(`Expected 403 for non-member export, got ${unauthorizedExport.status}`);
    }

    // Member export tasks (CSV)
    const exportTasksRes = await req(`/projects/${wsId}/export/tasks?format=csv`, {
      method: 'GET',
      ...auth1,
    });
    if (exportTasksRes.ok && typeof exportTasksRes.data === 'string' && exportTasksRes.data.includes('Complete Set 3 verification')) {
      console.log('✅ Step 10: Tasks CSV export succeeded and contains task data');
    } else {
      throw new Error(`Tasks export failed: ${exportTasksRes.status}`);
    }

    // Member export chat (TXT)
    const exportChatRes = await req(`/projects/${wsId}/export/chat?format=txt`, {
      method: 'GET',
      ...auth1,
    });
    if (exportChatRes.ok && typeof exportChatRes.data === 'string' && exportChatRes.data.includes('export archive test message!')) {
      console.log('✅ Step 11: Chat TXT export succeeded and contains message transcript');
    } else {
      throw new Error(`Chat export failed: ${exportChatRes.status}`);
    }

    // Member export backup (JSON)
    const exportBackupRes = await req(`/projects/${wsId}/export/backup?format=json`, {
      method: 'GET',
      ...auth1,
    });
    if (exportBackupRes.ok && exportBackupRes.data.project && exportBackupRes.data.tasks) {
      console.log('✅ Step 12: Full Workspace JSON backup export succeeded');
    } else {
      throw new Error(`Backup export failed: ${exportBackupRes.status}`);
    }

    // 5. Clean up test records
    await pool.query('DELETE FROM users WHERE id IN (?, ?)', [user1Id, user2Id]);
    await pool.query('DELETE FROM posts WHERE id = ?', [postId]);
    await pool.query('DELETE FROM projects WHERE id = ?', [wsId]);
    console.log('🧹 Cleaned up temporary test data');

    console.log('\n🎉 ALL SET 3 AND SYSTEM ENHANCEMENT TESTS PASSED PERFECTLY! 🚀');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Set 3 test failed:', err);
    process.exit(1);
  }
}

runSet3Tests();
