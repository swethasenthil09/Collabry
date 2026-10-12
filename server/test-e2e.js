const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000/api/v1';

// Helper function to make HTTP requests
function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function uploadFileRequest(path, filename, content, token, fieldName = 'file') {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const postData = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"`,
      'Content-Type: text/plain',
      '',
      content,
      `--${boundary}--`,
      ''
    ].join('\r\n');

    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1' + path,
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': 'Bearer ' + token,
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runAllTests() {
  console.log('====================================================');
  console.log('🚀 COLLABRY v1: FULL END-TO-END TEST SUITE (14 MODULES)');
  console.log('====================================================\n');

  const testId = Date.now();
  let passed = 0;
  let failed = 0;

  function assert(condition, message, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message} ${details ? '(' + JSON.stringify(details) + ')' : ''}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: User Registration & Authentication (Alice & Bob)
    // -------------------------------------------------------------
    console.log('▶ [Step 1] Authentication & User Registration');
    const userA = {
      email: `alice_${testId}@collabry.test`,
      password: 'Password123!',
      username: `alice_${testId}`,
      name: 'Alice Cooper',
    };
    const userB = {
      email: `bob_${testId}@collabry.test`,
      password: 'Password123!',
      username: `bob_${testId}`,
      name: 'Bob Marley',
    };

    const regA = await request('POST', '/auth/register', userA);
    const tokenA = regA.data.accessToken;
    const aliceId = regA.data.user?.id;
    assert(regA.status === 201 && tokenA, `Alice registered with pseudonym @${regA.data.user?.alias}`);

    const regB = await request('POST', '/auth/register', userB);
    const tokenB = regB.data.accessToken;
    const bobId = regB.data.user?.id;
    assert(regB.status === 201 && tokenB, `Bob registered with pseudonym @${regB.data.user?.alias}`);

    const meRes = await request('GET', '/auth/me', null, tokenA);
    assert(meRes.status === 200 && meRes.data.email === userA.email, 'Authenticated /auth/me profile fetch');

    // -------------------------------------------------------------
    // TEST 2: User Profile & Skill Chips Management
    // -------------------------------------------------------------
    console.log('\n▶ [Step 2] User Profile & Technical Skills Update');
    const profileUpdate = await request('PATCH', '/users/profile', {
      name: 'Alice C. (Updated)',
      bio: 'Fullstack Rust & React architect building decentralized collaboration tools',
      skills: ['React', 'Node.js', 'PostgreSQL', 'WebSockets'],
    }, tokenA);
    assert(profileUpdate.status === 200, 'Skills and bio updated successfully');

    const meUpdated = await request('GET', '/auth/me', null, tokenA);
    assert(meUpdated.data.skills?.length === 4, `Verified 4 technical skill tags saved: ${meUpdated.data.skills?.join(', ')}`);

    // -------------------------------------------------------------
    // TEST 3: Community Hub Creation & Discovery
    // -------------------------------------------------------------
    console.log('\n▶ [Step 3] Community Hub Creation & Discovery');
    const commCreate = await request('POST', '/communities', {
      name: `Web3 Builders ${testId}`,
      slug: `web3-builders-${testId}`,
      description: 'A community for next-gen fullstack & web3 developers',
      category: 'tech',
      is_private: false,
    }, tokenA);
    assert(commCreate.status === 201 && commCreate.data.id, `Created community c/${commCreate.data.slug}`);
    const commId = commCreate.data.id;

    const commList = await request('GET', '/communities');
    assert(commList.status === 200 && Array.isArray(commList.data), `Fetched communities list (${commList.data.length} total)`);

    // Bob joins the community
    const joinRes = await request('POST', `/communities/${commId}/join`, {}, tokenB);
    assert(joinRes.status === 200, 'Bob joined the newly created community');

    // -------------------------------------------------------------
    // TEST 4: Post Creation (Discussion & Collaboration Request)
    // -------------------------------------------------------------
    console.log('\n▶ [Step 4] Post Creation & Identity Modes');
    // Collaboration request post
    const collabPostRes = await request('POST', '/posts', {
      community_id: commId,
      title: 'Building an Open-Source Real-Time Collaborative Canvas',
      body: 'Looking for a UI engineer and WebSocket expert to build a Figma-like canvas.',
      post_type: 'collaboration_request',
      identity_mode: 'public',
      required_skills: ['React', 'Canvas API', 'WebSockets'],
      team_size: 3,
    }, tokenA);
    assert(collabPostRes.status === 201 && collabPostRes.data.id, 'Created Collaboration Request post');
    const postId = collabPostRes.data.id;

    // Discussion post under pseudonym
    const discPostRes = await request('POST', '/posts', {
      community_id: commId,
      title: 'Anonymous Question: Best state management in 2026?',
      body: 'Is Zustand still king or are signals overtaking everything?',
      post_type: 'discussion',
      identity_mode: 'alias',
    }, tokenB);
    assert(discPostRes.status === 201 && discPostRes.data.id, 'Created pseudonym discussion post under @alias');

    // -------------------------------------------------------------
    // TEST 5: Feed Search & Native Voting Rails
    // -------------------------------------------------------------
    console.log('\n▶ [Step 5] Feed Search & Native Voting Rails');
    const searchRes = await request('GET', '/posts?search=Canvas');
    assert(searchRes.status === 200 && searchRes.data.length >= 1, `Global keyword search returned ${searchRes.data.length} matching posts`);

    const voteRes = await request('POST', `/posts/${postId}/vote`, { vote_type: 'up' }, tokenB);
    assert(voteRes.status === 200 && voteRes.data.score === 1, 'Bob upvoted Alice’s collaboration post');

    // -------------------------------------------------------------
    // TEST 6: Threaded Comments & Nested Replies
    // -------------------------------------------------------------
    console.log('\n▶ [Step 6] Threaded Discussion Comments');
    const commentRes = await request('POST', `/posts/${postId}/comments`, {
      body: 'This looks super interesting! Is WebGL knowledge required?',
      identity_mode: 'public',
    }, tokenB);
    assert(commentRes.status === 201 && commentRes.data.id, 'Bob posted a top-level comment');
    const commentId = commentRes.data.id;

    const replyRes = await request('POST', `/posts/${postId}/comments`, {
      body: 'Not strictly required, HTML5 Canvas 2D is plenty for v1!',
      parent_comment_id: commentId,
      identity_mode: 'public',
    }, tokenA);
    assert(replyRes.status === 201 && replyRes.data.id, 'Alice posted a threaded reply');

    // -------------------------------------------------------------
    // TEST 7: Collaboration Application & Applicant Review
    // -------------------------------------------------------------
    console.log('\n▶ [Step 7] Collaboration Application Flow');
    const applyRes = await request('POST', `/posts/${postId}/interests`, {
      message: 'I have 3 years experience building interactive web canvases and socket backends!',
      skills_offered: ['React', 'WebSockets'],
    }, tokenB);
    assert(applyRes.status === 201, 'Bob submitted collaboration pitch & skills');

    const applicantsRes = await request('GET', `/posts/${postId}/interests`, null, tokenA);
    assert(applicantsRes.status === 200 && applicantsRes.data.length >= 1, `Creator Alice retrieved ${applicantsRes.data.length} applicant`);

    const acceptRes = await request('PATCH', `/posts/${postId}/interests/${bobId}`, { status: 'accepted' }, tokenA);
    assert(acceptRes.status === 200, 'Creator Alice accepted Bob’s application');

    // -------------------------------------------------------------
    // TEST 8: 1-Click Workspace Conversion
    // -------------------------------------------------------------
    console.log('\n▶ [Step 8] 1-Click Project Workspace Conversion');
    const convertRes = await request('POST', `/posts/${postId}/convert-to-project`, {}, tokenA);
    assert((convertRes.status === 200 || convertRes.status === 201) && convertRes.data.project_id, `Post converted to Project Workspace #${convertRes.data.project_id}`);
    const projectId = convertRes.data.project_id;

    const projectRes = await request('GET', `/projects/${projectId}`, null, tokenA);
    assert(projectRes.status === 200 && projectRes.data.name, `Fetched workspace: "${projectRes.data.name}" with ${projectRes.data.members?.length} members`);

    // -------------------------------------------------------------
    // TEST 9: Multi-Channel Management & Channel Messages
    // -------------------------------------------------------------
    console.log('\n▶ [Step 9] Multi-Channel Project Workspaces');
    const createChanRes = await request('POST', `/projects/${projectId}/channels`, {
      name: 'design-ideas',
      type: 'channel',
    }, tokenA);
    assert(createChanRes.status === 201 && createChanRes.data.name === 'design-ideas', 'Created new text channel #design-ideas');
    const channelId = createChanRes.data.id;

    const sendMsgRes = await request('POST', `/messages/${channelId}`, {
      body: 'Welcome team! Let’s post all wireframes in this channel.',
    }, tokenA);
    assert(sendMsgRes.status === 201 && sendMsgRes.data.id, 'Posted message in #design-ideas channel');

    const chanMsgs = await request('GET', `/messages/${channelId}`, null, tokenA);
    assert(chanMsgs.status === 200 && chanMsgs.data.length >= 1, `Fetched ${chanMsgs.data.length} channel messages`);

    // -------------------------------------------------------------
    // TEST 10: Kanban Board Tasks & Assignment
    // -------------------------------------------------------------
    console.log('\n▶ [Step 10] Kanban Board Task Management & Assignees');
    const createTaskRes = await request('POST', `/projects/${projectId}/tasks`, {
      title: 'Setup WebGL / Canvas Renderer',
      description: 'Initialize high-DPI canvas wrapper with zoom/pan gesture handlers',
      status: 'in_progress',
      priority: 'high',
      assignee_id: bobId,
    }, tokenA);
    assert(createTaskRes.status === 201 && createTaskRes.data.id, 'Created Kanban task assigned to Bob');
    const taskId = createTaskRes.data.id;

    const taskListRes = await request('GET', `/projects/${projectId}/tasks`, null, tokenA);
    assert(taskListRes.status === 200 && taskListRes.data.length >= 1, `Fetched ${taskListRes.data.length} active Kanban tasks`);

    const updateTaskRes = await request('PATCH', `/projects/${projectId}/tasks/${taskId}`, {
      status: 'done',
    }, tokenA);
    assert(updateTaskRes.status === 200, 'Moved task to "done" column');

    // -------------------------------------------------------------
    // TEST 11: Real-Time 1-on-1 Direct Messaging (DMs)
    // -------------------------------------------------------------
    console.log('\n▶ [Step 11] 1-on-1 Direct Messaging');
    const createDmRes = await request('POST', '/messages/dms', {
      recipient_id: bobId,
    }, tokenA);
    assert(createDmRes.status === 200 || createDmRes.status === 201, `Created/retrieved 1-on-1 DM conversation #${createDmRes.data.conversation_id}`);
    const dmConvId = createDmRes.data.conversation_id;

    const sendDmRes = await request('POST', `/messages/${dmConvId}`, {
      body: 'Hey Bob, excited to work together on the canvas project!',
    }, tokenA);
    assert(sendDmRes.status === 201 && sendDmRes.data.id, 'Alice sent 1-on-1 DM to Bob');

    const bobDmsList = await request('GET', '/messages/dms', null, tokenB);
    assert(bobDmsList.status === 200 && bobDmsList.data.length >= 1, `Bob retrieved active DM list with Alice`);

    // -------------------------------------------------------------
    // TEST 12: Notifications Hub & Workspace Invitations
    // -------------------------------------------------------------
    console.log('\n▶ [Step 12] Notifications Hub');
    const notifsRes = await request('GET', '/notifications', null, tokenB);
    assert(notifsRes.status === 200 && Array.isArray(notifsRes.data.notifications), `Bob fetched notifications hub (${notifsRes.data.notifications?.length} notifications)`);

    // -------------------------------------------------------------
    // TEST 13: Project Meetings & Calendar Scheduler (Module 13)
    // -------------------------------------------------------------
    console.log('\n▶ [Step 13] Project Meetings & Video Conference Scheduling');
    const bobInvs = await request('GET', '/users/invitations', null, tokenB);
    if (bobInvs.data && bobInvs.data.length > 0) {
      await request('POST', `/users/invitations/${bobInvs.data[0].id}/accept`, {}, tokenB);
    }
    const scheduleRes = await request('POST', `/projects/${projectId}/meetings`, {
      title: 'Weekly Sprint Standup & Demo Sync',
      description: 'Discussing real-time canvas architecture and next milestone release.',
      start_time: '2026-10-20 15:00:00',
      end_time: '2026-10-20 16:00:00',
      agenda: '1. Review canvas renderer\n2. Sockets load testing\n3. Q&A',
    }, tokenA);
    assert(scheduleRes.status === 201 && scheduleRes.data.id, 'Alice scheduled team meeting with auto-generated Google Meet room');
    assert(scheduleRes.data.meeting_url && scheduleRes.data.meeting_url.includes('meet.google.com'), 'Meeting URL is a valid Google Meet link');
    const meetingId = scheduleRes.data.id;

    const meetingsListRes = await request('GET', `/projects/${projectId}/meetings`, null, tokenB);
    assert(meetingsListRes.status === 200 && meetingsListRes.data.length >= 1, `Bob fetched project meetings list (${meetingsListRes.data.length} meetings)`);

    const rsvpRes = await request('POST', `/projects/${projectId}/meetings/${meetingId}/rsvp`, {
      status: 'accepted',
    }, tokenB);
    assert(rsvpRes.status === 200 && rsvpRes.data.status === 'accepted', 'Bob submitted RSVP "accepted" to team call');

    // -------------------------------------------------------------
    // TEST 14: Project Files & Shared Resources Hub (Module 14)
    // -------------------------------------------------------------
    console.log('\n▶ [Step 14] Project Files & Shared Resources Hub');
    const uploadRes = await uploadFileRequest(`/projects/${projectId}/files`, 'architecture_spec.md', '# Collabry Real-Time Canvas Specs\n\n- Sockets engine\n- WebRTC canvas', tokenA);
    assert(uploadRes.status === 201 && uploadRes.data.id, 'Alice uploaded architecture_spec.md to workspace');
    assert(uploadRes.data.category === 'document', 'File category correctly detected as document');
    const fileId = uploadRes.data.id;

    // Pin the uploaded file
    const pinRes = await request('PATCH', `/projects/${projectId}/files/${fileId}/pin`, {}, tokenA);
    assert(pinRes.status === 200 && pinRes.data.is_pinned === true, 'Alice pinned architecture_spec.md to the top of the workspace');

    // Add external web resource link
    const linkRes = await request('POST', `/projects/${projectId}/files`, {
      name: 'Figma UI Prototype',
      url: 'https://figma.com/file/collabry-canvas-design',
      category: 'link',
    }, tokenA);
    assert(linkRes.status === 201 && linkRes.data.category === 'link', 'Alice added external Figma web resource link');

    const filesListRes = await request('GET', `/projects/${projectId}/files`, null, tokenB);
    assert(filesListRes.status === 200 && filesListRes.data.length >= 2, `Bob fetched workspace resources list (${filesListRes.data.length} items)`);
    assert(filesListRes.data[0].id === fileId && filesListRes.data[0].is_pinned, 'Pinned resource appears first in workspace resources list');

    const delFileRes = await request('DELETE', `/projects/${projectId}/files/${fileId}`, null, tokenA);
    assert(delFileRes.status === 200, 'Alice deleted project file');

    const filesAfterDel = await request('GET', `/projects/${projectId}/files`, null, tokenB);
    assert(!filesAfterDel.data.some(f => f.id === fileId), 'Deleted file is no longer in active workspace files list');

    // Test Delete All Resources endpoint
    const delAllRes = await request('DELETE', `/projects/${projectId}/files`, null, tokenA);
    assert(delAllRes.status === 200, 'Alice cleared all workspace resources using Delete All');

    const emptyFilesRes = await request('GET', `/projects/${projectId}/files`, null, tokenB);
    assert(emptyFilesRes.status === 200 && emptyFilesRes.data.length === 0, 'Workspace files list is completely empty after Delete All');

    // Test GitHub Repository Hub Linking (Option 3 - Safe & Read-Only)
    const linkGitRes = await request('PUT', `/projects/${projectId}/github`, {
      github_repo: 'facebook/react',
    }, tokenA);
    assert(linkGitRes.status === 200 && linkGitRes.data.github_repo === 'facebook/react', 'Alice linked GitHub repository facebook/react to workspace');

    const getGitRes = await request('GET', `/projects/${projectId}/github`, null, tokenB);
    assert(getGitRes.status === 200 && getGitRes.data.connected === true, 'Bob fetched live GitHub repository activity feed');

    // Test Git Upload / Push to Repository endpoint
    const pushGitRes = await request('POST', `/projects/${projectId}/github/push`, {
      direct_files: [
        { path: 'architecture_spec.md', contentBase64: Buffer.from('# Architecture Spec').toString('base64'), name: 'architecture_spec.md' }
      ],
      commit_message: 'docs: add architecture spec from Collabry',
      branch: 'main',
      token: 'test_token',
    }, tokenA);
    assert(pushGitRes.status === 200 && pushGitRes.data.success === true, 'Alice pushed/staged files to GitHub repository');

    // Test GitHub Workflow Dispatch trigger
    const dispatchRes = await request('POST', `/projects/${projectId}/github/dispatch-workflow`, {
      workflow_id: 'ci.yml',
      ref: 'main',
    }, tokenA);
    assert(dispatchRes.status === 200 && dispatchRes.data.success === true, 'Alice triggered GitHub Actions workflow dispatch');

    // Test GitHub Issue creation trigger
    const issueRes = await request('POST', `/projects/${projectId}/github/issues`, {
      title: 'Bug: Canvas synchronization latency',
      body: 'Reported during collaborative testing session.',
    }, tokenA);
    assert(issueRes.status === 200 && issueRes.data.success === true, 'Alice created GitHub issue directly from workspace');

    // Test GitHub Close Issue
    const closeIssueRes = await request('PATCH', `/projects/${projectId}/github/issues/1/close`, {
      state_reason: 'completed',
    }, tokenA);
    assert(closeIssueRes.status === 200 && closeIssueRes.data.success === true, 'Alice closed GitHub issue directly from workspace');

    // Test GitHub Reopen Issue
    const reopenIssueRes = await request('PATCH', `/projects/${projectId}/github/issues/1/reopen`, {}, tokenA);
    assert(reopenIssueRes.status === 200 && reopenIssueRes.data.success === true, 'Alice reopened GitHub issue directly from workspace');

    // Test GitHub Branch creation trigger
    const branchRes = await request('POST', `/projects/${projectId}/github/branches`, {
      branch_name: 'feature/new-canvas-tools',
      from_branch: 'main',
    }, tokenA);
    assert(branchRes.status === 200 && branchRes.data.success === true, 'Alice created Git branch from workspace');

    // Test GitHub Pull Request creation trigger
    const prRes = await request('POST', `/projects/${projectId}/github/pulls`, {
      title: 'feat: add collaborative canvas engine',
      head: 'feature/new-canvas-tools',
      base: 'main',
      body: 'Implements WebSockets sync for multi-user drawing.',
    }, tokenA);
    assert(prRes.status === 201 && prRes.data.success === true, 'Alice created GitHub pull request from workspace');

    // Test GitHub Merge Pull Request
    const mergePrRes = await request('PUT', `/projects/${projectId}/github/pulls/1/merge`, {
      commit_title: 'Merge pull request #1 from feature/new-canvas-tools',
      merge_method: 'merge',
    }, tokenA);
    assert(mergePrRes.status === 200 && mergePrRes.data.success === true, 'Alice merged GitHub pull request from workspace');

    // Test GitHub Delete File from repository
    const delGitFileRes = await request('POST', `/projects/${projectId}/github/delete-file`, {
      file_path: 'architecture_spec.md',
      branch: 'main',
      commit_message: 'chore: remove deprecated architecture spec',
    }, tokenA);
    assert(delGitFileRes.status === 200 && delGitFileRes.data.success === true, 'Alice deleted committed file from GitHub repository');

    const unlinkGitRes = await request('DELETE', `/projects/${projectId}/github`, null, tokenA);
    assert(unlinkGitRes.status === 200, 'Alice safely unlinked GitHub repository');

    // Clean up temporary test project uploads directory on disk
    try {
      const testUploadDir = path.join(__dirname, 'uploads', 'projects', String(projectId));
      if (fs.existsSync(testUploadDir)) {
        fs.rmSync(testUploadDir, { recursive: true, force: true });
      }
    } catch (_) {}

    // ==========================================
    // STEP 15: FEED LIVE SESSIONS & BROADCASTS
    // ==========================================
    console.log('\n▶ [Step 15] Feed Live Sessions & Broadcasts');

    // Alice starts a live broadcast on the feed
    const startLiveRes = await request('POST', '/live', {
      title: 'Building Collaborative Spaces & WebRTC Audio Live',
      description: 'Live coding WebRTC media stream and floating reactions',
    }, tokenA);
    assert(startLiveRes.status === 201 && startLiveRes.data.id, 'Alice started a live broadcast session on the feed');
    const liveSessionId = startLiveRes.data.id;

    // Bob discovers live sessions on the feed
    const getLiveRes = await request('GET', '/live', null, tokenB);
    assert(
      getLiveRes.status === 200 && Array.isArray(getLiveRes.data) && getLiveRes.data.some(s => s.id === liveSessionId),
      'Bob discovered Alice’s active live broadcast on the feed stories bar'
    );

    // Update viewer count as viewers tune in
    const viewerCountRes = await request('POST', `/live/${liveSessionId}/viewers`, { count: 12 }, tokenB);
    assert(viewerCountRes.status === 200 && viewerCountRes.data.viewer_count === 12, 'Viewer counter updated dynamically');

    // Alice ends the broadcast
    const endLiveRes = await request('POST', `/live/${liveSessionId}/end`, null, tokenA);
    assert(endLiveRes.status === 200 && endLiveRes.data.message === 'Live broadcast ended successfully', 'Alice ended the live broadcast');

    // Verify stream is marked ended and not in active feed
    const checkLiveRes = await request('GET', '/live', null, tokenB);
    assert(
      checkLiveRes.status === 200 && !checkLiveRes.data.some(s => s.id === liveSessionId),
      'Ended broadcast is cleanly removed from the active feed stories bar'
    );

    // Test Voice-Alone Space session creation and type filtering
    const startVoiceRes = await request('POST', '/live', {
      title: 'Dev Audio Space: Open Source AMA & Q&A Forum',
      description: 'Voice-alone broadcast forum',
      session_type: 'voice',
    }, tokenA);
    assert(startVoiceRes.status === 201 && startVoiceRes.data.session_type === 'voice', 'Alice hosted a voice-alone audio space forum');
    const voiceSessionId = startVoiceRes.data.id;

    const getVoiceSpacesRes = await request('GET', '/live?type=voice', null, tokenB);
    assert(
      getVoiceSpacesRes.status === 200 && getVoiceSpacesRes.data.some(s => s.id === voiceSessionId),
      'Bob discovered Alice’s audio space in the Broadcasts & Spaces Forum'
    );

    // Test Host removing a user from broadcast
    const removeUserRes = await request('POST', `/live/${voiceSessionId}/remove-user`, { userId: userB.id }, tokenA);
    assert(removeUserRes.status === 200 && removeUserRes.data.message === 'User removed from broadcast successfully', 'Host Alice successfully removed user Bob from the broadcast session');


    await request('POST', `/live/${voiceSessionId}/end`, null, tokenA);

    // ==========================================
    // STEP 16: GENERAL POSTS & MEDIA ATTACHMENTS
    // ==========================================
    console.log('\n▶ [Step 16] General Posts (Optional Community) & Media Attachments');

    // Alice creates a general post without selecting any community
    const createGeneralPostRes = await request('POST', '/posts', {
      title: 'Excited to unveil our new WebRTC collaborative whiteboard!',
      body: 'Check out the demo screenshot and short recording below.',
      custom_category: 'Project Showcase',
      media_url: '/uploads/posts/demo-preview.png',
      media_type: 'image',
    }, tokenA);
    assert(createGeneralPostRes.status === 201 && createGeneralPostRes.data.id, 'Alice created a general post with optional community and custom category');
    const generalPostId = createGeneralPostRes.data.id;

    // Bob fetches feed and verifies the general post
    const fetchGeneralPostRes = await request('GET', `/posts/${generalPostId}`, null, tokenB);
    assert(
      fetchGeneralPostRes.status === 200 &&
      fetchGeneralPostRes.data.custom_category === 'Project Showcase' &&
      fetchGeneralPostRes.data.community === null &&
      fetchGeneralPostRes.data.media_url === '/uploads/posts/demo-preview.png' &&
      fetchGeneralPostRes.data.media_type === 'image',
      'Bob retrieved general post with custom category #Project Showcase and attached media preview'
    );

    // =========================================================================
    // STEP 17: Project Collaborative Canvas, Live Notes, DM Voice Notes & Read Receipts
    // =========================================================================
    console.log('\n▶ [Step 17] Canvas & Docs & Voice DMs with Read Receipts');

    // 1. Canvas Save & Load
    const sampleCanvasElements = [
      { id: 'el_1', tool: 'pen', color: '#5865F2', strokeWidth: 5, points: [{ x: 10, y: 10 }, { x: 50, y: 50 }] }
    ];
    const saveCanvasRes = await request('PUT', `/projects/${projectId}/canvas`, {
      canvas_data: { elements: sampleCanvasElements, stickyNotes: [{ id: 's1', text: 'Launch v1', x: 20, y: 20 }] },
    }, tokenA);
    assert(saveCanvasRes.status === 200, 'Alice saved collaborative whiteboard canvas state');

    const getCanvasRes = await request('GET', `/projects/${projectId}/canvas`, null, tokenB);
    assert(getCanvasRes.status === 200 && getCanvasRes.data.canvas_data, 'Bob fetched synced workspace canvas data');

    // 2. Notes Save & Load
    const saveNotesRes = await request('PUT', `/projects/${projectId}/notes`, {
      title: 'Collabry System Architecture Spec',
      content: '# Architecture Spec\n- Microservices\n- WebSockets sync\n- WebRTC Audio Room',
    }, tokenA);
    assert(saveNotesRes.status === 200, 'Alice saved workspace collaborative markdown notes');

    const getNotesRes = await request('GET', `/projects/${projectId}/notes`, null, tokenB);
    assert(
      getNotesRes.status === 200 &&
      getNotesRes.data.title === 'Collabry System Architecture Spec' &&
      getNotesRes.data.content.includes('WebSockets sync'),
      'Bob fetched updated workspace architecture notes'
    );

    // 3. DM Voice Note
    const sendVoiceDmRes = await request('POST', `/messages/${dmConvId}`, {
      body: 'Check out this quick voice update',
      message_type: 'audio',
      media_url: '/uploads/audio/demo-note.webm',
      duration: 15,
    }, tokenA);
    assert(
      sendVoiceDmRes.status === 201 &&
      sendVoiceDmRes.data.message_type === 'audio' &&
      sendVoiceDmRes.data.media_url === '/uploads/audio/demo-note.webm' &&
      sendVoiceDmRes.data.duration === 15,
      'Alice sent voice note with audio waveform metadata in 1-on-1 DM'
    );

    // 4. Read Receipts
    const markReadRes = await request('POST', `/messages/${dmConvId}/read`, {}, tokenB);
    assert(markReadRes.status === 200, 'Bob marked incoming messages as read in conversation');

    // Verify messages status updated to read
    const fetchDmRes = await request('GET', `/messages/${dmConvId}`, null, tokenA);
    const lastMsg = fetchDmRes.data[fetchDmRes.data.length - 1];
    assert(
      lastMsg && lastMsg.status === 'read',
      'Verified read receipt updated to double-blue read checkmark status'
    );

    // =========================================================================
    // STEP 18: Multi-Party Group Direct Messages
    // =========================================================================
    console.log('\n▶ [Step 18] Multi-Party Group Direct Chats');

    // 1. Create group chat with Alice and Bob
    const createGroupRes = await request('POST', '/messages/groups', {
      name: 'Fullstack Core Squad',
      member_ids: [bobId],
    }, tokenA);
    assert(
      createGroupRes.status === 201 &&
      createGroupRes.data.name === 'Fullstack Core Squad' &&
      createGroupRes.data.type === 'group' &&
      createGroupRes.data.member_count === 2,
      'Alice created group chat "Fullstack Core Squad" with Bob'
    );
    const groupId = createGroupRes.data.id;

    // 2. Bob lists group chats
    const bobGroupsRes = await request('GET', '/messages/groups', null, tokenB);
    assert(
      bobGroupsRes.status === 200 &&
      bobGroupsRes.data.some(g => g.id === groupId && g.name === 'Fullstack Core Squad'),
      'Bob fetched active group chats list with "Fullstack Core Squad"'
    );

    // 3. Fetch group conversation details & member roles
    const groupDetailsRes = await request('GET', `/messages/conversations/${groupId}`, null, tokenA);
    assert(
      groupDetailsRes.status === 200 &&
      groupDetailsRes.data.type === 'group' &&
      groupDetailsRes.data.members?.length === 2 &&
      groupDetailsRes.data.is_admin === true,
      'Fetched group conversation with member roles (Alice admin)'
    );

    // 4. Send message to group chat
    const sendGroupMsgRes = await request('POST', `/messages/${groupId}`, {
      body: 'Welcome to the core squad everyone!',
    }, tokenB);
    assert(
      sendGroupMsgRes.status === 201 && sendGroupMsgRes.data.body === 'Welcome to the core squad everyone!',
      'Bob posted message to group chat'
    );

    // =========================================================================
    // STEP 19: User Profile Customization & Rich Portfolio Showcase
    // =========================================================================
    console.log('\n▶ [Step 19] User Profile Customization & Rich Portfolio');

    // 1. Upload Alice's custom banner and avatar images
    const bannerUploadRes = await uploadFileRequest('/users/banner', 'test-banner.png', 'banner-bytes', tokenA, 'banner');
    assert(bannerUploadRes.status === 200 && bannerUploadRes.data.banner_url, 'Alice uploaded custom profile banner image');

    const avatarUploadRes = await uploadFileRequest('/users/avatar', 'test-avatar.png', 'avatar-bytes', tokenA, 'avatar');
    assert(avatarUploadRes.status === 200 && avatarUploadRes.data.avatar_url, 'Alice uploaded custom profile picture (avatar)');

    // 2. Update Alice's profile with social URLs and pinned project
    const updateProfileRes = await request('PATCH', '/users/profile', {
      name: 'Alice Builder',
      bio: 'Open source contributor & fullstack hacker building decentralized tools.',
      github_url: 'alicebuilder',
      linkedin_url: 'alice-builder',
      twitter_url: '@alice_builds',
      portfolio_url: 'https://alice.dev',
      pinned_project_id: projectId,
    }, tokenA);
    assert(updateProfileRes.status === 200, 'Alice updated profile with portfolio socials and pinned workspace');

    // 3. Fetch updated profile
    const aliceProfileRes = await request('GET', '/users/profile', null, tokenA);
    assert(
      aliceProfileRes.status === 200 &&
      aliceProfileRes.data.github_url === 'alicebuilder' &&
      aliceProfileRes.data.banner_url &&
      aliceProfileRes.data.avatar_url &&
      aliceProfileRes.data.pinned_project &&
      aliceProfileRes.data.badges?.length > 0,
      'Alice profile verified with badges, avatar, banner, and pinned workspace'
    );

    // 4. Bob fetches Alice's public portfolio
    const publicPortfolioRes = await request('GET', `/users/${aliceId}/portfolio`, null, tokenB);
    assert(
      publicPortfolioRes.status === 200 &&
      publicPortfolioRes.data.name === 'Alice Builder' &&
      publicPortfolioRes.data.avatar_url &&
      publicPortfolioRes.data.banner_url &&
      publicPortfolioRes.data.projects?.length > 0,
      'Bob fetched Alice’s public portfolio showcase with active projects'
    );

    // =========================================================================
    // STEP 20: Global Omnisearch & Command Palette Query Engine
    // =========================================================================
    console.log('\n▶ [Step 20] Global Omnisearch & Command Palette Query Engine');

    // 1. Search across all categories
    const omniRes = await request('GET', '/search/omni?q=Canvas', null, tokenB);
    assert(
      omniRes.status === 200 &&
      (omniRes.data.results.posts.length > 0 || omniRes.data.results.projects.length > 0),
      'Omnisearch returned multi-category matches for "Canvas"'
    );

    // 2. Search communities
    const omniCommRes = await request('GET', '/search/omni?q=web3&category=communities', null, tokenA);
    assert(
      omniCommRes.status === 200 && omniCommRes.data.results.communities.length > 0,
      'Omnisearch returned community matches for category "communities"'
    );

    // 3. Search users
    const omniUsersRes = await request('GET', `/search/omni?q=${encodeURIComponent(aliceProfileRes.data.username)}&category=users`, null, tokenB);
    assert(
      omniUsersRes.status === 200 && omniUsersRes.data.results.users.length > 0,
      'Omnisearch returned builder matches for category "users"'
    );


  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  // Teardown: Clean up Alice & Bob test accounts and workspaces created during test
  try {
    const pool = require('./config/db');
    if (typeof userA !== 'undefined' && typeof userB !== 'undefined') {
      await pool.query('DELETE FROM users WHERE username IN (?, ?)', [userA.username, userB.username]);
      console.log('🧹 Cleaned up test accounts (Alice & Bob)');
    }
  } catch (e) {}

  if (failed === 0) {
    console.log('🎉 ALL 15 MODULES VERIFIED & WORKING WITH 100% SUCCESS!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAllTests();
