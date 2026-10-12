import { useState, useEffect } from 'react';
import { FiX, FiDownload, FiCopy, FiCheck, FiExternalLink, FiFileText, FiImage, FiCode, FiFile } from 'react-icons/fi';
import MarkdownView from './MarkdownView';

export default function FilePreviewModal({ file, onClose }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  if (!file) return null;

  const fullUrl = file.url?.startsWith('http')
    ? file.url
    : `http://localhost:5000${file.url}`;

  const isImage = file.category === 'image' || file.name?.match(/\.(png|jpe?g|gif|webp|svg)$/i);
  const isPdf = file.name?.endsWith('.pdf') || file.url?.endsWith('.pdf');
  const isMarkdown = file.name?.endsWith('.md');
  const isCodeOrText =
    file.category === 'code' ||
    file.category === 'document' ||
    file.name?.match(/\.(js|jsx|ts|tsx|py|json|html|css|sql|sh|txt|xml|yaml|yml|env)$/i);

  useEffect(() => {
    if (!isImage && !isPdf && file.url && !file.url.startsWith('http://') && !file.url.startsWith('https://')) {
      loadFileContent();
    }
  }, [file.url]);

  const loadFileContent = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(fullUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setContent(text);
    } catch (err) {
      console.warn('File fetch preview error:', err);
      setError('Could not preview raw file contents.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 860,
          width: '92vw',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          background: 'var(--bg-primary)',
          borderRadius: 12,
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 18px',
            borderBottom: '1px solid var(--border-medium)',
            background: 'var(--bg-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {isImage ? (
              <FiImage size={18} style={{ color: 'var(--discord-blurple)', flexShrink: 0 }} />
            ) : isCodeOrText ? (
              <FiCode size={18} style={{ color: 'var(--discord-green)', flexShrink: 0 }} />
            ) : isPdf ? (
              <FiFileText size={18} style={{ color: 'var(--reddit-orange)', flexShrink: 0 }} />
            ) : (
              <FiFile size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {file.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {file.size_formatted || (file.size ? `${Math.round(file.size / 1024)} KB` : 'Resource')}
                {file.uploader_name && ` • Uploaded by ${file.uploader_name}`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {content && (
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                onClick={handleCopy}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}
                title="Copy contents"
              >
                {copied ? <FiCheck size={12} style={{ color: 'var(--discord-green)' }} /> : <FiCopy size={12} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}

            <a
              href={fullUrl}
              download={file.name}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-xs btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, textDecoration: 'none' }}
              title="Download File"
            >
              <FiDownload size={12} />
              <span>Download</span>
            </a>

            <button
              type="button"
              className="btn-icon"
              onClick={onClose}
              style={{ padding: 4, color: 'var(--text-muted)' }}
              title="Close Preview"
            >
              <FiX size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18, background: 'var(--bg-secondary)', minHeight: 320 }}>
          {loading ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="spinner"></div>
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>Loading file preview...</div>
            </div>
          ) : error ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{error}</div>
              <a
                href={fullUrl}
                download={file.name}
                className="btn btn-sm btn-secondary"
                style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <FiDownload size={14} />
                <span>Download instead</span>
              </a>
            </div>
          ) : isImage ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 360 }}>
              <img
                src={fullUrl}
                alt={file.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '65vh',
                  objectFit: 'contain',
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
              />
            </div>
          ) : isPdf ? (
            <iframe
              src={fullUrl}
              title={file.name}
              style={{ width: '100%', height: '65vh', border: 'none', borderRadius: 8 }}
            />
          ) : isMarkdown ? (
            <div style={{ background: 'var(--bg-primary)', padding: 18, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
              <MarkdownView content={content} />
            </div>
          ) : isCodeOrText ? (
            <div
              style={{
                background: '#0d1117',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '14px 18px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: 13,
                color: '#e6edf3',
                overflowX: 'auto',
                whiteSpace: 'pre',
                lineHeight: 1.6,
              }}
            >
              <code>{content}</code>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 40 }}>
              <FiFile size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-heading)' }}>Binary or Archive File</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                This file cannot be previewed directly in the browser.
              </div>
              <a
                href={fullUrl}
                download={file.name}
                className="btn btn-primary btn-sm"
                style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <FiDownload size={14} />
                <span>Download {file.name}</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
