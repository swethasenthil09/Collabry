const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

function parseGitHubRepo(input) {
  if (!input) return null;
  const cleaned = input.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/$/, '');
  const parts = cleaned.split('/');
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return null;
}

router.get('/:id/github', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const [projects] = await pool.query('SELECT github_repo, github_token FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (projects.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

    const githubRepo = projects[0].github_repo;
    const hasToken = Boolean(projects[0].github_token);
    const token = projects[0].github_token || process.env.GITHUB_TOKEN;

    if (!githubRepo) {
      return res.json({ connected: false });
    }

    const [owner, repo] = githubRepo.split('/');
    let repoData = {
      connected: true,
      repo: githubRepo,
      owner,
      name: repo,
      url: `https://github.com/${githubRepo}`,
      stars: 0,
      forks: 0,
      open_issues: 0,
      default_branch: 'main',
      description: '',
      has_token: hasToken,
      commits: [],
      pull_requests: [],
      branches: ['main'],
      workflows: [],
      repo_files: [],
      issues: [],
    };

    try {
      const headers = {
        'User-Agent': 'Collabry-App',
        'Accept': 'application/vnd.github.v3+json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      let [infoRes, commitsRes, pullsRes, branchesRes, workflowsRes, issuesRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=6`, { headers }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=6`, { headers }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=15`, { headers }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows`, { headers }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=30`, { headers }),
      ]);

      if (infoRes.status === 401 && headers['Authorization']) {
        // Token was invalid / expired. Fall back to public unauthenticated GitHub requests
        delete headers['Authorization'];
        repoData.has_token = false;
        [infoRes, commitsRes, pullsRes, branchesRes, workflowsRes, issuesRes] = await Promise.all([
          fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
          fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=6`, { headers }),
          fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=6`, { headers }),
          fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=15`, { headers }),
          fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows`, { headers }),
          fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=30`, { headers }),
        ]);
      }

      if (infoRes.ok) {
        const info = await infoRes.json();
        repoData.stars = info.stargazers_count || 0;
        repoData.forks = info.forks_count || 0;
        repoData.open_issues = info.open_issues_count || 0;
        repoData.default_branch = info.default_branch || 'main';
        repoData.description = info.description || '';
      }

      if (commitsRes.ok) {
        const commits = await commitsRes.json();
        if (Array.isArray(commits)) {
          repoData.commits = commits.map(c => ({
            sha: c.sha ? c.sha.substring(0, 7) : '',
            full_sha: c.sha || '',
            message: c.commit?.message?.split('\n')[0] || '',
            author: c.commit?.author?.name || c.author?.login || 'Collaborator',
            date: c.commit?.author?.date || '',
            url: c.html_url || '',
          }));
        }
      }

      if (pullsRes.ok) {
        const pulls = await pullsRes.json();
        if (Array.isArray(pulls)) {
          repoData.pull_requests = pulls.map(p => ({
            id: p.id,
            number: p.number,
            title: p.title,
            state: p.state,
            user: p.user?.login || '',
            url: p.html_url || '',
            created_at: p.created_at,
          }));
        }
      }

      if (issuesRes.ok) {
        const rawIssues = await issuesRes.json();
        if (Array.isArray(rawIssues)) {
          repoData.issues = rawIssues
            .filter(i => !i.pull_request)
            .map(i => ({
              id: i.id,
              number: i.number,
              title: i.title,
              body: i.body || '',
              state: i.state,
              state_reason: i.state_reason || '',
              user: i.user?.login || 'Collaborator',
              url: i.html_url || '',
              created_at: i.created_at,
              closed_at: i.closed_at || null,
              labels: (i.labels || []).map(l => (typeof l === 'string' ? l : l.name || '')),
            }));
        }
      }

      if (branchesRes.ok) {
        const branches = await branchesRes.json();
        if (Array.isArray(branches) && branches.length > 0) {
          repoData.branches = branches.map(b => b.name);
        }
      }

      if (workflowsRes.ok) {
        const wf = await workflowsRes.json();
        if (wf.workflows && Array.isArray(wf.workflows)) {
          repoData.workflows = wf.workflows.map(w => ({
            id: w.id,
            name: w.name,
            path: w.path,
            state: w.state,
            url: w.html_url,
          }));
        }
      }

      // Fetch repository file tree for quick file removal and file selection
      try {
        const treeBranch = repoData.default_branch || 'main';
        let treeRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(treeBranch)}?recursive=1`,
          { headers }
        );
        if (treeRes.status === 401 && headers['Authorization']) {
          delete headers['Authorization'];
          treeRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(treeBranch)}?recursive=1`,
            { headers }
          );
        }
        if (treeRes.ok) {
          const treeData = await treeRes.json();
          if (Array.isArray(treeData.tree)) {
            repoData.repo_files = treeData.tree
              .filter(item => item.type === 'blob')
              .slice(0, 100)
              .map(item => ({
                path: item.path,
                size: item.size || 0,
              }));
          }
        }
      } catch (treeErr) {
        console.warn('GitHub tree fetch notice:', treeErr.message);
      }
    } catch (apiErr) {
      console.warn('GitHub API fetch notice:', apiErr.message);
    }

    res.json(repoData);
  } catch (err) {
    console.error('Fetch GitHub error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch GitHub repo details' } });
  }
});

// Helper: Post automated GitHub activity to project channel chat (Discord bot bridge)
async function postGitHubBotActivity(projectId, text, user, io) {
  try {
    const [channels] = await pool.query(
      `SELECT id FROM conversations WHERE project_id = ? AND type = 'channel' ORDER BY id ASC LIMIT 1`,
      [projectId]
    );
    if (channels.length === 0) return;
    const channelId = channels[0].id;

    const botText = `🤖 **GitHub Activity** • ${text}`;
    const [msgRes] = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)`,
      [channelId, user?.id || 1, botText]
    );

    if (io) {
      const botMessage = {
        id: msgRes.insertId,
        conversation_id: channelId,
        sender_id: user?.id || 1,
        body: botText,
        created_at: new Date().toISOString(),
        username: user?.username || 'github-bot',
        name: 'GitHub Bot',
        avatar_url: null,
      };
      io.to(`conversation:${channelId}`).emit('new_message', botMessage);
    }
  } catch (botErr) {
    console.warn('Bot activity notice:', botErr.message);
  }
}

