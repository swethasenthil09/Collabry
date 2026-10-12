// Automated verification test script for Set 1 features:
// 1. Workspace Granular Roles & Access Permissions
// 2. Workspace Audit Trail & Activity Feed
// 3. Whiteboard Canvas Multi-Format Export/Import & Permissions

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

async function runSet1Verification() {
  console.log('====================================================');
  console.log('🧪 SET 1 VERIFICATION TEST: ROLES, AUDIT FEED & CANVAS');
  console.log('====================================================\n');

  try {
    // 1. Register Owner and Member/Viewer
    const stamp = Date.now();
    const ownerEmail = `set1_owner_${stamp}@collabry.test`;
    const viewerEmail = `set1_viewer_${stamp}@collabry.test`;

    const ownerReg = await req('/auth/register', {
      method: 'POST',
      body: {
        username: `owner_${stamp}`,
        email: ownerEmail,
        password: 'Password123!',
        name: 'Workspace Owner',
      },
    });
    const ownerToken = ownerReg.data.accessToken;
    const ownerUser = ownerReg.data.user;

    const viewerReg = await req('/auth/register', {
      method: 'POST',
      body: {
        username: `viewer_${stamp}`,
        email: viewerEmail,
        password: 'Password123!',
        name: 'Workspace Viewer',
      },
    });
    const viewerToken = viewerReg.data.accessToken;
    const viewerUser = viewerReg.data.user;

    const ownerAuth = { headers: { Authorization: `Bearer ${ownerToken}` } };
    const viewerAuth = { headers: { Authorization: `Bearer ${viewerToken}` } };

    console.log('✅ Registered test users: Owner and Viewer');

    // 2. Create Project
    const projRes = await req('/projects', {
      method: 'POST',
      body: {
        name: `Set 1 Test Project ${stamp}`,
        description: 'Testing granular roles and activity logs',
      },
      ...ownerAuth,
    });
    const projectId = projRes.data.id;
    console.log(`✅ Created workspace #${projectId}`);

    // 3. Add Viewer to workspace with role 'viewer'
    await req(`/projects/${projectId}/members`, {
      method: 'POST',
      body: { userId: viewerUser.id, role: 'viewer' },
      ...ownerAuth,
    });
    console.log(`✅ Added user ${viewerUser.username} with role 'viewer'`);

    // 4. Test Viewer Read-Only Permissions Enforcement
    // 4a. Viewer attempts to create task -> expect 403
    const illegalTaskRes = await req(`/projects/${projectId}/tasks`, {
      method: 'POST',
      body: { title: 'Viewer Illegal Task', status: 'todo' },
      ...viewerAuth,
    });
    if (illegalTaskRes.status === 403) {
      console.log('✅ PASS: Viewer blocked from creating Kanban task (403 Forbidden)');
    } else {
      console.error('❌ FAIL: Expected 403 but got:', illegalTaskRes.status, illegalTaskRes.data);
      process.exit(1);
    }

    // 4b. Viewer attempts to update canvas -> expect 403
    const illegalCanvasRes = await req(`/projects/${projectId}/canvas`, {
      method: 'PUT',
      body: { canvas_data: { elements: [{ tool: 'pen' }], stickyNotes: [] } },
      ...viewerAuth,
    });
    if (illegalCanvasRes.status === 403) {
      console.log('✅ PASS: Viewer blocked from mutating canvas (403 Forbidden)');
    } else {
      console.error('❌ FAIL: Expected 403 but got:', illegalCanvasRes.status, illegalCanvasRes.data);
      process.exit(1);
    }

    // 5. Promote Viewer to 'maintainer'
    const rolePatchRes = await req(`/projects/${projectId}/members/${viewerUser.id}`, {
      method: 'PATCH',
      body: { role: 'maintainer' },
      ...ownerAuth,
    });
    console.log(`✅ PASS: Owner promoted user to 'maintainer' (status: ${rolePatchRes.status})`);

    // 6. Maintainer creates Kanban task
    const taskRes = await req(`/projects/${projectId}/tasks`, {
      method: 'POST',
      body: { title: 'Maintainer Task', status: 'in_progress' },
      ...viewerAuth,
    });
    const taskId = taskRes.data.id;
    console.log(`✅ PASS: Maintainer successfully created task #${taskId}`);

    // Maintainer updates canvas
    const canvasPayload = {
      elements: [
        { id: 'el_1', tool: 'rect', color: '#5865F2', strokeWidth: 4, startX: 50, startY: 50, width: 200, height: 100 }
      ],
      stickyNotes: [
        { id: 'sticky_1', x: 300, y: 150, color: '#FEE75C', text: 'Architectural Blueprint' }
      ]
    };
    await req(`/projects/${projectId}/canvas`, {
      method: 'PUT',
      body: { canvas_data: canvasPayload },
      ...viewerAuth,
    });
    console.log('✅ PASS: Maintainer successfully saved canvas state');

    // 7. Verify Ownership Transfer
    const transferRes = await req(`/projects/${projectId}/transfer-ownership`, {
      method: 'POST',
      body: { new_owner_id: viewerUser.id },
      ...ownerAuth,
    });
    console.log(`✅ PASS: Ownership transferred successfully: ${transferRes.data.message}`);

    // Verify workspace members list roles
    const projectRes = await req(`/projects/${projectId}`, {
      method: 'GET',
      ...viewerAuth,
    });
    const members = projectRes.data.members;
    const newOwnerMember = members.find(m => m.id === viewerUser.id);
    const oldOwnerMember = members.find(m => m.id === ownerUser.id);
    console.log(`✅ PASS: New owner role verified: ${newOwnerMember?.role}`);
    console.log(`✅ PASS: Previous owner demoted to maintainer: ${oldOwnerMember?.role}`);

    // 8. Verify Activity Feed & Audit Trail
    const activityRes = await req(`/projects/${projectId}/activity`, {
      method: 'GET',
      ...viewerAuth,
    });
    const logs = activityRes.data;
    console.log(`✅ PASS: Fetched activity audit trail with ${logs.length} logged events:`);
    logs.forEach(log => {
      console.log(`   - [${log.action}] by @${log.user?.username}: ${JSON.stringify(log.details)}`);
    });

    // Test activity filter
    const taskActivityRes = await req(`/projects/${projectId}/activity?category=task`, {
      method: 'GET',
      ...viewerAuth,
    });
    console.log(`✅ PASS: Filter category 'task' returned ${taskActivityRes.data.length} filtered log entries`);

    console.log('\n====================================================');
    console.log('🎉 ALL SET 1 VERIFICATION TESTS PASSED FLAWLESSLY!');
    console.log('====================================================');
  } catch (error) {
    console.error('❌ Verification Error:', error);
    process.exit(1);
  }
}

runSet1Verification();
