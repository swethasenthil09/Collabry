import { useState, useEffect, useRef } from 'react';
import api, { resolveMediaUrl } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import ConfirmModal from '../common/ConfirmModal';
import FilePreviewModal from '../common/FilePreviewModal';
import {
  IconClose,
  IconChevronDown,
  IconChevronRight,
  IconPin,
  IconDocument,
  IconCode,
  IconImage,
  IconArchive,
  IconLink,
  IconFile,
} from '../common/Icons';

export default function ProjectFiles({ project }) {
  const { user } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingLabel, setUploadingLabel] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [fileToDelete, setFileToDelete] = useState(null);
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState({});

  // Live Web Preview Sandbox State
  const [livePreviewUrl, setLivePreviewUrl] = useState(null);
  const [livePreviewContent, setLivePreviewContent] = useState(null);
  const [previewDevice, setPreviewDevice] = useState('desktop'); // 'desktop' | 'tablet' | 'mobile'
  const [previewIframeKey, setPreviewIframeKey] = useState(0);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  useEffect(() => {
    if (project?.id) {
      loadFiles();
    }
  }, [project?.id]);

  const handleOpenPreview = (file) => {
    setPreviewFile({
      id: file.id,
      name: file.name,
      url: file.file_url,
      category: file.category,
      size: file.file_size,
      size_formatted: file.file_size_formatted,
      uploader_name: file.uploader_name || file.uploader_username,
    });
  };

  // Real-time socket events for project files & GitHub sync
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !project?.id) return;

    const handleFileUploaded = (newFile) => {
      setFiles((prev) => {
        const updated = [newFile, ...prev.filter((f) => f.id !== newFile.id)];
        return updated.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
      });
    };

    const handleFileDeleted = ({ file_id }) => {
      setFiles((prev) => prev.filter((f) => f.id !== file_id));
      if (previewFile?.id === file_id) setPreviewFile(null);
    };

    const handleAllFilesDeleted = () => {
      setFiles([]);
      setPreviewFile(null);
    };

    const handleFilePinned = ({ file_id, is_pinned }) => {
      setFiles((prev) => {
        const updated = prev.map((f) => (f.id === file_id ? { ...f, is_pinned } : f));
        return updated.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
      });
    };

    socket.on('project:file_uploaded', handleFileUploaded);
    socket.on('project:file_deleted', handleFileDeleted);
    socket.on('project:all_files_deleted', handleAllFilesDeleted);
    socket.on('project:file_pinned', handleFilePinned);

    return () => {
      socket.off('project:file_uploaded', handleFileUploaded);
      socket.off('project:file_deleted', handleFileDeleted);
      socket.off('project:all_files_deleted', handleAllFilesDeleted);
      socket.off('project:file_pinned', handleFilePinned);
    };
  }, [project?.id, previewFile?.id]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/projects/${project.id}/files`);
      setFiles(res.data);
    } catch (err) {
      console.error('Load files error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Single File Upload
  const handleFileUpload = async (e) => {
    const selectedFiles = e.target?.files || e.dataTransfer?.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const file = selectedFiles[0];
    if (file.size > 1024 * 1024 * 1024) {
      setUploadError('File exceeds the 1 GB size limit');
      return;
    }

    setUploadError('');
    setUploading(true);
    setUploadingLabel(`Uploading ${file.name}...`);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post(`/projects/${project.id}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        },
      });

      setFiles((prev) => [res.data, ...prev].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)));
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('Upload file error:', err);
      setUploadError(err.response?.data?.error?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadingLabel('');
    }
  };

  // Standard Folder Upload (uploads all files in folder without exclusions)
  const handleFolderUpload = async (e) => {
    const rawFiles = Array.from(e.target?.files || []);
    if (rawFiles.length === 0) return;

    const totalBytes = rawFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    if (totalBytes > 1024 * 1024 * 1024) {
      setUploadError('Folder exceeds the 1 GB total size limit');
      return;
    }

    const samplePath = rawFiles[0].webkitRelativePath || '';
    const rootFolder = samplePath.split('/')[0] || 'folder';

    setUploadError('');
    setUploading(true);
    setUploadingLabel(`Uploading folder "${rootFolder}" (${rawFiles.length} files)...`);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      const relativePaths = [];

      rawFiles.forEach((file) => {
        formData.append('files', file);
        relativePaths.push(file.webkitRelativePath || file.name);
      });

      formData.append('folder_paths', JSON.stringify(relativePaths));

      const res = await api.post(`/projects/${project.id}/files/batch`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        },
      });

      setFiles((prev) => [...res.data, ...prev].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)));
      setExpandedFolders((prev) => ({ ...prev, [rootFolder]: true }));
      if (folderInputRef.current) folderInputRef.current.value = '';
    } catch (err) {
      console.error('Folder upload error:', err);
      setUploadError(err.response?.data?.error?.message || 'Failed to upload folder');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadingLabel('');
    }
  };

  // Git Upload (Specifically filters out .git, .gitignore, node_modules, and .gitignore patterns)
  const handleGitUpload = async (e) => {
    const rawFiles = Array.from(e.target?.files || []);
    if (rawFiles.length === 0) return;

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

    // Filter files: exclude .git, .gitignore, node_modules, .DS_Store, and custom gitignore rules
    const filteredFiles = rawFiles.filter((file) => {
      const path = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
      if (path.includes('/.git/') || path.startsWith('.git/')) return false;
      if (path.includes('/node_modules/') || path.startsWith('node_modules/')) return false;
      if (path.endsWith('/.gitignore') || path === '.gitignore') return false;
      if (path.endsWith('/.DS_Store') || path === '.DS_Store') return false;
      if (path.endsWith('/Thumbs.db') || path === 'Thumbs.db') return false;

      for (const rule of customIgnoreRules) {
        const cleanRule = rule.replace(/^\//, '').replace(/\/$/, '');
        if (cleanRule && (path.includes(`/${cleanRule}/`) || path.endsWith(`/${cleanRule}`) || path.startsWith(`${cleanRule}/`))) {
          return false;
        }
      }
      return true;
    });

    if (filteredFiles.length === 0) {
      setUploadError('No eligible files to upload after gitignore and node_modules filtering');
      return;
    }

    const totalBytes = filteredFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    if (totalBytes > 1024 * 1024 * 1024) {
      setUploadError('Git repository exceeds the 1 GB total size limit');
      return;
    }

    const samplePath = filteredFiles[0].webkitRelativePath || '';
    const rootFolder = samplePath.split('/')[0] || 'repo';

    setUploadError('');
    setUploading(true);
    setUploadingLabel(`Uploading Git repository "${rootFolder}" (${filteredFiles.length} files)...`);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      const relativePaths = [];

      filteredFiles.forEach((file) => {
        formData.append('files', file);
        relativePaths.push(file.webkitRelativePath || file.name);
      });

      formData.append('folder_paths', JSON.stringify(relativePaths));

      const res = await api.post(`/projects/${project.id}/files/batch`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        },
      });

      setFiles((prev) => [...res.data, ...prev].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)));
      setExpandedFolders((prev) => ({ ...prev, [rootFolder]: true }));
      if (gitFolderInputRef.current) gitFolderInputRef.current.value = '';
    } catch (err) {
      console.error('Git upload error:', err);
      setUploadError(err.response?.data?.error?.message || 'Failed to upload Git repository');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadingLabel('');
    }
  };

  // Add External Web Resource Link
  const handleAddLink = async (e) => {
    e.preventDefault();
    if (!linkUrl.trim()) return;

    try {
      const formattedUrl = linkUrl.trim().startsWith('http')
        ? linkUrl.trim()
        : `https://${linkUrl.trim()}`;

      const res = await api.post(`/projects/${project.id}/files`, {
        name: linkName.trim() || formattedUrl,
        url: formattedUrl,
        category: 'link',
      });

      setFiles((prev) => [res.data, ...prev].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)));
      setIsLinkModalOpen(false);
      setLinkName('');
      setLinkUrl('');
    } catch (err) {
      console.error('Add link error:', err);
    }
  };

  // Toggle Resource Pin
  const handleTogglePin = async (fileId) => {
    try {
      const res = await api.patch(`/projects/${project.id}/files/${fileId}/pin`);
      setFiles((prev) => {
        const updated = prev.map((f) => (f.id === fileId ? { ...f, is_pinned: res.data.is_pinned } : f));
        return updated.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
      });
    } catch (err) {
      console.error('Toggle pin error:', err);
    }
  };

  // Check if a file can be previewed in-app
  const canPreviewFile = (file) => {
    if (!file) return false;
    if (file.category === 'link' || file.mime_type === 'link') return false; // Links only need Visit
    if (file.category === 'image') return true;
    if (file.category === 'code') return true;
    const ext = file.name ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
    const previewableDocs = ['.md', '.txt', '.json', '.xml', '.yaml', '.yml', '.csv', '.log'];
    return previewableDocs.includes(ext);
  };


  const handleDeleteFile = async (fileId) => {
    try {
      await api.delete(`/projects/${project.id}/files/${fileId}`);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error('Delete file error:', err);
    }
  };

  const handleDeleteFolder = async (folderName, folderFileList) => {
    try {
      for (const f of folderFileList) {
        await api.delete(`/projects/${project.id}/files/${f.id}`);
      }
      const idsToDelete = new Set(folderFileList.map((f) => f.id));
      setFiles((prev) => prev.filter((f) => !idsToDelete.has(f.id)));
    } catch (err) {
      console.error('Delete folder error:', err);
    }
  };

  const handleDeleteAllFiles = async () => {
    try {
      await api.delete(`/projects/${project.id}/files`);
      setFiles([]);
    } catch (err) {
      console.error('Delete all files error:', err);
    }
  };

  const toggleFolderExpanded = (folderName) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getCategoryBadge = (category) => {
    switch (category) {
      case 'image':
        return { label: 'Image', color: '#3ba55d' };
      case 'code':
        return { label: 'Code', color: '#5865f2' };
      case 'archive':
        return { label: 'Archive', color: '#eb459e' };
      case 'document':
        return { label: 'Document', color: '#faa61a' };
      case 'link':
        return { label: 'Link', color: '#00b0f4' };
      default:
        return { label: 'File', color: '#949ba4' };
    }
  };

  const renderCategoryIcon = (category, color, size = 18) => {
    switch (category) {
      case 'image':
        return <IconImage size={size} color={color} />;
      case 'code':
        return <IconCode size={size} color={color} />;
      case 'archive':
        return <IconArchive size={size} color={color} />;
      case 'document':
        return <IconDocument size={size} color={color} />;
      case 'link':
        return <IconLink size={size} color={color} />;
      default:
        return <IconFile size={size} color={color} />;
    }
  };

  const DEFAULT_SANDBOX_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f1117; color: #f2f3f5; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; }