// GET /api/v1/projects/:id/github/file-content - fetch raw content of a repo file for Live Preview
router.get('/:id/github/file-content', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { path: filePath, branch } = req.query;

    if (!filePath) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'File path is required' } });
    }

    const [projects] = await pool.query('SELECT github_repo, github_token FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (projects.length === 0 || !projects[0].github_repo) {
      return res.status(400).json({ error: { code: 'NOT_CONNECTED', message: 'No GitHub repository connected' } });
    }

    const githubRepo = projects[0].github_repo;
    const [owner, repo] = githubRepo.split('/');
    const effectiveToken = projects[0].github_token || process.env.GITHUB_TOKEN;

    const headers = {
      'User-Agent': 'Collabry-App',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (effectiveToken) {
      headers['Authorization'] = `Bearer ${effectiveToken}`;
    }

    const targetBranch = branch || 'main';
    const cleanPath = filePath.trim().replace(/^(\.\/|\/)+/, '');
    const apiPath = cleanPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');

    let fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${apiPath}?ref=${encodeURIComponent(targetBranch)}`,
      { headers }
    );

    if (fileRes.status === 401 && headers['Authorization']) {
      delete headers['Authorization'];
      fileRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${apiPath}?ref=${encodeURIComponent(targetBranch)}`,
        { headers }
      );
    }

    if (!fileRes.ok) {
      return res.status(fileRes.status).json({
        error: { code: 'FILE_NOT_FOUND', message: `Could not retrieve file "${cleanPath}" from branch "${targetBranch}"` },
      });
    }

    const fileData = await fileRes.json();
    let content = '';
    if (fileData.encoding === 'base64' && fileData.content) {
      content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    }

    res.json({
      path: cleanPath,
      name: fileData.name,
      size: fileData.size,
      sha: fileData.sha,
      html_url: fileData.html_url,
      content,
      branch: targetBranch,
    });
  } catch (err) {
    console.error('Fetch file content error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch file content' } });
  }
});

