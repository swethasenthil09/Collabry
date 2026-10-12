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
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runSet2Tests() {
  console.log('🧪 Starting Set 2 & Workspace Privacy / Decline Verification Suite...\n');

  try {
    const ts = Date.now();
    const user1Email = `user1_${ts}@collabry.test`;
    const user2Email = `user2_${ts}@collabry.test`;

    const u1Reg = await req('/auth/register', {
      method: 'POST',
      body: {
        username: `lead_${ts}`,
        email: user1Email,
        password: 'Password123!',
        name: 'Workspace Lead',
      },
    });
    const token1 = u1Reg.data.accessToken;
    const user1Id = u1Reg.data.user.id;

    const u2Reg = await req('/auth/register', {
      method: 'POST',
      body: {
        username: `visitor_${ts}`,
        email: user2Email,
        password: 'Password123!',
        name: 'Visitor Alice',
      },
    });
    const token2 = u2Reg.data.accessToken;
    const user2Id = u2Reg.data.user.id;

    const auth1 = { headers: { Authorization: `Bearer ${token1}` } };
    const auth2 = { headers: { Authorization: `Bearer ${token2}` } };

    console.log('✅ Test Users initialized: Lead (ID: ' + user1Id + ') and Visitor (ID: ' + user2Id + ')');

    // 2. Test Workspace Creation (Private)
    const createProjRes = await req('/projects', {
      method: 'POST',
      ...auth1,
      body: {
        name: `Collabry Core Engine ${ts}`,
        description: 'Building confidential next-gen collaboration tech.',
        visibility: 'private',
        join_mode: 'invite',
      },
    });
    const projectId = createProjRes.data.id;
    console.log(`✅ Private Workspace created: ID ${projectId}`);

    // 3. Test Privacy Access Gating
    const previewRes = await req(`/projects/${projectId}`, { method: 'GET', ...auth2 });
    if (previewRes.data.is_member === false && previewRes.data.is_preview === true && previewRes.data.channels.length === 0) {
      console.log('✅ Privacy Gating Verified: Non-member sees preview, is_member = false, private channels stripped.');
    } else {
      throw new Error('Privacy gating failed: Non-member got private workspace data');
    }

    // Verify sub-resource 403 Forbidden protection
    const taskRes = await req(`/projects/${projectId}/tasks`, { method: 'GET', ...auth2 });
    if (taskRes.status === 403) {
      console.log('✅ Sub-resource Guard Verified: Tasks returned 403 Forbidden for non-member');
    } else {
      throw new Error('Should have blocked private tasks, got status ' + taskRes.status);
    }

    const filesRes = await req(`/projects/${projectId}/files`, { method: 'GET', ...auth2 });
    if (filesRes.status === 403) {
      console.log('✅ Sub-resource Guard Verified: Files returned 403 Forbidden for non-member');
    } else {
      throw new Error('Should have blocked private files, got status ' + filesRes.status);
    }

    const canvasRes = await req(`/projects/${projectId}/canvas`, { method: 'GET', ...auth2 });
    if (canvasRes.status === 403) {
      console.log('✅ Sub-resource Guard Verified: Canvas returned 403 Forbidden for non-member');
    } else {
      throw new Error('Should have blocked private canvas, got status ' + canvasRes.status);
    }

    // 4. Test Decline Workspace Invitation
    await req(`/projects/${projectId}/invitations`, {
      method: 'POST',
      ...auth1,
      body: { user_id: user2Id, role: 'contributor' },
    });
    console.log('✅ Sent workspace invitation to Visitor');

    // Decline via client2
    const declineRes = await req(`/projects/${projectId}/invitations/decline`, { method: 'POST', ...auth2 });
    if (declineRes.status === 200) {
      console.log('✅ Decline Invite Verified: Visitor successfully declined workspace invitation');
    } else {
      throw new Error('Failed to decline invitation: ' + JSON.stringify(declineRes.data));
    }

    const [invRows] = await pool.query('SELECT status FROM project_invitations WHERE project_id = ? AND invitee_id = ?', [projectId, user2Id]);
    if (invRows[0]?.status === 'declined') {
      console.log('✅ Database status updated to "declined"');
    } else {
      throw new Error(`Expected invitation status "declined", got ${invRows[0]?.status}`);
    }

    // 5. Test Maintainer Revoke Invitation
    const inv2Res = await req(`/projects/${projectId}/invitations`, {
      method: 'POST',
      ...auth1,
      body: { user_id: user2Id, role: 'contributor' },
    });
    const inv2Id = inv2Res.data.id;
    const revokeRes = await req(`/projects/${projectId}/invitations/${inv2Id}`, { method: 'DELETE', ...auth1 });
    if (revokeRes.status === 200) {
      console.log('✅ Maintainer Revoke Invite Verified: Maintainer successfully cancelled invitation');
    } else {
      throw new Error('Failed to revoke invitation');
    }

    // 6. Test "Interested / Request to Join" Flow
    const joinReqRes = await req(`/projects/${projectId}/join-requests`, {
      method: 'POST',
      ...auth2,
      body: {
        message: 'I would love to help optimize the backend WebSockets!',
        skills_offered: 'Node.js, Redis, WebSockets',
      },
    });
    const requestId = joinReqRes.data.request_id;
    console.log(`✅ Pitch / Request to Join Submitted: Request ID ${requestId}`);

    // Verify preview now indicates pending_join_request
    const previewWithReq = await req(`/projects/${projectId}`, { method: 'GET', ...auth2 });
    if (previewWithReq.data.pending_join_request?.id === requestId) {
      console.log('✅ Pending Join Request Badge Verified in Workspace Gateway');
    } else {
      throw new Error('pending_join_request not present in preview payload');
    }

    // Maintainer lists join requests
    const listReqsRes = await req(`/projects/${projectId}/join-requests`, { method: 'GET', ...auth1 });
    if (Array.isArray(listReqsRes.data) && listReqsRes.data.some(r => r.id === requestId)) {
      console.log('✅ Maintainer Join Requests List Verified: Found pending applicant');
    } else {
      throw new Error('Join request not found in maintainer list');
    }

    // Maintainer accepts applicant
    const acceptReqRes = await req(`/projects/${projectId}/join-requests/${requestId}`, {
      method: 'PATCH',
      ...auth1,
      body: { status: 'accepted', role: 'contributor' },
    });
    console.log('✅ Maintainer Accepted Join Request: ' + acceptReqRes.data.message);

    // Verify user2 is now a full member
    const memberView = await req(`/projects/${projectId}`, { method: 'GET', ...auth2 });
    if (memberView.data.is_member === true && memberView.data.channels.length > 0) {
      console.log('✅ Member Admission Verified: User is now a full workspace member with channel access!');
    } else {
      throw new Error('Join request accept did not grant full workspace access');
    }

    // 7. Test Workspace Tagging in Posts & Filtering
    const postRes = await req('/posts', {
      method: 'POST',
      ...auth2,
      body: {
        title: `Announcing Collabry 2.0 Integration ${ts}`,
        body: 'Check out our workspace and contribute to the real-time canvas!',
        post_type: 'collaboration_request',
        project_id: projectId,
      },
    });
    const postId = postRes.data.id;
    console.log(`✅ Created public post tagged with Workspace ID ${projectId}`);

    // Fetch posts filtered by workspace
    const taggedPostsRes = await req(`/posts?project_id=${projectId}`, { method: 'GET', ...auth1 });
    if (taggedPostsRes.data.some(p => p.id === postId && p.project?.id === projectId)) {
      console.log('✅ Workspace Posts Feed Verified: Post returned with project badge metadata');
    } else {
      throw new Error('Workspace tagged post not found in project feed query');
    }

    // 8. Test Feature 5: Saved Posts & Bookmarks Hub
    const saveRes = await req(`/posts/${postId}/save`, { method: 'POST', ...auth1 });
    if (saveRes.data.saved === true) {
      console.log('✅ Saved Post Bookmark Toggle-On Verified');
    } else {
      throw new Error('Bookmark toggle-on failed');
    }

    const savedFeedRes = await req('/posts?saved=true', { method: 'GET', ...auth1 });
    if (savedFeedRes.data.some(p => p.id === postId && p.is_saved === true)) {
      console.log('✅ Bookmarks Hub Verified: Post retrieved in saved filter with is_saved = true');
    } else {
      throw new Error('Saved post not returned in bookmarks feed');
    }

    const unSaveRes = await req(`/posts/${postId}/save`, { method: 'POST', ...auth1 });
    if (unSaveRes.data.saved === false) {
      console.log('✅ Saved Post Bookmark Toggle-Off Verified');
    } else {
      throw new Error('Bookmark toggle-off failed');
    }

    // 9. Test Feature 4: In-Chat Full-Text Search
    const channelId = memberView.data.channels[0].id;
    await req(`/messages/${channelId}`, { method: 'POST', ...auth1, body: { body: 'Let us review the quantum encryption architecture today' } });
    await req(`/messages/${channelId}`, { method: 'POST', ...auth2, body: { body: 'Sounds awesome, I will prepare the benchmark specs' } });

    const searchRes = await req(`/messages/search?conversation_id=${channelId}&q=quantum`, { method: 'GET', ...auth1 });
    if (searchRes.data.length > 0 && searchRes.data[0].body.includes('quantum')) {
      console.log('✅ In-Chat Full-Text Search Verified: Matched message inside channel');
    } else {
      throw new Error('In-chat search did not return expected message');
    }

    // 10. Test Feature 6: Rich Emoji Reactions on Chat Messages
    const msgId = searchRes.data[0].id;
    const reactRes = await req(`/messages/${msgId}/reactions`, { method: 'POST', ...auth2, body: { emoji: '🚀' } });
    if (reactRes.data.reactions.some(r => r.emoji === '🚀' && r.count === 1)) {
      console.log('✅ Rich Emoji Reaction Toggle-On Verified: 🚀 added with count 1');
    } else {
      throw new Error('Reaction toggle on failed: ' + JSON.stringify(reactRes.data));
    }

    // Fetch messages to verify reactions are enriched
    const messagesRes = await req(`/messages/${channelId}`, { method: 'GET', ...auth1 });
    const reactMsg = messagesRes.data.find(m => m.id === msgId);
    if (reactMsg?.reactions?.some(r => r.emoji === '🚀')) {
      console.log('✅ Message Payload Enrichment Verified: Reactions included in message list');
    } else {
      throw new Error('Reactions not enriched in messages endpoint');
    }

    // Toggle off reaction
    const unReactRes = await req(`/messages/${msgId}/reactions`, { method: 'POST', ...auth2, body: { emoji: '🚀' } });
    if (!unReactRes.data.reactions.some(r => r.emoji === '🚀')) {
      console.log('✅ Rich Emoji Reaction Toggle-Off Verified: 🚀 removed cleanly');
    } else {
      throw new Error('Reaction toggle off failed');
    }

    // Cleanup test data
    await pool.query('DELETE FROM message_reactions WHERE message_id = ?', [msgId]);
    await pool.query('DELETE FROM messages WHERE conversation_id = ?', [channelId]);
    await pool.query('DELETE FROM saved_posts WHERE user_id IN (?, ?)', [user1Id, user2Id]);
    await pool.query('DELETE FROM posts WHERE id = ?', [postId]);
    await pool.query('DELETE FROM project_join_requests WHERE project_id = ?', [projectId]);
    await pool.query('DELETE FROM project_invitations WHERE project_id = ?', [projectId]);
    await pool.query('DELETE FROM project_members WHERE project_id = ?', [projectId]);
    await pool.query('DELETE FROM conversations WHERE project_id = ?', [projectId]);
    await pool.query('DELETE FROM projects WHERE id = ?', [projectId]);
    await pool.query('DELETE FROM users WHERE id IN (?, ?)', [user1Id, user2Id]);

    console.log('\n🎉 ALL SET 2 & WORKSPACE VERIFICATION TESTS PASSED 100% WITH ZERO ERRORS!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification Test Failed:', err.message);
    process.exit(1);
  }
}

runSet2Tests();