.card { background: #1a1d24; border: 1px solid #2e3340; border-radius: 12px; padding: 32px 28px; max-width: 440px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
h2 { color: #5865f2; margin: 0 0 8px; font-size: 20px; }
p { color: #949ba4; font-size: 13px; line-height: 1.5; margin: 0 0 18px; }
.btn { background: #5865f2; color: #fff; border: 0; padding: 10px 18px; border-radius: 6px; font-weight: 700; cursor: pointer; transition: background 0.15s; font-size: 13px; }
.btn:hover { background: #4752c4; }
.counter { margin-top: 14px; font-size: 14px; font-weight: 600; color: #57f287; }
</style>
</head>
<body>
<div class="card">
  <h2>🌐 Collabry Live Sandbox</h2>
  <p>Live interactive web sandbox environment. Upload any <strong>.html</strong> file in Files & Resources to test interactive prototypes, or enter a live URL in the address bar above.</p>
  <button class="btn" onclick="let c = (window._c || 0) + 1; window._c = c; document.getElementById('count').innerText = 'Interactions: ' + c;">Interactive Test Button</button>
  <div class="counter" id="count">Ready for testing</div>
</div>
</body>
</html>`;

  const openLivePreview = async (file) => {
    if (!file) {
      setLivePreviewUrl('sandbox://interactive-demo');
      setLivePreviewContent(DEFAULT_SANDBOX_HTML);
      return;
    }
    const url = resolveMediaUrl(file.file_url);
    setLivePreviewUrl(url);
    try {
      const res = await fetch(url);
      const html = await res.text();
      setLivePreviewContent(html);
    } catch {
      setLivePreviewContent(null);
    }
  };

  // Find if an HTML file is available for live web sandbox hosting
  const htmlWebFile = files.find(
    (f) => f.name.toLowerCase().endsWith('.html') || f.name.toLowerCase().endsWith('.htm')
  );

  // Filtered files
  const filteredFiles = files.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.folder_path && f.folder_path.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = selectedCategory === 'all' || f.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  // Group into Folders and Standalone Files
  const folderGroups = {};
  const rootFiles = [];

  filteredFiles.forEach((file) => {
    if (file.folder_path && file.folder_path.includes('/')) {
      const rootFolderName = file.folder_path.split('/')[0];
      if (!folderGroups[rootFolderName]) {
        folderGroups[rootFolderName] = [];
      }
      folderGroups[rootFolderName].push(file);
    } else {
      rootFiles.push(file);
    }
  });

  const totalSize = files.reduce((acc, f) => acc + (f.file_size || 0), 0);
  const isMember = Boolean(
    project?.is_member ||
    project?.user_role ||
    project?.role ||
    project?.created_by === user?.id
  );
  const canClearAll = Boolean(
    project?.user_role === 'owner' ||
    project?.user_role === 'admin' ||
    project?.created_by === user?.id
  );

  return (
    <div className="main-body" style={{ maxWidth: '1080px', margin: '0 auto', width: '100%', padding: '24px 20px' }}>
      {/* Top Header & Actions Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-heading)' }}>
            Files & Shared Resources
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Store architecture specs, code assets, structured folders, designs, and external web resources.
          </p>
        </div>

        {/* Stats Pill & Clean Boxed Action Buttons (No Icons, Pure Box Hover) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-card)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '12px' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Files: </span>
              <span style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{files.length}</span>
            </div>
            <div style={{ width: 1, height: 14, background: 'var(--border-medium)' }} />
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Storage: </span>
              <span style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{formatFileSize(totalSize)}</span>
            </div>
          </div>

          {/* Live Web Demo Preview Button */}
          <button
            className="btn btn-primary btn-sm"
            onClick={() => openLivePreview(htmlWebFile || null)}
            title={htmlWebFile ? `Launch sandboxed live demo (${htmlWebFile.name})` : 'Launch Live Web Demo Preview Sandbox'}
            style={{
              fontSize: '12px',
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--discord-blurple)',
              color: '#ffffff',
            }}
          >
            <span>🌐</span> {htmlWebFile ? `Live Demo (${htmlWebFile.name})` : 'Live Demo Sandbox'}
          </button>

          {/* Delete All Resources Button */}
          {files.length > 0 && canClearAll && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirmDeleteAll(true)}
              title="Delete all files and resources in this workspace"
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
              Delete All
            </button>
          )}

          {isMember && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => folderInputRef.current?.click()}
                title="Upload an entire directory folder"
                style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}
              >
                Upload Folder
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setIsLinkModalOpen(true)}
                title="Add link to GitHub, Figma, Notion, Drive"
                style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}
              >
                Add Link
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hidden File & Folder Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />
      <input
        type="file"
        ref={folderInputRef}
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFolderUpload}
        style={{ display: 'none' }}
      />

      {/* Upload Drop Zone with Border-Tracing Star Progress Indicator */}
      {isMember && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFileUpload(e); }}
          onClick={() => !uploading && fileInputRef.current?.click()}
          style={{
            background: isDragOver ? 'rgba(88, 101, 242, 0.12)' : 'var(--bg-card)',
            border: isDragOver ? '2px dashed var(--discord-blurple)' : '2px dashed var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '36px 24px',
            textAlign: 'center',
            cursor: uploading ? 'default' : 'pointer',
            marginBottom: 20,
            transition: 'all var(--transition-fast)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {/* Border-Tracing Star Upload Progress Indicator */}
            {uploading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                <div style={{ position: 'relative', width: 68, height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="68" height="68" viewBox="0 0 24 24" style={{ overflow: 'visible' }}>
                    <path
                      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.12)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    <path
                      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                      fill="none"
                      stroke="var(--discord-blurple)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength="100"
                      strokeDasharray="100"
                      strokeDashoffset={100 - uploadProgress}
                      style={{
                        transition: 'stroke-dashoffset 150ms ease-out',
                        filter: 'drop-shadow(0 0 6px rgba(88, 101, 242, 0.8))',
                      }}
                    />
                  </svg>

                  <span style={{ position: 'absolute', fontSize: '11px', fontWeight: 900, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                    {uploadProgress}%
                  </span>
                </div>

                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--discord-blurple)' }}>
                  {uploadingLabel || `Uploading resource (${uploadProgress}%)...`}
                </div>
              </div>
            ) : (
              <>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: 'rgba(88, 101, 242, 0.14)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 4,
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
                  Click to browse or drag & drop files here
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                  Supports files, folders, source code repos, archives, and bundles (up to 1 GB)
                </p>
              </>
            )}

            {uploadError && (
              <div style={{ color: 'var(--discord-red)', fontSize: '12px', fontWeight: 600, marginTop: 4 }}>
                ⚠️ {uploadError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search & Category Filter Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Files' },
            { id: 'document', label: 'Documents' },
            { id: 'code', label: 'Code' },
            { id: 'image', label: 'Images' },
            { id: 'archive', label: 'Archives' },
            { id: 'link', label: 'Links' },
          ].map((cat) => (
            <button
              key={cat.id}
              className={`btn-ghost ${selectedCategory === cat.id ? 'active' : ''}`}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                background: selectedCategory === cat.id ? 'var(--discord-blurple)' : 'var(--bg-subtle)',
                color: selectedCategory === cat.id ? '#fff' : 'var(--text-muted)',
              }}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div style={{ minWidth: '220px', flex: '1 1 220px', maxWidth: '340px' }}>
          <input
            type="text"
            placeholder="Search files by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 12px',
              color: 'var(--text-normal)',
              fontSize: '13px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Files List View */}
      {loading ? (
        <div className="empty-state"><div className="spinner"></div></div>
      ) : filteredFiles.length === 0 ? (
        <div className="empty-state" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '40px 20px' }}>
          <div className="empty-state-title" style={{ marginTop: 0 }}>
            {searchQuery || selectedCategory !== 'all' ? 'No matching resources found' : 'No files or resources uploaded yet'}
          </div>
          <div className="empty-state-desc" style={{ maxWidth: '440px', margin: '6px auto 0' }}>
            {searchQuery || selectedCategory !== 'all'
              ? 'Try adjusting your search terms or selecting a different category filter.'
              : 'Drag & drop files into the dropzone above, upload a folder, or add an external web link.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* FOLDERS VIEW (Expandable folder containers) */}
          {Object.entries(folderGroups).map(([folderName, folderFileList]) => {
            const isExpanded = Boolean(expandedFolders[folderName]);
            const folderBytes = folderFileList.reduce((acc, f) => acc + (f.file_size || 0), 0);
            const canDeleteFolder = folderFileList.some((f) => f.can_delete);

            return (
              <div
                key={`folder-${folderName}`}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                }}
              >
                {/* Folder Header Banner */}
                <div
                  onClick={() => toggleFolderExpanded(folderName)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 18px',
                    cursor: 'pointer',
                    background: isExpanded ? 'rgba(88, 101, 242, 0.08)' : 'var(--bg-subtle)',
                    borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none',
                    transition: 'background var(--transition-fast)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                      {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-heading)' }}>
                        {folderName}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
                        {folderFileList.length} {folderFileList.length === 1 ? 'file' : 'files'} • {formatFileSize(folderBytes)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {isExpanded ? 'Collapse' : 'Expand'}
                    </span>

                    {canDeleteFolder && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setFolderToDelete({ name: folderName, files: folderFileList })}
                        title={`Delete folder "${folderName}"`}
                        style={{
                          color: 'var(--discord-red)',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(242, 63, 67, 0.08)',
                          border: '1px solid rgba(242, 63, 67, 0.3)',
                        }}
                      >
                        Delete Folder
                      </button>
                    )}
                  </div>
                </div>

                {/* Folder Contents */}
                {isExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 14px', background: 'rgba(0, 0, 0, 0.15)' }}>
                    {folderFileList.map((file) => renderFileCard(file, true))}
                  </div>
                )}
              </div>
            );
          })}

          {/* STANDALONE ROOT FILES */}
          {rootFiles.map((file) => renderFileCard(file, false))}
        </div>
      )}

      {/* Add External Link Resource Modal */}
      {isLinkModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setIsLinkModalOpen(false)}
        >
          <div
            className="panel-card"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-heading)' }}>
                Add Web Resource Link
              </h4>
              <button className="btn-icon" onClick={() => setIsLinkModalOpen(false)}>
                <IconClose size={16} />
              </button>
            </div>

            <form onSubmit={handleAddLink}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Resource Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Figma UI Prototype, GitHub Repo, Notion Specs"
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
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

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Web URL (Required)
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsLinkModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={!linkUrl.trim()}>
                  Save Resource Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live Web Sandbox Hosting Modal */}
      {livePreviewUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: 16,
          }}
          onClick={() => setLivePreviewUrl(null)}
        >
          <div
            className="panel-card"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: previewDevice === 'mobile' ? '420px' : previewDevice === 'tablet' ? '820px' : '1100px',
              width: '100%',
              height: '88vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              transition: 'max-width 200ms ease',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sandbox Toolbar */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-medium)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-heading)' }}>
                  Live Web Preview
                </span>
                <span style={{ fontSize: '11px', background: 'rgba(59, 165, 93, 0.15)', color: '#3ba55d', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                  SANDBOX
                </span>
              </div>

              {/* Device Simulator Toggles */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-card)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)' }}>
                {[
                  { id: 'desktop', label: 'Desktop' },
                  { id: 'tablet', label: 'Tablet' },
                  { id: 'mobile', label: 'Mobile' },
                ].map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setPreviewDevice(d.id)}
                    style={{
                      background: previewDevice === d.id ? 'var(--discord-blurple)' : 'transparent',
                      color: previewDevice === d.id ? '#fff' : 'var(--text-muted)',
                      border: 'none',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: 'var(--radius-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <a
                  href={livePreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '11.5px', textDecoration: 'none', padding: '4px 10px', borderRadius: 'var(--radius-sm)' }}
                >
                  Open in New Tab
                </a>
                <button className="btn-icon" onClick={() => setLivePreviewUrl(null)}>
                  <IconClose size={18} />
                </button>
              </div>
            </div>

            {/* Sandboxed Iframe */}
            <div style={{ flex: 1, background: '#fff', overflow: 'hidden' }}>
              <iframe
                src={livePreviewUrl}
                title="Live Web Preview"
                sandbox="allow-scripts allow-same-origin allow-forms"
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* In-App Quick File Preview Modal */}
      {previewFile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 24,
          }}
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="panel-card"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '820px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-medium)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0, flex: 1, paddingRight: 16 }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {previewFile.name}
                </h4>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 3 }}>
                  {formatFileSize(previewFile.file_size)} • Uploaded by {previewFile.uploader_name || previewFile.uploader_username}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <a
                  href={resolveMediaUrl(previewFile.file_url)}
                  download={previewFile.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)' }}
                >
                  Download
                </a>
                <button className="btn-icon" onClick={() => setPreviewFile(null)}>
                  <IconClose size={18} />
                </button>
              </div>
            </div>

            {/* Modal Content Preview */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, maxHeight: '65vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {previewFile.category === 'image' ? (
                <img
                  src={resolveMediaUrl(previewFile.file_url)}
                  alt={previewFile.name}
                  style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }}
                />
              ) : previewLoading ? (
                <div className="empty-state"><div className="spinner"></div></div>
              ) : previewContent ? (
                <pre
                  style={{
                    width: '100%',
                    maxHeight: '55vh',
                    margin: 0,
                    padding: '16px',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    overflowX: 'auto',
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    color: 'var(--text-normal)',
                  }}
                >
                  {previewContent}
                </pre>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Live Web Sandbox Preview Modal */}
      {livePreviewUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
          onClick={() => setLivePreviewUrl(null)}
        >
          <div
            className="panel-card"
            style={{
              background: '#1e1f22',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: previewDevice === 'mobile' ? '420px' : previewDevice === 'tablet' ? '820px' : '1100px',
              width: '100%',
              height: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden',
              transition: 'max-width 0.25s ease',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Browser Top Chrome / Navigation Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                background: '#2b2d31',
                borderBottom: '1px solid var(--border-medium)',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '16px' }}>🌐</span>
                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-heading)' }}>
                  Live Demo Web Preview
                </span>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 10, background: 'rgba(35, 165, 90, 0.15)', color: 'var(--accent-green)', border: '1px solid rgba(35, 165, 90, 0.35)', fontWeight: 600 }}>
                  Sandboxed Environment
                </span>
              </div>

              {/* Responsive Device Switchers */}
              <div style={{ display: 'flex', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', padding: 2, border: '1px solid var(--border-medium)' }}>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)',
                    background: previewDevice === 'desktop' ? 'var(--bg-card)' : 'transparent',
                    color: previewDevice === 'desktop' ? 'var(--text-heading)' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  title="Desktop View (Full Width)"
                >
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('tablet')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)',
                    background: previewDevice === 'tablet' ? 'var(--bg-card)' : 'transparent',
                    color: previewDevice === 'tablet' ? 'var(--text-heading)' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  title="Tablet View (820px)"
                >
                  Tablet
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)',
                    background: previewDevice === 'mobile' ? 'var(--bg-card)' : 'transparent',
                    color: previewDevice === 'mobile' ? 'var(--text-heading)' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  title="Mobile View (420px)"
                >
                  Mobile
                </button>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPreviewIframeKey((k) => k + 1)}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                  title="Reload Live Demo"
                >
                  🔄 Reload
                </button>
                <a
                  href={livePreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '11px', textDecoration: 'none', padding: '4px 10px' }}
                >
                  Open in New Tab ↗
                </a>
                <button
                  className="btn-icon"
                  onClick={() => setLivePreviewUrl(null)}
                  title="Close Preview"
                >
                  <IconClose size={18} />
                </button>
              </div>
            </div>

            {/* Address Bar Sub-Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 16px',
                background: '#1e1f22',
                borderBottom: '1px solid var(--border-medium)',
              }}
            >
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>URL:</span>
              <input
                type="text"
                value={livePreviewUrl}
                onChange={(e) => {
                  setLivePreviewUrl(e.target.value);
                  setLivePreviewContent(null);
                }}
                style={{
                  flex: 1,
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 10px',
                  fontSize: '11px',
                  color: 'var(--text-normal)',
                  fontFamily: 'monospace',
                }}
                placeholder="Enter HTML or Web URL to preview (e.g. https://example.com)..."
              />
            </div>

            {/* Sandboxed Interactive Iframe */}
            <div style={{ flex: 1, position: 'relative', background: '#ffffff', overflow: 'hidden' }}>
              <iframe
                key={previewIframeKey}
                srcDoc={livePreviewContent || undefined}
                src={!livePreviewContent ? livePreviewUrl : undefined}
                title="Live Web Sandbox Preview"
                sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  display: 'block',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Single File In-App Confirmation Modal */}
      {fileToDelete && (
        <ConfirmModal
          isOpen={true}
          title="Delete Shared Resource"
          message={`Are you sure you want to delete "${fileToDelete.name}"? This file will be permanently removed from this project workspace.`}
          confirmText="Delete"
          confirmVariant="danger"
          onCancel={() => setFileToDelete(null)}
          onConfirm={async () => {
            const id = fileToDelete.id;
            setFileToDelete(null);
            await handleDeleteFile(id);
          }}
        />
      )}

      {/* Delete Entire Folder In-App Confirmation Modal */}
      {folderToDelete && (
        <ConfirmModal
          isOpen={true}
          title={`Delete Folder "${folderToDelete.name}"`}
          message={`Are you sure you want to delete the folder "${folderToDelete.name}" and all ${folderToDelete.files.length} contained files?`}
          confirmText="Delete Folder"
          confirmVariant="danger"
          onCancel={() => setFolderToDelete(null)}
          onConfirm={async () => {
            const { name, files: fl } = folderToDelete;
            setFolderToDelete(null);
            await handleDeleteFolder(name, fl);
          }}
        />
      )}

      {/* Delete All Resources In-App Confirmation Modal */}
      {confirmDeleteAll && (
        <ConfirmModal
          isOpen={true}
          title="Delete All Project Resources"
          message={`Are you sure you want to delete ALL ${files.length} files and resources in this workspace? This action cannot be undone.`}
          confirmText="Delete All"
          confirmVariant="danger"
          onCancel={() => setConfirmDeleteAll(false)}
          onConfirm={async () => {
            setConfirmDeleteAll(false);
            await handleDeleteAllFiles();
          }}
        />
      )}

      {/* Workspace File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );

  // Helper to render individual file cards with clean boxed action buttons
  function renderFileCard(file, isNested = false) {
    const badge = getCategoryBadge(file.category);
    const downloadUrl = resolveMediaUrl(file.file_url);
    const isExternalLink = file.category === 'link' || file.mime_type === 'link';
    const isPreviewable = canPreviewFile(file);
    const isHtmlFile = file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm');

    return (
      <div
        key={file.id}
        className="panel-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isNested ? '10px 14px' : '14px 18px',
          background: file.is_pinned ? `${badge.color}10` : 'var(--bg-card)',
          border: file.is_pinned ? `1px solid ${badge.color}60` : '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-md)',
          gap: 16,
          transition: 'background var(--transition-fast), border-color var(--transition-fast)',
        }}
      >
        {/* Left File Icon & Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: isNested ? 32 : 38,
              height: isNested ? 32 : 38,
              borderRadius: 'var(--radius-sm)',
              background: `${badge.color}15`,
              border: `1px solid ${badge.color}35`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: badge.color,
            }}
          >
            {renderCategoryIcon(file.category, badge.color, isNested ? 16 : 18)}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  if (isExternalLink) window.open(downloadUrl, '_blank');
                  else if (isHtmlFile) openLivePreview(file);
                  else if (isPreviewable) handleOpenPreview(file);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: isExternalLink || isHtmlFile || isPreviewable ? 'pointer' : 'default',
                  fontWeight: 700,
                  fontSize: isNested ? '13px' : '14px',
                  color: isExternalLink ? 'var(--discord-blurple)' : 'var(--text-heading)',
                  textAlign: 'left',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '380px',
                }}
                title={isExternalLink ? `Open ${file.file_url}` : file.name}
              >
                {file.name}
              </button>

              {file.is_pinned && (
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: `${badge.color}22`,
                    color: badge.color,
                    border: `1px solid ${badge.color}50`,
                  }}
                >
                  PINNED
                </span>
              )}

              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: `${badge.color}20`,
                  color: badge.color,
                  border: `1px solid ${badge.color}40`,
                }}
              >
                {badge.label}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '11px', color: 'var(--text-muted)', marginTop: 3, flexWrap: 'wrap' }}>
              {!isExternalLink && <span>{formatFileSize(file.file_size)}</span>}
              {file.folder_path && (
                <>
                  <span>•</span>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>📂 {file.folder_path}</span>
                </>
              )}
              <span>•</span>
              <span>Added {formatDate(file.created_at)}</span>
              <span>•</span>
              <span>By {file.uploader_name || file.uploader_username}</span>
            </div>
          </div>
        </div>

        {/* Right Actions: Boxed Buttons with Hover States */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* Pin Button with SVG Icon (filled with logo/category color when pinned) */}
          {isMember && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleTogglePin(file.id)}
              title={file.is_pinned ? 'Unpin resource' : 'Pin to top of workspace'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '11px',
                fontWeight: 600,
                padding: '4px 9px',
                borderRadius: 'var(--radius-sm)',
                color: file.is_pinned ? badge.color : 'var(--text-muted)',
                borderColor: file.is_pinned ? `${badge.color}60` : 'var(--border-medium)',
                background: file.is_pinned ? `${badge.color}15` : 'var(--bg-subtle)',
                cursor: 'pointer',
              }}
            >
              <IconPin
                size={13}
                filled={file.is_pinned}
                color={file.is_pinned ? badge.color : 'currentColor'}
              />
              <span>{file.is_pinned ? 'Pinned' : 'Pin'}</span>
            </button>
          )}

          {/* Live Demo Preview Button */}
          {isHtmlFile ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => openLivePreview(file)}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 9px',
                borderRadius: 'var(--radius-sm)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'var(--discord-blurple)',
                color: '#fff',
              }}
              title="Launch sandboxed live demo preview"
            >
              <span>🌐</span> Live Demo
            </button>
          ) : isPreviewable ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleOpenPreview(file)}
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '4px 9px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Preview
            </button>
          ) : null}

          {/* Visit (External Link) or Download (File) */}
          {isExternalLink ? (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '4px 9px',
                textDecoration: 'none',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Visit
            </a>
          ) : (
            <a
              href={downloadUrl}
              download={file.name}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '4px 9px',
                textDecoration: 'none',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Download
            </a>
          )}

          {/* Delete Button */}
          {file.can_delete && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setFileToDelete(file)}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 9px',
                color: 'var(--discord-red)',
                border: '1px solid rgba(242, 63, 67, 0.35)',
                background: 'rgba(242, 63, 67, 0.08)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    );
  }
}