// PUT /api/v1/projects/:id/github - link or update GitHub repo & token
router.put('/:id/github', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { github_repo, github_token } = req.body;

    const [membership] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, req.user.id]);
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member' } });
    }

    const parsed = parseGitHubRepo(github_repo);
    if (!parsed) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid GitHub repository format (use owner/repo or github.com/owner/repo)' } });
    }

    if (github_token !== undefined) {
      await pool.query('UPDATE projects SET github_repo = ?, github_token = ? WHERE id = ?', [parsed, github_token || null, projectId]);
    } else {
      await pool.query('UPDATE projects SET github_repo = ? WHERE id = ?', [parsed, projectId]);
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('project:github_updated', { github_repo: parsed });
    }

    res.json({ message: 'GitHub repository linked successfully', github_repo: parsed, has_token: Boolean(github_token) });
  } catch (err) {
    console.error('Link GitHub error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to link GitHub repository' } });
  }
});

// POST /api/v1/projects/:id/github/push - push workspace resources or direct files to GitHub repository
router.post('/:id/github/push', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { file_ids = [], direct_files = [], commit_message = 'Update files via Collabry', branch = 'main', token: overrideToken } = req.body;

    const [membership] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, req.user.id]);
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member' } });
    }

    const [projects] = await pool.query('SELECT github_repo, github_token FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (projects.length === 0 || !projects[0].github_repo) {
      return res.status(400).json({ error: { code: 'NOT_CONNECTED', message: 'No GitHub repository connected to this workspace' } });
    }

    const githubRepo = projects[0].github_repo;
    const [owner, repo] = githubRepo.split('/');
    const effectiveToken = overrideToken || projects[0].github_token || process.env.GITHUB_TOKEN;

    const filesToPush = [];

    // 1. Collect files from workspace database
    if (file_ids.length > 0) {
      const [dbFiles] = await pool.query(
        'SELECT * FROM files WHERE project_id = ? AND id IN (?) AND deleted_at IS NULL',
        [projectId, file_ids]
      );

      for (const f of dbFiles) {
        if (f.category === 'link' || f.mime_type === 'link') continue; // Skip external links
        try {
          const filePathOnDisk = path.join(__dirname, '..', f.file_url.startsWith('/') ? f.file_url.slice(1) : f.file_url);
          if (fs.existsSync(filePathOnDisk)) {
            const buffer = fs.readFileSync(filePathOnDisk);
            const relativePath = f.folder_path ? `${f.folder_path}/${f.name}` : f.name;
            filesToPush.push({
              path: relativePath.replace(/^(\.\/|\/)+/, ''),
              contentBase64: buffer.toString('base64'),
              name: f.name,
            });
          }
        } catch (e) {
          console.warn('Read file for GitHub push notice:', e.message);
        }
      }
    }

    // 2. Collect direct files from request
    if (Array.isArray(direct_files) && direct_files.length > 0) {
      for (const df of direct_files) {
        if (df.path && df.contentBase64) {
          filesToPush.push({
            path: df.path.replace(/^(\.\/|\/)+/, ''),
            contentBase64: df.contentBase64,
            name: df.name || path.basename(df.path),
          });
        }
      }
    }

    if (filesToPush.length === 0) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'No valid files selected or provided to push' } });
    }

    if (!effectiveToken || effectiveToken === 'test_token') {
      if (req.headers['x-test-mock'] === 'true' || effectiveToken === 'test_token' || process.env.NODE_ENV === 'test') {
        return res.json({
          success: true,
          simulated: true,
          message: `Staged ${filesToPush.length} file(s) for branch "${branch}"`,
          pushed_files: filesToPush.map((f) => ({ path: f.path, commit: 'mock-sha' })),
          branch,
          commit_message,
          repo: githubRepo,
        });
      }

      return res.status(400).json({
        error: {
          code: 'TOKEN_REQUIRED',
          message: 'GitHub Personal Access Token is required to commit files. Please click "Configure PAT" and enter a token with "Contents: Read and write" (or "repo") permissions.',
        },
      });
    }

    // 3. Commit files via GitHub Contents API
    const pushed = [];
    const headers = {
      'User-Agent': 'Collabry-App',
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${effectiveToken}`,
      'Content-Type': 'application/json',
    };

    for (const item of filesToPush) {
      try {
        const apiPath = item.path
          .split('/')
          .filter(Boolean)
          .map(encodeURIComponent)
          .join('/');

        // Check for existing file to obtain sha
        let sha = null;
        try {
          const checkRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${apiPath}?ref=${encodeURIComponent(branch)}`,
            { headers }
          );
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            sha = checkData.sha;
          }
        } catch {
          // File does not exist yet or branch error; proceed
        }

        const putRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${apiPath}`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              message: `${commit_message} (${item.name})`,
              content: item.contentBase64,
              branch,
              ...(sha ? { sha } : {}),
            }),
          }
        );

        if (putRes.ok) {
          const putData = await putRes.json();
          pushed.push({ path: item.path, commit: putData.commit?.sha?.substring(0, 7) || 'success' });
        } else {
          const errData = await putRes.json().catch(() => ({}));
          const errorMsg = errData.message || `GitHub error (HTTP ${putRes.status})`;
          pushed.push({ path: item.path, status: 'error', reason: errorMsg });
        }
      } catch (itemErr) {
        pushed.push({ path: item.path, status: 'error', reason: itemErr.message });
      }
    }

    const failed = pushed.filter((p) => p.status === 'error');
    if (failed.length > 0) {
      const errorDetail = failed.map((f) => `${f.path}: ${f.reason}`).join('; ');
      return res.status(400).json({
        error: {
          code: 'GITHUB_COMMIT_FAILED',
          message: `Failed to commit to GitHub: ${errorDetail}. Verify your Personal Access Token has "Contents: Read and write" permissions and branch "${branch}" exists.`,
        },
        pushed_files: pushed,
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('project:github_updated', { github_repo: githubRepo });
    }
    await postGitHubBotActivity(projectId, `@${req.user.username} pushed ${pushed.length} file(s) to branch \`${branch}\``, req.user, io);

    return res.json({
      success: true,
      message: `Successfully committed and pushed ${pushed.length} file(s) to branch "${branch}" on GitHub!`,
      pushed_files: pushed,
      branch,
      commit_message,
      repo: githubRepo,
    });
  } catch (err) {
    console.error('Push to GitHub error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to push files to GitHub' } });
  }
});

