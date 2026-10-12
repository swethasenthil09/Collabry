import { useState, useEffect, useRef } from 'react';
import api, { resolveMediaUrl } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import ConfirmModal from '../common/ConfirmModal';
import { IconClose, IconGithub, IconTrash, IconCopy, IconCheck, IconTag } from '../common/Icons';

export default function ProjectGitHub({ project }) {
  const { user } = useAuth();
  const [githubData, setGithubData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const notifySuccess = (msg) => {
    setError('');
    setSuccessMsg(msg);
    if (window._gitSuccessTimer) clearTimeout(window._gitSuccessTimer);
    window._gitSuccessTimer = setTimeout(() => setSuccessMsg(''), 5000);
  };

  const notifyError = (msg) => {
    setSuccessMsg('');
    setError(msg);
    if (window._gitErrorTimer) clearTimeout(window._gitErrorTimer);
    window._gitErrorTimer = setTimeout(() => setError(''), 5000);
  };

  // Connect form state
  const [repoInput, setRepoInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // Active Git View Tab: 'push_resources' | 'commits' | 'pulls' | 'workflows'
  const [activeGitTab, setActiveGitTab] = useState('push_resources');

  // Push Files & Resources State (Unified Drag-and-drop & Workspace files)
  const [workspaceFiles, setWorkspaceFiles] = useState([]);
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [pushBranch, setPushBranch] = useState('main');
  const [commitMessage, setCommitMessage] = useState('feat(collabry): update repository codebase');
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  // Dropped / Selected Direct Files
  const [directFiles, setDirectFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const filePickerRef = useRef(null);
  const folderPickerRef = useRef(null);


  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueBody, setIssueBody] = useState('');
  const [issueLabelsInput, setIssueLabelsInput] = useState('');
  const [issueToken, setIssueToken] = useState('');
  const [creatingIssue, setCreatingIssue] = useState(false);

  // Issues Filter & Interaction State
  const [issueFilter, setIssueFilter] = useState('open'); // 'open' | 'closed' | 'all'
  const [issueSearch, setIssueSearch] = useState('');
  const [expandedIssues, setExpandedIssues] = useState({});
  const [reopeningIssueId, setReopeningIssueId] = useState(null);

  const [showBranchModal, setShowBranchModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [fromBranch, setFromBranch] = useState('main');
  const [creatingBranch, setCreatingBranch] = useState(false);

  // Pull Request Modal State
  const [showPRModal, setShowPRModal] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [prHead, setPrHead] = useState('');
  const [prBase, setPrBase] = useState('main');
  const [prBody, setPrBody] = useState('');
  const [prToken, setPrToken] = useState('');
  const [creatingPR, setCreatingPR] = useState(false);

  // Delete File from Repo Modal State
  const [showDeleteFileModal, setShowDeleteFileModal] = useState(false);
  const [deleteFilePath, setDeleteFilePath] = useState('');
  const [deleteFileBranch, setDeleteFileBranch] = useState('main');
  const [deleteCommitMsg, setDeleteCommitMsg] = useState('');
  const [deletingFile, setDeletingFile] = useState(false);

  // Token Configuration Modal State
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [patInput, setPatInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  // Issue resolution and PR merge states
  const [closingIssueId, setClosingIssueId] = useState(null);
  const [showMergePRModal, setShowMergePRModal] = useState(false);
  const [selectedPRForMerge, setSelectedPRForMerge] = useState(null);
  const [mergeMethod, setMergeMethod] = useState('merge');
  const [mergeCommitTitle, setMergeCommitTitle] = useState('');
  const [mergeToken, setMergeToken] = useState('');
  const [mergingPR, setMergingPR] = useState(false);

  // Live Code & File Preview State
  const [selectedPreviewPath, setSelectedPreviewPath] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewFilter, setPreviewFilter] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [previewMode, setPreviewMode] = useState('code');
  const [gitPreviewDevice, setGitPreviewDevice] = useState('desktop'); // 'desktop' | 'tablet' | 'mobile'

  const isMember = Boolean(
    project?.is_member ||
    project?.user_role ||
    project?.role ||
    project?.created_by === user?.id
  );

  useEffect(() => {
    if (project?.id) {
      loadGitHubData();
      loadWorkspaceFiles();
    }
  }, [project?.id]);

  // Real-time socket sync
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !project?.id) return;

    const handleGitHubUpdated = () => {
      loadGitHubData();
    };

    socket.on('project:github_updated', handleGitHubUpdated);
    return () => {
      socket.off('project:github_updated', handleGitHubUpdated);
    };
  }, [project?.id]);

  const loadGitHubData = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/projects/${project.id}/github`);
      setGithubData(res.data);
      if (res.data?.default_branch) {
        setPushBranch(res.data.default_branch);
        setFromBranch(res.data.default_branch);
        setDeleteFileBranch(res.data.default_branch);
        setPrBase(res.data.default_branch);
      }
    } catch (err) {
      console.error('Fetch GitHub data error:', err);
      notifyError('Failed to load GitHub repository details');
    } finally {
      setLoading(false);
    }
  };

  const loadWorkspaceFiles = async () => {
    setLoadingFiles(true);
    try {
      const res = await api.get(`/projects/${project.id}/files`);
      // Filter out pure external links
      const fileList = (res.data || []).filter((f) => f.category !== 'link' && f.mime_type !== 'link');
      setWorkspaceFiles(fileList);
    } catch (err) {
      console.error('Fetch workspace files error:', err);
    } finally {
      setLoadingFiles(false);
    }
  };

  // Connect or Update GitHub Repo
  const handleConnectRepo = async (e) => {
    e.preventDefault();
    if (!repoInput.trim()) return;

    setConnecting(true);
    try {
      await api.put(`/projects/${project.id}/github`, {
        github_repo: repoInput.trim(),
        github_token: tokenInput.trim() || undefined,
      });
      await loadGitHubData();
      setRepoInput('');
      setTokenInput('');
      notifySuccess('GitHub repository linked successfully!');
    } catch (err) {
      notifyError(err.response?.data?.error?.message || 'Failed to connect GitHub repository');
    } finally {
      setConnecting(false);
    }
  };

  // Unlink GitHub Repo
  const handleUnlinkRepo = async () => {
    try {
      await api.delete(`/projects/${project.id}/github`);
      setGithubData({ connected: false });
      setConfirmUnlink(false);
      notifySuccess('Repository unlinked.');
    } catch (err) {
      notifyError('Failed to unlink repository');
    }
  };

  // Toggle selection of workspace file
  const toggleFileSelection = (fileId) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const selectAllFiles = () => {
    if (selectedFileIds.size === workspaceFiles.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(workspaceFiles.map((f) => f.id)));
    }
  };

  // Process raw files/folders for GitHub push (.gitignore preserved, node_modules/.git excluded)
  const processFilesForGit = async (rawFiles) => {
    if (!rawFiles || rawFiles.length === 0) return;

    // Check for .gitignore in uploaded files
    const gitignoreFile = rawFiles.find((f) => f.name === '.gitignore');
    let customIgnoreRules = [];
    if (gitignoreFile) {
      try {
        const text = await gitignoreFile.text();
        customIgnoreRules = text
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'));
      } catch (e) { }
    }

    // Filter files: KEEP .gitignore itself, but exclude .git/, node_modules, and patterns inside .gitignore
    const eligible = [];
    for (const file of rawFiles) {
      const pathStr = (file.webkitRelativePath || file.name).replace(/\\/g, '/');

      // Always exclude internal .git folder and OS junk
      if (pathStr.includes('/.git/') || pathStr.startsWith('.git/')) continue;
      if (pathStr.includes('/node_modules/') || pathStr.startsWith('node_modules/')) continue;
      if (pathStr.endsWith('/.DS_Store') || pathStr === '.DS_Store') continue;
      if (pathStr.endsWith('/Thumbs.db') || pathStr === 'Thumbs.db') continue;

      // Notice: If it IS .gitignore, KEEP IT!
      const isGitIgnoreFile = pathStr.endsWith('/.gitignore') || pathStr === '.gitignore';

      if (!isGitIgnoreFile) {
        let isIgnored = false;
        for (const rule of customIgnoreRules) {
          const cleanRule = rule.replace(/^\//, '').replace(/\/$/, '');
          if (cleanRule && (pathStr.includes(`/${cleanRule}/`) || pathStr.endsWith(`/${cleanRule}`) || pathStr.startsWith(`${cleanRule}/`))) {
            isIgnored = true;
            break;
          }
        }
        if (isIgnored) continue;
      }

      try {
        const arrayBuf = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const b64 = window.btoa(binary);

        eligible.push({
          name: file.name,
          path: file.webkitRelativePath || file.name,
          size: file.size,
          contentBase64: b64,
        });
      } catch (readErr) {
        console.warn('Read file notice:', readErr);
      }
    }

    setDirectFiles((prev) => {
      const existingPaths = new Set(prev.map((f) => f.path));
      const newlyAdded = eligible.filter((f) => !existingPaths.has(f.path));
      return [...prev, ...newlyAdded];
    });
  };

  const handleDirectDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    if (droppedFiles.length > 0) {
      await processFilesForGit(droppedFiles);
    }
  };

  // Push Files to GitHub (combines dropped codebase files + selected workspace resources)
  const handlePushToGitHub = async (e) => {
    e.preventDefault();
    if (selectedFileIds.size === 0 && directFiles.length === 0) {
      notifyError('Please drag/drop code files or select workspace resources to commit.');
      return;
    }

    setPushing(true);
    setPushResult(null);

    try {
      const res = await api.post(`/projects/${project.id}/github/push`, {
        file_ids: Array.from(selectedFileIds),
        direct_files: directFiles,
        commit_message: commitMessage.trim() || 'feat(collabry): update repository codebase',
        branch: pushBranch.trim() || 'main',
      });

      setPushResult(res.data);
      notifySuccess(res.data.message || 'Committed and pushed to GitHub successfully!');
      setSelectedFileIds(new Set());
      setDirectFiles([]);
      await loadGitHubData();
    } catch (err) {
      notifyError(err.response?.data?.error?.message || 'Failed to push to GitHub');
    } finally {
      setPushing(false);
    }
  };


  // Create GitHub Issue
  const handleCreateIssue = async (e) => {
    e.preventDefault();
    if (!issueTitle.trim()) return;

    setCreatingIssue(true);
    try {
      const parsedLabels = issueLabelsInput
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean);

      const res = await api.post(`/projects/${project.id}/github/issues`, {
        title: issueTitle.trim(),
        body: issueBody.trim(),
        labels: parsedLabels,
        token: issueToken.trim() || undefined,
      });
      setShowIssueModal(false);
      setIssueTitle('');
      setIssueBody('');
      setIssueLabelsInput('');
      setIssueToken('');
      notifySuccess(res.data.message || 'GitHub issue created!');
      await loadGitHubData();
    } catch (err) {
      notifyError(err.response?.data?.error?.message || 'Failed to create issue');
    } finally {
      setCreatingIssue(false);
    }
  };

  // Create GitHub Branch
  const handleCreateBranch = async (e) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;

    setCreatingBranch(true);
    try {
      const res = await api.post(`/projects/${project.id}/github/branches`, {
        branch_name: newBranchName.trim(),
        from_branch: fromBranch.trim() || 'main',
      });
      setShowBranchModal(false);
      setNewBranchName('');
      notifySuccess(res.data.message || `Branch "${newBranchName}" created!`);
      await loadGitHubData();
    } catch (err) {
      notifyError(err.response?.data?.error?.message || 'Failed to create branch');
    } finally {
      setCreatingBranch(false);
    }
  };

  // Handle Create Pull Request
  const handleCreatePR = async (e) => {
    e.preventDefault();
    if (!prTitle.trim() || !prHead.trim()) return;

    setCreatingPR(true);
    try {
      const res = await api.post(`/projects/${project.id}/github/pulls`, {
        title: prTitle.trim(),
        head: prHead.trim(),
        base: prBase.trim() || 'main',
        body: prBody.trim(),
        token: prToken.trim() || undefined,
      });
      setShowPRModal(false);
      setPrTitle('');
      setPrHead('');
      setPrBody('');
      setPrToken('');
      notifySuccess(res.data.message || 'Pull request created successfully!');
      await loadGitHubData();
    } catch (err) {
      notifyError(err.response?.data?.error?.message || 'Failed to create pull request');
    } finally {
      setCreatingPR(false);
    }
  };

  // Handle Delete File from GitHub Repository
  const handleDeleteGitHubFile = async (e) => {
    e.preventDefault();
    if (!deleteFilePath.trim()) return;

    setDeletingFile(true);
    try {
      const res = await api.post(`/projects/${project.id}/github/delete-file`, {
        file_path: deleteFilePath.trim(),
        branch: deleteFileBranch.trim() || 'main',
        commit_message: deleteCommitMsg.trim() || `chore: delete ${deleteFilePath.trim()}`,
      });
      setShowDeleteFileModal(false);
      setDeleteFilePath('');
      setDeleteCommitMsg('');
      notifySuccess(res.data.message || 'File deleted from GitHub repository!');
      await loadGitHubData();
    } catch (err) {
      notifyError(err.response?.data?.error?.message || 'Failed to delete file from GitHub');
    } finally {
      setDeletingFile(false);
    }
  };

  const handleSaveToken = async (e) => {
    e.preventDefault();
    setSavingToken(true);
    try {
      await api.put(`/projects/${project.id}/github`, {
        github_repo: githubData.repo,
        github_token: patInput.trim(),
      });
      setShowTokenModal(false);
      setPatInput('');
      notifySuccess(patInput.trim() ? 'Personal Access Token saved!' : 'Personal Access Token cleared.');
      await loadGitHubData();
    } catch (err) {
      notifyError(err.response?.data?.error?.message || 'Failed to update token');
    } finally {
      setSavingToken(false);
    }
  };

  // Close an Issue
  const handleCloseIssue = async (issueNumber) => {
    setClosingIssueId(issueNumber);
    try {
      const res = await api.patch(`/projects/${project.id}/github/issues/${issueNumber}/close`, {
        state_reason: 'completed',
      });
      notifySuccess(res.data.message || `Issue #${issueNumber} closed successfully!`);
      await loadGitHubData();
    } catch (err) {
      notifyError(err.response?.data?.error?.message || 'Failed to close issue');
    } finally {
      setClosingIssueId(null);
    }
  };

  // Reopen an Issue
  const handleReopenIssue = async (issueNumber) => {
    setReopeningIssueId(issueNumber);
    try {
      const res = await api.patch(`/projects/${project.id}/github/issues/${issueNumber}/reopen`);
      notifySuccess(res.data.message || `Issue #${issueNumber} reopened successfully!`);
      await loadGitHubData();
    } catch (err) {
      notifyError(err.response?.data?.error?.message || 'Failed to reopen issue');
    } finally {
      setReopeningIssueId(null);
    }
  };

  const toggleIssueExpanded = (issueNumber) => {
    setExpandedIssues((prev) => ({
      ...prev,
      [issueNumber]: !prev[issueNumber],
    }));
  };

  // Merge a Pull Request
  const handleMergePR = async (e) => {
    e.preventDefault();
    if (!selectedPRForMerge) return;

    setMergingPR(true);
    try {
      const res = await api.put(`/projects/${project.id}/github/pulls/${selectedPRForMerge.number}/merge`, {
        commit_title: mergeCommitTitle.trim() || undefined,
        merge_method: mergeMethod,
        token: mergeToken.trim() || undefined,
      });
      setShowMergePRModal(false);
      setSelectedPRForMerge(null);
      setMergeCommitTitle('');
      setMergeToken('');
      notifySuccess(res.data.message || `Pull Request #${selectedPRForMerge.number} merged!`);
      await loadGitHubData();
    } catch (err) {
      notifyError(err.response?.data?.error?.message || 'Failed to merge pull request');
    } finally {
      setMergingPR(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getFileIcon = (fileName = '') => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return '⚛️';
    if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return '⚙️';
    if (['md', 'txt', 'markdown'].includes(ext)) return '📝';
    if (['css', 'scss', 'less'].includes(ext)) return '🎨';
    if (['html', 'svg'].includes(ext)) return '🌐';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return '🖼️';
    if (['sql'].includes(ext)) return '🗄️';
    return '📄';
  };

  const loadRepoFileContent = async (filePath, branch, forceMode) => {
    if (!filePath || !project?.id) return;
    const targetBranch = branch || githubData?.default_branch || 'main';
    setSelectedPreviewPath(filePath);
    setLoadingPreview(true);
    setCopiedCode(false);

    if (forceMode) {
      setPreviewMode(forceMode);
    } else if (filePath.toLowerCase().endsWith('.html') || filePath.toLowerCase().endsWith('.htm')) {
      setPreviewMode('rendered');
    } else {
      setPreviewMode('code');
    }

    try {
      const res = await api.get(`/projects/${project.id}/github/file-content`, {
        params: { path: filePath, branch: targetBranch },
      });
      setPreviewData(res.data);
    } catch (err) {
      console.error('Failed to load repo file content:', err);
      notifyError(err.response?.data?.error?.message || `Failed to preview file "${filePath}"`);
      setPreviewData(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCopyCode = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    notifySuccess('Code copied to clipboard!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleOpenLiveDemoNewTab = () => {
    if (!previewData?.content) return;
    try {
      const blob = new Blob([previewData.content], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (err) {
      console.error('Failed to open demo in new tab:', err);
    }
  };

  const runWorkspaceLiveDemo = async (wsFile) => {
    if (!wsFile) return;
    setSelectedPreviewPath(wsFile.name);
    setPreviewMode('rendered');
    setLoadingPreview(true);
    try {
      const url = resolveMediaUrl(wsFile.file_url);
      const res = await fetch(url);
      const html = await res.text();
      setPreviewData({
        content: html,
        size: wsFile.file_size || html.length,
        html_url: null,
      });
    } catch (err) {
      console.error('Failed to load workspace html demo:', err);
      notifyError(`Failed to load ${wsFile.name}`);
    } finally {
      setLoadingPreview(false);
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="main-body" style={{ maxWidth: '1120px', margin: '0 auto', width: '100%', padding: '24px 20px' }}>
      {/* Top Banner & Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <IconGithub size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-heading)' }}>
              GitHub & Code Repository Hub
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '3px 0 0' }}>
              Connect code repositories, push workspace resources, create pull requests, and track issues directly from Collabry.
            </p>
          </div>
        </div>

        {githubData?.connected && isMember && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowIssueModal(true)}
              title="Create a new GitHub issue"
              style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}
            >
              New Issue
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowBranchModal(true)}
              title="Create a new Git branch"
              style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}
            >
              New Branch
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowPRModal(true)}
              title="Create a new GitHub Pull Request"
              style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}
            >
              Pull Request
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowDeleteFileModal(true)}
              title="Delete a file from GitHub repository"
              style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}
            >
              Delete File
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowTokenModal(true)}
              title="Configure Personal Access Token (PAT) for this workspace"
              style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}
            >
              🔑 {githubData.has_token ? 'Update PAT' : 'Configure PAT'}
            </button>

            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirmUnlink(true)}
              title="Disconnect this GitHub repository"
              style={{
                color: 'var(--discord-red)',
                border: '1px solid rgba(242, 63, 67, 0.35)',
                background: 'rgba(242, 63, 67, 0.08)',
                fontSize: '12px',
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Unlink
            </button>
          </div>
        )}
      </div>

      {/* Global Alerts */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(242, 63, 67, 0.15)',
            border: '1px solid rgba(242, 63, 67, 0.35)',
            color: 'var(--discord-red)',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          <span>⚠️ {error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            title="Dismiss"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--discord-red)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 700,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && !error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(59, 165, 93, 0.15)',
            border: '1px solid rgba(59, 165, 93, 0.35)',
            color: 'var(--accent-green)',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          <span>✅ {successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg('')}
            title="Dismiss"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-green)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 700,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. STATE A: NOT CONNECTED (Clean Connect Form) */}
      {!githubData?.connected ? (
        <div
          className="panel-card"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-lg)',
            padding: '32px 28px',
            maxWidth: '680px',
            margin: '20px auto',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ display: 'inline-flex', padding: 14, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.06)', marginBottom: 12 }}>
              <IconGithub size={36} />
            </div>
            <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)' }}>
              Connect a GitHub Repository
            </h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '440px', margin: '8px auto 0' }}>
              Link your repository to push files directly from Collabry, track live commits, create issues, and trigger GitHub Actions.
            </p>
          </div>

          <form onSubmit={handleConnectRepo}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                Repository (owner/repo or URL) <span style={{ color: 'var(--discord-red)' }}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. facebook/react or https://github.com/myorg/myproject"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-medium)',
                  color: 'var(--text-normal)',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
                  Personal Access Token (PAT) <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>(Optional for live push/triggers)</span>
                </label>
              </div>
              <input
                type="password"
                placeholder="ghp_... or fine-grained token with repo permissions"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-medium)',
                  color: 'var(--text-normal)',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: 5 }}>
                Without a token, repository tracking works in read-only and simulation mode. With a token, you can push live commits and trigger workflows.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={connecting || !repoInput.trim()}
                style={{ padding: '9px 20px', fontWeight: 700 }}
              >
                {connecting ? 'Connecting...' : 'Connect Repository'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* 2. STATE B: CONNECTED (Dashboard & 2-Way Upload Flow) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Active Repository Card Banner */}
          <div
            className="panel-card"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <a
                  href={githubData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontWeight: 800,
                    fontSize: '16px',
                    color: 'var(--discord-blurple)',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <IconGithub size={18} />
                  <span>{githubData.repo}</span>
                  <span style={{ fontSize: '12px', opacity: 0.8 }}>↗</span>
                </a>

                {/* Badges */}
                <button
                  type="button"
                  onClick={() => setShowTokenModal(true)}
                  title="Click to configure or update Personal Access Token"
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: githubData.has_token ? 'rgba(59, 165, 93, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                    color: githubData.has_token ? 'var(--accent-green)' : 'var(--text-muted)',
                    border: `1px solid ${githubData.has_token ? 'rgba(59, 165, 93, 0.4)' : 'var(--border-medium)'}`,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {githubData.has_token ? 'Write Enabled (Token Configured)' : ' Read-Only Mode (Click to Add Token)'}
                </button>

                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-normal)',
                    border: '1px solid var(--border-medium)',
                  }}
                >
                  Default: <strong>{githubData.default_branch || 'main'}</strong>
                </span>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '12px', color: 'var(--text-muted)' }}>
                <span>{githubData.stars ?? 0} stars</span>
                <span>{githubData.forks ?? 0} forks</span>
                <span>{githubData.open_issues ?? 0} issues</span>
              </div>
            </div>

            {githubData.description && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '8px 0 0' }}>
                {githubData.description}
              </p>
            )}
          </div>

          {/* Section Navigation Tabs */}
          <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-medium)', paddingBottom: 10, flexWrap: 'wrap' }}>
            <button
              className={`btn ${activeGitTab === 'push_resources' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setActiveGitTab('push_resources')}
              style={{ fontSize: '12px', fontWeight: 700 }}
            >
              Commit & Push to GitHub
            </button>

            <button
              className={`btn ${activeGitTab === 'pulls' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setActiveGitTab('pulls')}
              style={{ fontSize: '12px', fontWeight: 700 }}
            >
              Pull Requests ({githubData.pull_requests?.length || 0})
            </button>

            <button
              className={`btn ${activeGitTab === 'issues' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setActiveGitTab('issues')}
              style={{ fontSize: '12px', fontWeight: 700 }}
            >
              Issues ({(githubData.issues || []).filter((i) => i.state === 'open').length} open)
            </button>

            <button
              className={`btn ${activeGitTab === 'code_preview' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => {
                setActiveGitTab('code_preview');
                if (Array.isArray(githubData.repo_files) && githubData.repo_files.length > 0 && !selectedPreviewPath) {
                  const defaultFile = githubData.repo_files.find(f => f.path.toLowerCase().includes('readme')) || githubData.repo_files[0];
                  loadRepoFileContent(defaultFile.path);
                }
              }}
              style={{ fontSize: '12px', fontWeight: 700 }}
            >
              Live Code & Preview ({githubData.repo_files?.length || 0})
            </button>

            <button
              className={`btn ${activeGitTab === 'commits' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setActiveGitTab('commits')}
              style={{ fontSize: '12px', fontWeight: 700 }}
            >
              Recent Commits ({githubData.commits?.length || 0})
            </button>

          </div>

          {/* ============================================================== */}
          {/* TAB 1: COMMIT & PUSH TO GITHUB (Spacious Drag & Drop + Workspace Files) */}
          {/* ============================================================== */}
          {activeGitTab === 'push_resources' && (
            <div
              className="panel-card"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                padding: '24px 20px',
              }}
            >
              {/* Hidden file & folder pickers */}
              <input
                type="file"
                ref={filePickerRef}
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target?.files || []);
                  if (files.length > 0) processFilesForGit(files);
                  if (e.target) e.target.value = '';
                }}
                style={{ display: 'none' }}
              />
              <input
                type="file"
                ref={folderPickerRef}
                webkitdirectory=""
                directory=""
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target?.files || []);
                  if (files.length > 0) processFilesForGit(files);
                  if (e.target) e.target.value = '';
                }}
                style={{ display: 'none' }}
              />

              {/* Header with browse action buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-heading)' }}>
                    Commit & Push to {githubData.repo}
                  </h4>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Drag & drop codebase files or choose workspace resources below to commit directly to GitHub.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => filePickerRef.current?.click()}
                    style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px' }}
                  >
                    Browse Files
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => folderPickerRef.current?.click()}
                    style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px' }}
                  >
                    Browse Folder
                  </button>
                </div>
              </div>

              {/* Spacious Drag & Drop Upload Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDirectDrop}
                onClick={() => filePickerRef.current?.click()}
                style={{
                  border: isDragOver ? '2px dashed var(--discord-blurple)' : '2px dashed var(--border-medium)',
                  borderRadius: 'var(--radius-md)',
                  padding: '36px 24px',
                  textAlign: 'center',
                  background: isDragOver ? 'rgba(88, 101, 242, 0.12)' : 'var(--bg-subtle)',
                  cursor: 'pointer',
                  marginBottom: 18,
                  transition: 'all var(--transition-fast)',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: 'rgba(88, 101, 242, 0.14)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px',
                  }}
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--discord-blurple)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)' }}>
                  Click to browse or drag & drop files / folders here to push to GitHub
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  Supports files, folders, and source code repos up to 1 GB (automatically excludes node_modules and .git, preserves .gitignore)
                </p>
              </div>

              {/* Staged Direct Files List */}
              {directFiles.length > 0 && (
                <div style={{ marginBottom: 18, padding: '12px 16px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-heading)' }}>
                      📁 Staged Files from Local ({directFiles.length} files, {formatFileSize(directFiles.reduce((acc, f) => acc + (f.size || 0), 0))})
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setDirectFiles([])}
                      style={{ fontSize: '11px', color: 'var(--discord-red)', padding: '2px 8px' }}
                    >
                      Clear Staged Files
                    </button>
                  </div>
                  <div style={{ maxHeight: '160px', overflowY: 'auto', fontSize: '12px', fontFamily: 'monospace' }}>
                    {directFiles.slice(0, 30).map((f, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '3px 0',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        }}
                      >
                        <span style={{ color: f.name === '.gitignore' ? 'var(--accent-green)' : 'var(--text-normal)' }}>
                          {f.path} {f.name === '.gitignore' ? '← (.gitignore tracked & preserved)' : ''}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDirectFiles((prev) => prev.filter((_, idx) => idx !== i));
                          }}
                          title="Remove file from staged list"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--discord-red)',
                            cursor: 'pointer',
                            padding: '2px 6px',
                            fontSize: '13px',
                            fontWeight: 700,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {directFiles.length > 30 && (
                      <div style={{ color: 'var(--text-muted)', paddingTop: 4 }}>
                        ...and {directFiles.length - 30} more files
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Workspace File Selection Section */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-heading)' }}>
                    Or Select from Workspace Resources ({selectedFileIds.size} of {workspaceFiles.length} selected)
                  </span>
                  {workspaceFiles.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={selectAllFiles}
                      style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px' }}
                    >
                      {selectedFileIds.size === workspaceFiles.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {loadingFiles ? (
                  <div style={{ padding: 14, textAlign: 'center' }}><div className="spinner"></div></div>
                ) : workspaceFiles.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
                    No workspace files uploaded yet. You can drag and drop files above or add files in <em>Files & Resources</em>.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '220px', overflowY: 'auto' }}>
                    {workspaceFiles.map((f) => {
                      const isChecked = selectedFileIds.has(f.id);
                      return (
                        <div
                          key={f.id}
                          onClick={() => toggleFileSelection(f.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: isChecked ? 'rgba(88, 101, 242, 0.12)' : 'var(--bg-subtle)',
                            border: `1px solid ${isChecked ? 'var(--discord-blurple)' : 'var(--border-medium)'}`,
                            cursor: 'pointer',
                            transition: 'background var(--transition-fast)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => { }}
                              style={{ cursor: 'pointer' }}
                            />
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-heading)' }}>
                                {f.name}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {f.folder_path ? `📂 ${f.folder_path} • ` : ''}
                                {formatFileSize(f.file_size)} • {f.category}
                              </div>
                            </div>
                          </div>

                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {isChecked ? 'Selected' : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Commit Controls */}
              <form onSubmit={handlePushToGitHub} style={{ borderTop: '1px solid var(--border-medium)', paddingTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Commit Message <span style={{ color: 'var(--discord-red)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-normal)',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Target Branch <span style={{ color: 'var(--discord-red)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={pushBranch}
                      onChange={(e) => setPushBranch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-normal)',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Total to commit: <strong>{directFiles.length + selectedFileIds.size} file(s)</strong> ({directFiles.length} direct, {selectedFileIds.size} workspace)
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={pushing || (selectedFileIds.size === 0 && directFiles.length === 0)}
                    style={{ padding: '8px 20px', fontWeight: 700, fontSize: '13px' }}
                  >
                    {pushing ? 'Pushing to GitHub...' : `Commit & Push ${directFiles.length + selectedFileIds.size} File(s) to GitHub`}
                  </button>
                </div>
              </form>

              {/* Push Results with Pull Request & File Removal Options */}
              {pushResult && (
                <div style={{ marginTop: 20, padding: '16px 18px', borderRadius: 'var(--radius-md)', background: 'rgba(59, 165, 93, 0.08)', border: '1px solid rgba(59, 165, 93, 0.35)', fontSize: '13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, color: 'var(--accent-green)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>🚀</span> Pushed Successfully to branch <code>{pushResult.branch || pushBranch}</code>!
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: 2 }}>{pushResult.message}</div>
                    </div>

                    {/* Quick Post-Push Actions */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setPrHead(pushResult.branch || pushBranch);
                          setPrBase(githubData.default_branch || 'main');
                          setPrTitle(commitMessage || 'feat: update repository codebase');
                          setShowPRModal(true);
                        }}
                        style={{ fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <span>🔀</span> Open Pull Request
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setDeleteFileBranch(pushResult.branch || pushBranch);
                          setShowDeleteFileModal(true);
                        }}
                        style={{ fontSize: '12px', fontWeight: 600, color: 'var(--discord-red)', borderColor: 'rgba(242, 63, 67, 0.4)', display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <IconTrash size={14} /> Remove a File from Repo
                      </button>
                    </div>
                  </div>

                  {/* Pushed files list with individual remove file option */}
                  {Array.isArray(pushResult.pushed_files) && pushResult.pushed_files.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-heading)', marginBottom: 6 }}>
                        Committed Files ({pushResult.pushed_files.length}) — Click 'Remove' if you need to delete any file from GitHub:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '180px', overflowY: 'auto' }}>
                        {pushResult.pushed_files.map((pf, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '5px 10px',
                              background: 'var(--bg-subtle)',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border-medium)',
                              fontSize: '12px',
                            }}
                          >
                            <span style={{ fontFamily: 'monospace', color: 'var(--text-normal)' }}>
                              {pf.path}
                            </span>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setDeleteFilePath(pf.path);
                                setDeleteFileBranch(pushResult.branch || pushBranch);
                                setDeleteCommitMsg(`chore: delete ${pf.path}`);
                                setShowDeleteFileModal(true);
                              }}
                              title="Delete this file from GitHub repository"
                              style={{
                                color: 'var(--discord-red)',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <IconTrash size={12} /> Remove from Repo
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: LIVE CODE & REPOSITORY FILE PREVIEW */}
          {/* ============================================================== */}
          {activeGitTab === 'code_preview' && (
            <div
              className="panel-card"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                padding: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>💻</span> Live Code & Repository Preview
                  </h4>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Inspect remote source files and documentation in <strong>{githubData.repo}</strong> directly without leaving Collabry.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {(() => {
                    const htmlFile = (githubData.repo_files || []).find(
                      (f) => f.path.toLowerCase().endsWith('.html') || f.path.toLowerCase().endsWith('.htm')
                    );
                    const wsHtmlFile = (workspaceFiles || []).find(
                      (f) => f.name.toLowerCase().endsWith('.html') || f.name.toLowerCase().endsWith('.htm')
                    );

                    if (htmlFile) {
                      return (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => loadRepoFileContent(htmlFile.path, undefined, 'rendered')}
                          title={`Run live interactive demo (${htmlFile.path})`}
                          style={{ fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <span>🌐</span> Run Live Demo ({htmlFile.path})
                        </button>
                      );
                    }

                    if (wsHtmlFile) {
                      return (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => runWorkspaceLiveDemo(wsHtmlFile)}
                          title={`Run live interactive demo (${wsHtmlFile.name})`}
                          style={{ fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--discord-blurple)' }}
                        >
                          <span>🌐</span> Run Live Demo ({wsHtmlFile.name})
                        </button>
                      );
                    }

                    return null;
                  })()}

                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Branch:
                  </span>
                  <span
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid var(--border-medium)',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-heading)',
                    }}
                  >
                    🌱 {githubData.default_branch || 'main'}
                  </span>
                </div>
              </div>

              {/* Two-column layout: Left files list, Right code preview */}
              <div className="github-preview-grid" style={{ gap: 16, minHeight: '520px' }}>
                {/* File Tree Explorer (Left Column) */}
                <div
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '620px',
                  }}
                >
                  <div style={{ marginBottom: 10 }}>
                    <input
                      type="text"
                      placeholder="Filter repo files..."
                      value={previewFilter}
                      onChange={(e) => setPreviewFilter(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-normal)',
                        fontSize: '12px',
                      }}
                    />
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {!Array.isArray(githubData.repo_files) || githubData.repo_files.length === 0 ? (
                      <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                        No files detected in repository or empty branch.
                      </div>
                    ) : (
                      githubData.repo_files
                        .filter((rf) => !previewFilter || rf.path.toLowerCase().includes(previewFilter.toLowerCase()))
                        .map((rf, idx) => {
                          const isSelected = selectedPreviewPath === rf.path;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => loadRepoFileContent(rf.path)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '7px 10px',
                                borderRadius: 'var(--radius-sm)',
                                background: isSelected ? 'rgba(88, 101, 242, 0.18)' : 'transparent',
                                border: isSelected ? '1px solid rgba(88, 101, 242, 0.5)' : '1px solid transparent',
                                color: isSelected ? '#fff' : 'var(--text-normal)',
                                cursor: 'pointer',
                                textAlign: 'left',
                                width: '100%',
                                transition: 'all var(--transition-fast)',
                                fontSize: '12px',
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <span>{getFileIcon(rf.path)}</span>
                                <span style={{ fontFamily: 'monospace', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {rf.path}
                                </span>
                              </span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, marginLeft: 6 }}>
                                {formatFileSize(rf.size)}
                              </span>
                            </button>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* Live Code Viewer (Right Column) */}
                <div
                  style={{
                    background: '#0d1117',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '620px',
                    overflow: 'hidden',
                  }}
                >
                  {/* Code Viewer Header */}
                  <div
                    style={{
                      padding: '10px 16px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      borderBottom: '1px solid var(--border-medium)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '14px' }}>
                        {selectedPreviewPath ? getFileIcon(selectedPreviewPath) : '📄'}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: '#e6edf3' }}>
                        {selectedPreviewPath || 'No file selected'}
                      </span>
                      {previewData?.size !== undefined && (
                        <span style={{ fontSize: '11px', color: '#8b949e', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>
                          {formatFileSize(previewData.size)}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {(Boolean(selectedPreviewPath?.endsWith('.md')) || Boolean(selectedPreviewPath?.toLowerCase().endsWith('.html')) || Boolean(selectedPreviewPath?.toLowerCase().endsWith('.htm'))) && (
                        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: 2 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setPreviewMode('code')}
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              height: 'auto',
                              background: previewMode === 'code' ? 'rgba(88, 101, 242, 0.4)' : 'transparent',
                              color: '#fff',
                            }}
                          >
                            Code
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setPreviewMode('rendered')}
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              height: 'auto',
                              background: previewMode === 'rendered' ? 'rgba(88, 101, 242, 0.4)' : 'transparent',
                              color: '#fff',
                            }}
                          >
                            {selectedPreviewPath?.toLowerCase().endsWith('.html') || selectedPreviewPath?.toLowerCase().endsWith('.htm') ? '🌐 Live Demo' : 'Markdown'}
                          </button>
                        </div>
                      )}

                      {/* Device switchers when in Live Demo mode for HTML files */}
                      {previewMode === 'rendered' && (selectedPreviewPath?.toLowerCase().endsWith('.html') || selectedPreviewPath?.toLowerCase().endsWith('.htm')) && (
                        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: 2 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setGitPreviewDevice('desktop')}
                            style={{
                              fontSize: '11px',
                              padding: '2px 7px',
                              height: 'auto',
                              background: gitPreviewDevice === 'desktop' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                              color: '#fff',
                            }}
                            title="Desktop View (Full Width)"
                          >
                            🖥️
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setGitPreviewDevice('tablet')}
                            style={{
                              fontSize: '11px',
                              padding: '2px 7px',
                              height: 'auto',
                              background: gitPreviewDevice === 'tablet' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                              color: '#fff',
                            }}
                            title="Tablet View (820px)"
                          >
                            💻
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setGitPreviewDevice('mobile')}
                            style={{
                              fontSize: '11px',
                              padding: '2px 7px',
                              height: 'auto',
                              background: gitPreviewDevice === 'mobile' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                              color: '#fff',
                            }}
                            title="Mobile View (420px)"
                          >
                            📱
                          </button>
                        </div>
                      )}

                      {/* Open Full Live Demo in New Window */}
                      {previewMode === 'rendered' && (selectedPreviewPath?.toLowerCase().endsWith('.html') || selectedPreviewPath?.toLowerCase().endsWith('.htm')) && previewData?.content && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={handleOpenLiveDemoNewTab}
                          style={{ fontSize: '11px', padding: '4px 10px', height: 'auto', color: '#58a6ff', background: 'rgba(88, 166, 255, 0.12)', border: '1px solid rgba(88, 166, 255, 0.3)' }}
                          title="Open live interactive demo in full new browser window"
                        >
                          🌐 Popout Demo ↗
                        </button>
                      )}

                      {previewData?.content && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleCopyCode(previewData.content)}
                          style={{ fontSize: '11px', padding: '4px 10px', height: 'auto', color: '#e6edf3', background: 'rgba(255,255,255,0.08)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          {copiedCode ? <><IconCheck size={12} /> Copied</> : <><IconCopy size={12} /> Copy</>}
                        </button>
                      )}

                      {previewData?.html_url && (
                        <a
                          href={previewData.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '11px', padding: '4px 10px', height: 'auto', color: '#58a6ff' }}
                        >
                          GitHub ↗
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Code Viewer Body */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px', position: 'relative' }}>
                    {loadingPreview ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', gap: 12 }}>
                        <div className="spinner" />
                        <span style={{ fontSize: '13px', color: '#8b949e' }}>Loading file from GitHub...</span>
                      </div>
                    ) : !selectedPreviewPath ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', color: '#8b949e', textAlign: 'center' }}>
                        <span style={{ fontSize: '32px', marginBottom: 12 }}>👈</span>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#c9d1d9', marginBottom: 4 }}>
                          Choose a File to Inspect
                        </div>
                        <div style={{ fontSize: '12px', maxWidth: '320px' }}>
                          Select any file in the explorer on the left to read source code and previews directly in Collabry.
                        </div>
                      </div>
                    ) : previewMode === 'rendered' && (selectedPreviewPath?.toLowerCase().endsWith('.html') || selectedPreviewPath?.toLowerCase().endsWith('.htm')) ? (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          minHeight: '480px',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'flex-start',
                          background: 'rgba(0,0,0,0.25)',
                          padding: gitPreviewDevice !== 'desktop' ? '12px' : '0',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <div
                          style={{
                            width: gitPreviewDevice === 'mobile' ? '420px' : gitPreviewDevice === 'tablet' ? '820px' : '100%',
                            height: '100%',
                            minHeight: '480px',
                            background: '#ffffff',
                            borderRadius: gitPreviewDevice !== 'desktop' ? 'var(--radius-md)' : 'var(--radius-sm)',
                            boxShadow: gitPreviewDevice !== 'desktop' ? '0 8px 30px rgba(0,0,0,0.6)' : 'none',
                            overflow: 'hidden',
                            transition: 'width 0.2s ease',
                          }}
                        >
                          <iframe
                            srcDoc={previewData?.content || '<h1>Empty HTML document</h1>'}
                            title="Live Interactive Demo Preview"
                            sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
                            style={{
                              width: '100%',
                              height: '100%',
                              minHeight: '480px',
                              border: 'none',
                              display: 'block',
                            }}
                          />
                        </div>
                      </div>
                    ) : previewMode === 'rendered' && selectedPreviewPath?.endsWith('.md') ? (
                      <div
                        style={{
                          color: '#c9d1d9',
                          fontSize: '13px',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'system-ui, -apple-system, sans-serif',
                          padding: '8px',
                        }}
                      >
                        {previewData?.content || 'No content found.'}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace', fontSize: '12px', lineHeight: '20px' }}>
                        {/* Line Numbers */}
                        <div
                          style={{
                            userSelect: 'none',
                            color: '#484f58',
                            textAlign: 'right',
                            paddingRight: '16px',
                            borderRight: '1px solid rgba(255,255,255,0.08)',
                            marginRight: '16px',
                            minWidth: '36px',
                          }}
                        >
                          {(previewData?.content || '').split('\n').map((_, lineIdx) => (
                            <div key={lineIdx}>{lineIdx + 1}</div>
                          ))}
                        </div>

                        {/* Code Lines */}
                        <div style={{ flex: 1, overflowX: 'auto', color: '#e6edf3', whiteSpace: 'pre' }}>
                          {(previewData?.content || '').split('\n').map((line, lineIdx) => (
                            <div key={lineIdx} style={{ minHeight: '20px' }}>
                              {line || ' '}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: RECENT COMMITS FEED */}
          {/* ============================================================== */}
          {activeGitTab === 'commits' && (
            <div
              className="panel-card"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                padding: '20px',
              }}
            >
              <h4 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 800, color: 'var(--text-heading)' }}>
                Recent Commit Activity
              </h4>

              {githubData.commits?.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No recent commits found or repository is empty.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {githubData.commits.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-medium)',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '12px', color: 'var(--discord-blurple)' }}>
                            {c.sha}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.message}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 3 }}>
                          By <strong>{c.author}</strong> {c.date ? `• ${new Date(c.date).toLocaleDateString()}` : ''}
                        </div>
                      </div>

                      {c.url && (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '11px', textDecoration: 'none' }}
                        >
                          View Commit ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: PULL REQUESTS */}
          {/* ============================================================== */}
          {activeGitTab === 'pulls' && (
            <div
              className="panel-card"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                padding: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-heading)' }}>
                  Pull Requests
                </h4>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowPRModal(true)}
                  style={{ fontSize: '12px', fontWeight: 700 }}
                >
                  + New Pull Request
                </button>
              </div>

              {githubData.pull_requests?.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No pull requests currently open.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {githubData.pull_requests.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-medium)',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: p.state === 'open' ? 'var(--accent-green)' : 'var(--text-muted)', textTransform: 'uppercase' }}>
                            [{p.state}]
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-heading)' }}>
                            #{p.number} {p.title}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 3 }}>
                          Opened by {p.user} {p.created_at ? `• ${new Date(p.created_at).toLocaleDateString()}` : ''}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {p.state === 'open' && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setSelectedPRForMerge(p);
                              setShowMergePRModal(true);
                            }}
                            style={{ fontSize: '11px', fontWeight: 700, padding: '5px 12px' }}
                          >
                            Merge PR
                          </button>
                        )}

                        {p.url && (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '11px', textDecoration: 'none', padding: '5px 10px' }}
                          >
                            Review PR ↗
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB: GITHUB ISSUES */}
          {/* ============================================================== */}
          {activeGitTab === 'issues' && (() => {
            const allIssues = Array.isArray(githubData.issues) ? githubData.issues : [];
            const openIssues = allIssues.filter((i) => i.state === 'open');
            const closedIssues = allIssues.filter((i) => i.state === 'closed');

            const filteredIssues = allIssues.filter((issue) => {
              if (issueFilter === 'open' && issue.state !== 'open') return false;
              if (issueFilter === 'closed' && issue.state !== 'closed') return false;

              if (issueSearch.trim()) {
                const q = issueSearch.toLowerCase().trim();
                const matchTitle = (issue.title || '').toLowerCase().includes(q);
                const matchNumber = `#${issue.number}`.includes(q) || String(issue.number).includes(q);
                const matchAuthor = (issue.user || '').toLowerCase().includes(q);
                const matchBody = (issue.body || '').toLowerCase().includes(q);
                const matchLabel = Array.isArray(issue.labels) && issue.labels.some((l) => l.toLowerCase().includes(q));
                return matchTitle || matchNumber || matchAuthor || matchBody || matchLabel;
              }
              return true;
            });

            return (
              <div
                className="panel-card"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>🎯</span> GitHub Issues & Problem Tracker
                    </h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                      Track bugs, feature requests, and tasks for <strong>{githubData.repo}</strong> directly from Collabry.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowIssueModal(true)}
                    style={{ fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <span>+</span> New Issue
                  </button>
                </div>

                {/* Sub-bar: Filter Pills & Search Input */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16, padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)' }}>
                  {/* Filter Pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setIssueFilter('open')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: '1px solid',
                        background: issueFilter === 'open' ? 'rgba(35, 165, 90, 0.2)' : 'transparent',
                        borderColor: issueFilter === 'open' ? 'rgba(35, 165, 90, 0.5)' : 'transparent',
                        color: issueFilter === 'open' ? 'var(--accent-green)' : 'var(--text-muted)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span>🟢 Open</span>
                      <span style={{ fontSize: '11px', opacity: 0.85 }}>({openIssues.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIssueFilter('closed')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: '1px solid',
                        background: issueFilter === 'closed' ? 'rgba(142, 68, 173, 0.2)' : 'transparent',
                        borderColor: issueFilter === 'closed' ? 'rgba(142, 68, 173, 0.5)' : 'transparent',
                        color: issueFilter === 'closed' ? '#c084fc' : 'var(--text-muted)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span>🟣 Closed</span>
                      <span style={{ fontSize: '11px', opacity: 0.85 }}>({closedIssues.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIssueFilter('all')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: '1px solid',
                        background: issueFilter === 'all' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                        borderColor: issueFilter === 'all' ? 'rgba(255, 255, 255, 0.25)' : 'transparent',
                        color: issueFilter === 'all' ? 'var(--text-heading)' : 'var(--text-muted)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span>All Issues</span>
                      <span style={{ fontSize: '11px', opacity: 0.85 }}>({allIssues.length})</span>
                    </button>
                  </div>

                  {/* Search Input */}
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: '220px', flex: 1, maxWidth: '340px' }}>
                    <input
                      type="text"
                      placeholder="Search issues (#, title, author, body)..."
                      value={issueSearch}
                      onChange={(e) => setIssueSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 28px 6px 10px',
                        fontSize: '12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-normal)',
                      }}
                    />
                    {issueSearch && (
                      <button
                        type="button"
                        onClick={() => setIssueSearch('')}
                        style={{
                          position: 'absolute',
                          right: 8,
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Empty states */}
                {allIssues.length === 0 ? (
                  <div style={{ padding: 36, textAlign: 'center', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-medium)' }}>
                    <div style={{ fontSize: '28px', marginBottom: 8 }}>🎉</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)' }}>No issues found in this repository</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 4, marginBottom: 14 }}>
                      Everything is looking clean and healthy!
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setShowIssueModal(true)}
                      style={{ fontSize: '12px', fontWeight: 700 }}
                    >
                      + Create First Issue
                    </button>
                  </div>
                ) : filteredIssues.length === 0 ? (
                  <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      No {issueFilter !== 'all' ? `${issueFilter} ` : ''}issues matching "{issueSearch}".
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setIssueFilter('all');
                        setIssueSearch('');
                      }}
                      style={{ marginTop: 8, fontSize: '11px', color: 'var(--discord-blurple)' }}
                    >
                      Reset filters & show all
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {filteredIssues.map((issue) => {
                      const isOpen = issue.state === 'open';
                      const isExpanded = Boolean(expandedIssues[issue.number]);

                      return (
                        <div
                          key={issue.id || issue.number}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '12px 14px',
                            background: 'var(--bg-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            border: `1px solid ${isOpen ? 'var(--border-medium)' : 'rgba(142, 68, 173, 0.25)'}`,
                            gap: 8,
                            transition: 'border-color var(--transition-fast)',
                          }}
                        >
                          {/* Top Row: State badge, number, title, labels, and actions */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                {/* Status badge */}
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    background: isOpen ? 'rgba(35, 165, 90, 0.15)' : 'rgba(142, 68, 173, 0.18)',
                                    color: isOpen ? 'var(--accent-green)' : '#c084fc',
                                    border: `1px solid ${isOpen ? 'rgba(35, 165, 90, 0.35)' : 'rgba(142, 68, 173, 0.35)'}`,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  {isOpen ? '🟢 Open' : '🟣 Closed'}
                                </span>

                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                  #{issue.number}
                                </span>

                                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-heading)' }}>
                                  {issue.title}
                                </span>

                                {Array.isArray(issue.labels) && issue.labels.map((label, idx) => (
                                  <span
                                    key={idx}
                                    style={{
                                      fontSize: '10px',
                                      fontWeight: 600,
                                      padding: '1px 7px',
                                      borderRadius: '10px',
                                      background: 'rgba(88, 101, 242, 0.15)',
                                      border: '1px solid rgba(88, 101, 242, 0.3)',
                                      color: 'var(--discord-blurple)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    <IconTag size={11} /> {label}
                                  </span>
                                ))}
                              </div>

                              {/* Author and dates */}
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span>
                                  Opened by <strong>{issue.user}</strong> {issue.created_at ? `on ${new Date(issue.created_at).toLocaleDateString()}` : ''}
                                </span>
                                {issue.closed_at && (
                                  <span>
                                    • Closed {new Date(issue.closed_at).toLocaleDateString()}
                                  </span>
                                )}
                                {issue.body && (
                                  <button
                                    type="button"
                                    onClick={() => toggleIssueExpanded(issue.number)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--text-link)',
                                      cursor: 'pointer',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      padding: 0,
                                    }}
                                  >
                                    {isExpanded ? 'Hide description ▲' : 'Read description ▼'}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                              {isOpen ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleCloseIssue(issue.number)}
                                  disabled={closingIssueId === issue.number}
                                  title="Close this issue"
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '5px 12px',
                                    color: 'var(--discord-red)',
                                    borderColor: 'rgba(242, 63, 67, 0.35)',
                                  }}
                                >
                                  {closingIssueId === issue.number ? 'Closing...' : 'Close Issue'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleReopenIssue(issue.number)}
                                  disabled={reopeningIssueId === issue.number}
                                  title="Reopen this issue"
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '5px 12px',
                                    color: 'var(--accent-green)',
                                    borderColor: 'rgba(35, 165, 90, 0.4)',
                                  }}
                                >
                                  {reopeningIssueId === issue.number ? 'Reopening...' : 'Reopen Issue'}
                                </button>
                              )}

                              {issue.url && (
                                <a
                                  href={issue.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: '11px', textDecoration: 'none', padding: '5px 10px', fontWeight: 600 }}
                                >
                                  View on GitHub ↗
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Expanded Issue Body */}
                          {isExpanded && issue.body && (
                            <div
                              style={{
                                marginTop: 6,
                                padding: '10px 14px',
                                background: 'var(--bg-card)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-medium)',
                                fontSize: '12px',
                                lineHeight: 1.5,
                                color: 'var(--text-normal)',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {issue.body}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CREATE GITHUB ISSUE */}
      {/* ============================================================== */}
      {showIssueModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowIssueModal(false)}>
          <div className="panel-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-lg)', maxWidth: '480px', width: '100%', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-heading)' }}>
                Create GitHub Issue
              </h4>
              <button className="btn-icon" onClick={() => setShowIssueModal(false)}>
                <IconClose size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateIssue}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Issue Title <span style={{ color: 'var(--discord-red)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bug: WebSocket reconnection failure"
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Labels (Comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. bug, high-priority, frontend"
                  value={issueLabelsInput}
                  onChange={(e) => setIssueLabelsInput(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  GitHub Personal Access Token (Optional Override)
                </label>
                <input
                  type="password"
                  placeholder={githubData.has_token ? 'Using workspace token (leave blank)' : 'ghp_xxxx or github_pat_xxxx'}
                  value={issueToken}
                  onChange={(e) => setIssueToken(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                  {githubData.has_token
                    ? '✨ Workspace has an active token configured. You can leave this blank.'
                    : '💡 Without a token, the issue will be created in simulation mode.'}
                </span>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Issue Body (Markdown)
                </label>
                <textarea
                  rows={4}
                  placeholder="Describe the issue or feature request..."
                  value={issueBody}
                  onChange={(e) => setIssueBody(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowIssueModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={creatingIssue || !issueTitle.trim()}>
                  {creatingIssue ? 'Creating...' : 'Create Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: CREATE GITHUB BRANCH */}
      {/* ============================================================== */}
      {showBranchModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowBranchModal(false)}>
          <div className="panel-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-lg)', maxWidth: '440px', width: '100%', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-heading)' }}>
                Create New Git Branch
              </h4>
              <button className="btn-icon" onClick={() => setShowBranchModal(false)}>
                <IconClose size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateBranch}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  New Branch Name <span style={{ color: 'var(--discord-red)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. feature/canvas-undo-redo"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Base Branch (From)
                </label>
                <input
                  type="text"
                  required
                  value={fromBranch}
                  onChange={(e) => setFromBranch(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowBranchModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={creatingBranch || !newBranchName.trim()}>
                  {creatingBranch ? 'Creating...' : 'Create Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 4: CONFIGURE WORKSPACE PAT */}
      {/* ============================================================== */}
      {showTokenModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setShowTokenModal(false)}
        >
          <div
            className="panel-card"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-heading)' }}>
                {githubData.has_token ? 'Update Personal Access Token' : 'Configure Personal Access Token'}
              </h4>
              <button className="btn-icon" onClick={() => setShowTokenModal(false)}>
                <IconClose size={16} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              Setting a token enables live commits, direct file pushes, branch creation, pull requests, issues, and workflow triggers for this workspace.
            </p>

            <div style={{ background: 'rgba(88, 101, 242, 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(88, 101, 242, 0.25)', padding: '10px 12px', marginBottom: 16, fontSize: '12px', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-heading)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>💡</span> Required Permissions on GitHub:
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)', fontSize: '11px' }}>
                <li><strong>Fine-Grained Token (beta)</strong>: Under <em>Repository Permissions</em>, grant <strong>Pull requests: Read and write</strong>, <strong>Contents: Read and write</strong>, and <strong>Issues: Read and write</strong>. Ensure this repository is selected under <em>Repository access</em>.</li>
                <li><strong>Classic Token (ghp_...)</strong>: Check the main <strong>repo</strong> checkbox (full control of repositories).</li>
              </ul>
            </div>

            <form onSubmit={handleSaveToken}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Personal Access Token (PAT)
                </label>
                <input
                  type="password"
                  placeholder="ghp_... or GitHub Fine-Grained Token"
                  value={patInput}
                  onChange={(e) => setPatInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-medium)',
                    color: 'var(--text-normal)',
                    fontSize: '13px',
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: 6 }}>
                  Leave empty and click "Save Token" to clear the existing token and return to read-only mode.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowTokenModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={savingToken}>
                  {savingToken ? 'Saving...' : 'Save Token'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 5: CREATE PULL REQUEST */}
      {/* ============================================================== */}
      {showPRModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowPRModal(false)}>
          <div className="panel-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-lg)', maxWidth: '520px', width: '100%', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-heading)' }}>
                Create Pull Request
              </h4>
              <button className="btn-icon" onClick={() => setShowPRModal(false)}>
                <IconClose size={16} />
              </button>
            </div>

            <form onSubmit={handleCreatePR}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Title <span style={{ color: 'var(--discord-red)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. feat: collaborative canvas sync"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                    Head Branch (From) <span style={{ color: 'var(--discord-red)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. feature/my-branch"
                    value={prHead}
                    onChange={(e) => setPrHead(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                    Base Branch (Into) <span style={{ color: 'var(--discord-red)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={prBase}
                    onChange={(e) => setPrBase(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Summarize changes and additions for reviewer..."
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px', resize: 'vertical' }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  <span>Personal Access Token (PAT)</span>
                  {githubData?.has_token ? (
                    <span style={{ fontSize: '11px', color: '#57f287', fontWeight: 600 }}>
                      ✓ Workspace Token Linked
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                      Optional Override
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  placeholder={githubData?.has_token ? "Using workspace PAT (leave blank or enter custom)" : "ghp_... (paste token to open PR live)"}
                  value={prToken}
                  onChange={(e) => setPrToken(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                  {githubData?.has_token
                    ? 'Pull Requests authenticate automatically using the workspace PAT. Paste a token here only to override.'
                    : 'Configure a PAT in header or enter here to create PR live on GitHub.'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowPRModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={creatingPR || !prTitle.trim() || !prHead.trim()}>
                  {creatingPR ? 'Creating PR...' : 'Create Pull Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 6: DELETE FILE FROM GITHUB REPO */}
      {/* ============================================================== */}
      {showDeleteFileModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowDeleteFileModal(false)}>
          <div className="panel-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-lg)', maxWidth: '480px', width: '100%', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--discord-red)' }}>
                Delete File from GitHub Repository
              </h4>
              <button className="btn-icon" onClick={() => setShowDeleteFileModal(false)}>
                <IconClose size={16} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              This will commit a file deletion directly into <strong>{githubData.repo}</strong> using the GitHub Contents API.
            </p>

            <form onSubmit={handleDeleteGitHubFile}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  File Path to Delete <span style={{ color: 'var(--discord-red)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. unwanted_config.json or docs/old_spec.md"
                  value={deleteFilePath}
                  onChange={(e) => setDeleteFilePath(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Branch <span style={{ color: 'var(--discord-red)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={deleteFileBranch}
                  onChange={(e) => setDeleteFileBranch(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Commit Message
                </label>
                <input
                  type="text"
                  placeholder={`chore: delete ${deleteFilePath.trim() || 'file'}`}
                  value={deleteCommitMsg}
                  onChange={(e) => setDeleteCommitMsg(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowDeleteFileModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm"
                  disabled={deletingFile || !deleteFilePath.trim()}
                  style={{
                    background: 'var(--discord-red)',
                    color: '#fff',
                    fontWeight: 700,
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                  }}
                >
                  {deletingFile ? 'Deleting...' : 'Delete from GitHub'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: MERGE PULL REQUEST */}
      {showMergePRModal && selectedPRForMerge && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowMergePRModal(false)}>
          <div className="panel-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-lg)', maxWidth: '460px', width: '100%', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-heading)' }}>
                Merge Pull Request #{selectedPRForMerge.number}
              </h4>
              <button className="btn-icon" onClick={() => setShowMergePRModal(false)}>
                <IconClose size={16} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-normal)', marginBottom: 16 }}>
              {selectedPRForMerge.title}
            </p>

            <form onSubmit={handleMergePR}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Merge Method
                </label>
                <select
                  value={mergeMethod}
                  onChange={(e) => setMergeMethod(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                >
                  <option value="merge">Create a merge commit</option>
                  <option value="squash">Squash and merge</option>
                  <option value="rebase">Rebase and merge</option>
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Commit Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder={`Merge pull request #${selectedPRForMerge.number}`}
                  value={mergeCommitTitle}
                  onChange={(e) => setMergeCommitTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  <span>Personal Access Token (PAT)</span>
                  {githubData?.has_token ? (
                    <span style={{ fontSize: '11px', color: '#57f287', fontWeight: 600 }}>
                      ✓ Workspace Token Linked
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                      Optional Override
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  placeholder={githubData?.has_token ? "Using workspace PAT (leave blank or enter custom)" : "ghp_... (paste token to merge live)"}
                  value={mergeToken}
                  onChange={(e) => setMergeToken(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--text-normal)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowMergePRModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={mergingPR}
                  style={{ fontWeight: 700 }}
                >
                  {mergingPR ? 'Merging...' : 'Confirm & Merge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal to Unlink Repo */}
      {confirmUnlink && (
        <ConfirmModal
          isOpen={true}
          title="Unlink GitHub Repository"
          message={`Are you sure you want to disconnect ${githubData.repo} from this workspace? Your local workspace files will not be affected.`}
          confirmText="Unlink Repository"
          confirmVariant="danger"
          onCancel={() => setConfirmUnlink(false)}
          onConfirm={handleUnlinkRepo}
        />
      )}
    </div>
  );
}
