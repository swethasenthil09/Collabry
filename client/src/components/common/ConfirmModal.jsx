import { useEffect } from 'react';
import { IconTrash, IconX } from './Icons';

export default function ConfirmModal({
  isOpen = true,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Delete',
  cancelText = 'Cancel',
  confirmVariant = 'danger', // 'danger' | 'primary'
  loading = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) {
        onCancel?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={!loading ? onCancel : undefined}>
      <div
        className="modal"
        style={{ maxWidth: '440px', width: 'calc(100vw - 32px)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header" style={{ padding: '16px 20px' }}>
          <div className="modal-title" style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: confirmVariant === 'danger' ? 'var(--discord-red)' : 'var(--discord-blurple)' }}>
              <IconTrash size={18} />
            </span>
            <span>{title}</span>
          </div>
          {!loading && (
            <button className="modal-close-btn" onClick={onCancel} aria-label="Close">
              <IconX size={18} />
            </button>
          )}
        </div>

        <div className="modal-body" style={{ padding: '20px', fontSize: '13.5px', color: 'var(--text-normal)', lineHeight: 1.5 }}>
          <p style={{ margin: 0 }}>{message}</p>
        </div>

        <div className="modal-footer" style={{ padding: '14px 20px', gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn ${confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary'} btn-sm`}
            style={confirmVariant === 'danger' ? { backgroundColor: 'var(--discord-red)', color: '#fff' } : {}}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