// POST /api/v1/projects/:id/github/dispatch-workflow - trigger GitHub Actions workflow
router.post('/:id/github/dispatch-workflow', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { workflow_id, ref = 'main', inputs = {} } = req.body;

    const [projects] = await pool.query('SELECT github_repo, github_token FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (projects.length === 0 || !projects[0].github_repo) {
      return res.status(400).json({ error: { code: 'NOT_CONNECTED', message: 'No GitHub repository connected' } });
    }

    const githubRepo = projects[0].github_repo;
    const [owner, repo] = githubRepo.split('/');
    const effectiveToken = projects[0].github_token || process.env.GITHUB_TOKEN;

    if (!effectiveToken) {
      return res.json({
        success: true,
        simulated: true,
        message: `Workflow trigger dispatched in simulation mode for "${workflow_id || 'default'}" on ref "${ref}". Add a GitHub Personal Access Token to trigger remote workflows live.`,
      });
    }

    const targetWorkflow = workflow_id || 'main.yml';
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(targetWorkflow)}/dispatches`,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'Collabry-App',
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${effectiveToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref, inputs }),
      }
    );

    if (dispatchRes.status === 204 || dispatchRes.ok) {
      return res.json({ success: true, message: `Workflow "${targetWorkflow}" triggered successfully on ref "${ref}"!` });
    }

    const errData = await dispatchRes.json().catch(() => ({}));
    res.status(dispatchRes.status).json({
      error: { code: 'GITHUB_API_ERROR', message: errData.message || 'Failed to dispatch GitHub workflow' },
    });
  } catch (err) {
    console.error('Dispatch workflow error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to dispatch workflow' } });
  }
});

// POST /api/v1/projects/:id/github/issues - create GitHub issue directly from Collabry
router.post('/:id/github/issues', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { title, body = '', labels = [], token: overrideToken } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Issue title is required' } });
    }

    const [projects] = await pool.query('SELECT github_repo, github_token FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (projects.length === 0 || !projects[0].github_repo) {
      return res.status(400).json({ error: { code: 'NOT_CONNECTED', message: 'No GitHub repository connected' } });
    }

    const githubRepo = projects[0].github_repo;
    const [owner, repo] = githubRepo.split('/');
    const effectiveToken = overrideToken || projects[0].github_token || process.env.GITHUB_TOKEN;

    if (!effectiveToken) {
      const io = req.app.get('io');
      await postGitHubBotActivity(projectId, `@${req.user.username} created Issue: "${title.trim()}" (simulation mode)`, req.user, io);
      return res.json({
        success: true,
        simulated: true,
        message: `Issue "${title}" prepared! Link a GitHub Personal Access Token to create remote issues live.`,
        issue_url: `https://github.com/${owner}/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
      });
    }

    const createRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'Collabry-App',
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${effectiveToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: title.trim(), body, labels }),
      }
    );

    if (createRes.ok) {
      const issueData = await createRes.json();
      const io = req.app.get('io');
      await postGitHubBotActivity(projectId, `@${req.user.username} created Issue #${issueData.number}: "${title.trim()}"`, req.user, io);
      return res.status(201).json({
        success: true,
        message: 'Issue created successfully on GitHub',
        issue: {
          number: issueData.number,
          title: issueData.title,
          url: issueData.html_url,
        },
      });
    }

    const errData = await createRes.json().catch(() => ({}));
    res.status(createRes.status).json({
      error: { code: 'GITHUB_API_ERROR', message: errData.message || 'Failed to create issue on GitHub' },
    });
  } catch (err) {
    console.error('Create issue error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create issue' } });
  }
});

// PATCH /api/v1/projects/:id/github/issues/:number/close - close a GitHub issue
router.patch('/:id/github/issues/:number/close', authenticate, async (req, res) => {
  try {
    const { id: projectId, number: issueNumber } = req.params;
    const { state_reason = 'completed', token: overrideToken } = req.body;

    const [projects] = await pool.query('SELECT github_repo, github_token FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (projects.length === 0 || !projects[0].github_repo) {
      return res.status(400).json({ error: { code: 'NOT_CONNECTED', message: 'No GitHub repository connected' } });
    }

    const githubRepo = projects[0].github_repo;
    const [owner, repo] = githubRepo.split('/');
    const effectiveToken = overrideToken || projects[0].github_token || process.env.GITHUB_TOKEN;

    if (!effectiveToken) {
      const io = req.app.get('io');
      await postGitHubBotActivity(projectId, `@${req.user.username} closed Issue #${issueNumber} (simulation mode)`, req.user, io);
      return res.json({
        success: true,
        simulated: true,
        message: `Issue #${issueNumber} closed in simulation mode. Add a GitHub Personal Access Token to close issues live on GitHub.`,
      });
    }

    const patchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${encodeURIComponent(issueNumber)}`,
      {
        method: 'PATCH',
        headers: {
          'User-Agent': 'Collabry-App',
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${effectiveToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state: 'closed', state_reason }),
      }
    );

    if (patchRes.ok) {
      const io = req.app.get('io');
      if (io) {
        io.to(`project:${projectId}`).emit('project:github_updated', { github_repo: githubRepo });
      }
      await postGitHubBotActivity(projectId, `@${req.user.username} closed Issue #${issueNumber}`, req.user, io);
      return res.json({
        success: true,
        message: `Issue #${issueNumber} closed successfully on GitHub!`,
      });
    }

    const errData = await patchRes.json().catch(() => ({}));
    res.status(patchRes.status).json({
      error: { code: 'GITHUB_API_ERROR', message: errData.message || 'Failed to close issue on GitHub' },
    });
  } catch (err) {
    console.error('Close issue error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to close issue' } });
  }
});

// PATCH /api/v1/projects/:id/github/issues/:number/reopen - reopen a GitHub issue
router.patch('/:id/github/issues/:number/reopen', authenticate, async (req, res) => {
  try {
    const { id: projectId, number: issueNumber } = req.params;
    const { token: overrideToken } = req.body;

    const [projects] = await pool.query('SELECT github_repo, github_token FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (projects.length === 0 || !projects[0].github_repo) {
      return res.status(400).json({ error: { code: 'NOT_CONNECTED', message: 'No GitHub repository connected' } });
    }

    const githubRepo = projects[0].github_repo;
    const [owner, repo] = githubRepo.split('/');
    const effectiveToken = overrideToken || projects[0].github_token || process.env.GITHUB_TOKEN;

    if (!effectiveToken) {
      const io = req.app.get('io');
      await postGitHubBotActivity(projectId, `@${req.user.username} reopened Issue #${issueNumber} (simulation mode)`, req.user, io);
      return res.json({
        success: true,
        simulated: true,
        message: `Issue #${issueNumber} reopened in simulation mode.`,
      });
    }

    const patchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${encodeURIComponent(issueNumber)}`,
      {
        method: 'PATCH',
        headers: {
          'User-Agent': 'Collabry-App',
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${effectiveToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state: 'open' }),
      }
    );

    if (patchRes.ok) {
      const io = req.app.get('io');
      if (io) {
        io.to(`project:${projectId}`).emit('project:github_updated', { github_repo: githubRepo });
      }
      await postGitHubBotActivity(projectId, `@${req.user.username} reopened Issue #${issueNumber}`, req.user, io);
      return res.json({
        success: true,
        message: `Issue #${issueNumber} reopened successfully on GitHub!`,
      });
    }

    const errData = await patchRes.json().catch(() => ({}));
    res.status(patchRes.status).json({
      error: { code: 'GITHUB_API_ERROR', message: errData.message || 'Failed to reopen issue on GitHub' },
    });
  } catch (err) {
    console.error('Reopen issue error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to reopen issue' } });
  }
});

// POST /api/v1/projects/:id/github/branches - create a new branch on GitHub
router.post('/:id/github/branches', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { branch_name, from_branch = 'main' } = req.body;

    if (!branch_name || !branch_name.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Branch name is required' } });
    }

    const [projects] = await pool.query('SELECT github_repo, github_token FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (projects.length === 0 || !projects[0].github_repo) {
      return res.status(400).json({ error: { code: 'NOT_CONNECTED', message: 'No GitHub repository connected' } });
    }

    const githubRepo = projects[0].github_repo;
    const [owner, repo] = githubRepo.split('/');
    const effectiveToken = projects[0].github_token || process.env.GITHUB_TOKEN;

    if (!effectiveToken) {
      const io = req.app.get('io');
      await postGitHubBotActivity(projectId, `@${req.user.username} created branch \`${branch_name.trim()}\` from \`${from_branch}\` (simulation mode)`, req.user, io);
      return res.json({
        success: true,
        simulated: true,
        message: `Branch "${branch_name}" staged from "${from_branch}". Add a GitHub Personal Access Token to create branches live.`,
        branch: branch_name.trim(),
      });
    }

    // 1. Get SHA of from_branch
    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(from_branch)}`,
      {
        headers: {
          'User-Agent': 'Collabry-App',
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${effectiveToken}`,
        },
      }
    );

    if (!refRes.ok) {
      return res.status(400).json({ error: { code: 'BRANCH_NOT_FOUND', message: `Base branch "${from_branch}" not found` } });
    }

    const refData = await refRes.json();
    const sha = refData.object?.sha;

    // 2. Create new branch ref
    const newRefRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs`,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'Collabry-App',
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${effectiveToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: `refs/heads/${branch_name.trim()}`,
          sha,
        }),
      }
    );

    if (newRefRes.ok) {
      const io = req.app.get('io');
      await postGitHubBotActivity(projectId, `@${req.user.username} created branch \`${branch_name.trim()}\` from \`${from_branch}\``, req.user, io);
      return res.status(201).json({
        success: true,
        message: `Branch "${branch_name}" created successfully from "${from_branch}"`,
        branch: branch_name.trim(),
      });
    }

    const errData = await newRefRes.json().catch(() => ({}));
    res.status(newRefRes.status).json({
      error: { code: 'GITHUB_API_ERROR', message: errData.message || 'Failed to create branch on GitHub' },
    });
  } catch (err) {
    console.error('Create branch error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create branch' } });
  }
});

// POST /api/v1/projects/:id/github/pulls - create a Pull Request on GitHub
router.post('/:id/github/pulls', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { title, head, base = 'main', body = '', token: overrideToken } = req.body;

    if (!title || !title.trim() || !head || !head.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Pull request title and head branch are required' } });
    }

    const [projects] = await pool.query('SELECT github_repo, github_token FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (projects.length === 0 || !projects[0].github_repo) {
      return res.status(400).json({ error: { code: 'NOT_CONNECTED', message: 'No GitHub repository connected' } });
    }

    const githubRepo = projects[0].github_repo;
    const [owner, repo] = githubRepo.split('/');
    const effectiveToken = overrideToken || projects[0].github_token || process.env.GITHUB_TOKEN;

    if (!effectiveToken) {
      const io = req.app.get('io');
      await postGitHubBotActivity(projectId, `@${req.user.username} opened Pull Request: "${title.trim()}" (\`${head}\` -> \`${base}\`)`, req.user, io);
      return res.status(201).json({
        success: true,
        simulated: true,
        message: `Pull Request "${title}" prepared from "${head}" into "${base}". Add a GitHub Personal Access Token to open live pull requests.`,
        pull_request: {
          number: 1,
          title: title.trim(),
          url: `https://github.com/${owner}/${repo}/pull/1`,
          state: 'open',
        },
      });
    }

    const prRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'Collabry-App',
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${effectiveToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          head: head.trim(),
          base: base.trim(),
          body: body || '',
        }),
      }
    );

    if (prRes.ok) {
      const prData = await prRes.json();
      const io = req.app.get('io');
      if (io) {
        io.to(`project:${projectId}`).emit('project:github_updated', { github_repo: githubRepo });
      }
      await postGitHubBotActivity(projectId, `@${req.user.username} opened Pull Request #${prData.number}: "${title.trim()}" (\`${head}\` -> \`${base}\`)`, req.user, io);

      return res.status(201).json({
        success: true,
        message: `Pull Request #${prData.number} created successfully on GitHub!`,
        pull_request: {
          number: prData.number,
          title: prData.title,
          url: prData.html_url,
          state: prData.state,
        },
      });
    }

    const errData = await prRes.json().catch(() => ({}));
    let errMsg = errData.message || 'Failed to create pull request on GitHub';
    if (errMsg.includes('Resource not accessible by personal access token')) {
      errMsg = 'GitHub Token Permission Error: "Resource not accessible by personal access token". Your token lacks permission to manage Pull Requests. Fix this on GitHub: (1) If using a Fine-grained Token, enable "Pull requests: Read and write" and "Contents: Read and write" under Repository Permissions. (2) If using a Classic Token (ghp_...), check the "repo" scope checkbox. (3) Ensure the token has access to repository ' + githubRepo + '.';
    }
    res.status(prRes.status).json({
      error: { code: 'GITHUB_API_ERROR', message: errMsg },
    });
  } catch (err) {
    console.error('Create pull request error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create pull request' } });
  }
});

// PUT /api/v1/projects/:id/github/pulls/:number/merge - merge a pull request
router.put('/:id/github/pulls/:number/merge', authenticate, async (req, res) => {
  try {
    const { id: projectId, number: pullNumber } = req.params;
    const { commit_title, merge_method = 'merge', token: overrideToken } = req.body;

    const [projects] = await pool.query('SELECT github_repo, github_token FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (projects.length === 0 || !projects[0].github_repo) {
      return res.status(400).json({ error: { code: 'NOT_CONNECTED', message: 'No GitHub repository connected' } });
    }

    const githubRepo = projects[0].github_repo;
    const [owner, repo] = githubRepo.split('/');
    const effectiveToken = overrideToken || projects[0].github_token || process.env.GITHUB_TOKEN;

    if (!effectiveToken) {
      const io = req.app.get('io');
      await postGitHubBotActivity(projectId, `@${req.user.username} merged Pull Request #${pullNumber} (${merge_method})`, req.user, io);
      return res.json({
        success: true,
        simulated: true,
        message: `Pull Request #${pullNumber} merged in simulation mode (${merge_method}). Connect a GitHub Personal Access Token to merge live on GitHub.`,
      });
    }

    const mergeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${encodeURIComponent(pullNumber)}/merge`,
      {
        method: 'PUT',
        headers: {
          'User-Agent': 'Collabry-App',
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${effectiveToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commit_title: commit_title || `Merge pull request #${pullNumber}`,
          merge_method,
        }),
      }
    );

    if (mergeRes.ok) {
      const io = req.app.get('io');
      if (io) {
        io.to(`project:${projectId}`).emit('project:github_updated', { github_repo: githubRepo });
      }
      await postGitHubBotActivity(projectId, `@${req.user.username} merged Pull Request #${pullNumber} (${merge_method})`, req.user, io);
      return res.json({
        success: true,
        message: `Pull Request #${pullNumber} successfully merged on GitHub!`,
      });
    }

    const errData = await mergeRes.json().catch(() => ({}));
    let errMsg = errData.message || 'Failed to merge pull request on GitHub';
    if (errMsg.includes('Resource not accessible by personal access token')) {
      errMsg = 'GitHub Token Permission Error: "Resource not accessible by personal access token". Your token lacks permission to merge Pull Requests. Fix this on GitHub: (1) If using a Fine-grained Token, enable "Pull requests: Read and write" and "Contents: Read and write" under Repository Permissions. (2) If using a Classic Token (ghp_...), check the "repo" scope checkbox. (3) Ensure the token has access to repository ' + githubRepo + '.';
    }
    res.status(mergeRes.status).json({
      error: { code: 'GITHUB_API_ERROR', message: errMsg },
    });
  } catch (err) {
    console.error('Merge pull request error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to merge pull request' } });
  }
});

// POST /api/v1/projects/:id/github/delete-file - delete a file from GitHub repository
router.post('/:id/github/delete-file', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { file_path, branch = 'main', commit_message } = req.body;

    if (!file_path || !file_path.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'File path to delete is required' } });
    }

    const [projects] = await pool.query('SELECT github_repo, github_token FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (projects.length === 0 || !projects[0].github_repo) {
      return res.status(400).json({ error: { code: 'NOT_CONNECTED', message: 'No GitHub repository connected' } });
    }

    const githubRepo = projects[0].github_repo;
    const [owner, repo] = githubRepo.split('/');
    const effectiveToken = projects[0].github_token || process.env.GITHUB_TOKEN;

    const cleanPath = file_path.trim().replace(/^(\.\/|\/)+/, '');
    const apiPath = cleanPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');

    if (!effectiveToken) {
      const io = req.app.get('io');
      await postGitHubBotActivity(projectId, `@${req.user.username} removed file \`${cleanPath}\` from branch \`${branch}\` (simulation mode)`, req.user, io);
      return res.json({
        success: true,
        simulated: true,
        message: `File "${cleanPath}" removal staged for branch "${branch}". Add a GitHub Personal Access Token to commit file deletions live.`,
        file_path: cleanPath,
        branch,
      });
    }

    const headers = {
      'User-Agent': 'Collabry-App',
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${effectiveToken}`,
      'Content-Type': 'application/json',
    };

    // 1. Fetch file to obtain current sha
    const checkRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${apiPath}?ref=${encodeURIComponent(branch)}`,
      { headers }
    );

    if (!checkRes.ok) {
      return res.status(404).json({
        error: { code: 'FILE_NOT_FOUND', message: `File "${cleanPath}" not found on branch "${branch}"` },
      });
    }

    const checkData = await checkRes.json();
    const sha = checkData.sha;

    // 2. Delete file via GitHub Contents API
    const deleteRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${apiPath}`,
      {
        method: 'DELETE',
        headers,
        body: JSON.stringify({
          message: commit_message?.trim() || `chore: delete ${cleanPath}`,
          sha,
          branch,
        }),
      }
    );

    if (deleteRes.ok) {
      const io = req.app.get('io');
      if (io) {
        io.to(`project:${projectId}`).emit('project:github_updated', { github_repo: githubRepo });
      }
      await postGitHubBotActivity(projectId, `@${req.user.username} removed file \`${cleanPath}\` from branch \`${branch}\``, req.user, io);

      return res.json({
        success: true,
        message: `File "${cleanPath}" successfully removed from branch "${branch}" on GitHub!`,
        file_path: cleanPath,
        branch,
      });
    }

    const errData = await deleteRes.json().catch(() => ({}));
    res.status(deleteRes.status).json({
      error: { code: 'GITHUB_API_ERROR', message: errData.message || 'Failed to delete file from GitHub' },
    });
  } catch (err) {
    console.error('Delete GitHub file error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete file from GitHub' } });
  }
});

// DELETE /api/v1/projects/:id/github - disconnect GitHub repo
router.delete('/:id/github', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const [membership] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, req.user.id]);
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member' } });
    }

    await pool.query('UPDATE projects SET github_repo = NULL, github_token = NULL WHERE id = ?', [projectId]);
    res.json({ message: 'GitHub repository disconnected successfully' });
  } catch (err) {
    console.error('Disconnect GitHub error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to disconnect GitHub' } });
  }
});


module.exports = router;
