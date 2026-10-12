import { useState, useEffect } from 'react';
import api from '../../services/api';
import { IconCheck, IconPlus, IconX, IconKanban } from '../common/Icons';
import ConfirmModal from '../common/ConfirmModal';

const COLUMNS = [
  { key: 'todo', label: 'To Do', color: 'var(--discord-blurple)' },
  { key: 'in_progress', label: 'In Progress', color: 'var(--discord-yellow)' },
  { key: 'review', label: 'Review', color: 'var(--reddit-orange)' },
  { key: 'done', label: 'Done', color: 'var(--discord-green)' },
];

export default function KanbanBoard({ projectId }) {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    status: 'todo',
    assignee_id: '',
    due_date: '',
  });

  useEffect(() => {
    loadTasksAndMembers();
  }, [projectId]);

  const loadTasksAndMembers = async () => {
    try {
      const [taskRes, projRes] = await Promise.all([
        api.get(`/projects/${projectId}/tasks`),
        api.get(`/projects/${projectId}`),
      ]);
      setTasks(taskRes.data);
      setMembers(projRes.data.members || []);
    } catch (err) {
      console.error('Load tasks error:', err);
    } finally {
      setLoading(false);
    }
  };

  const createTask = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/projects/${projectId}/tasks`, {
        ...newTask,
        assignee_id: newTask.assignee_id ? parseInt(newTask.assignee_id) : undefined,
        due_date: newTask.due_date || undefined,
      });
      setNewTask({ title: '', description: '', priority: 'medium', status: 'todo', assignee_id: '', due_date: '' });
      setShowCreate(false);
      loadTasksAndMembers();
    } catch (err) {
      console.error('Create task error:', err);
    }
  };

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      await api.patch(`/projects/${projectId}/tasks/${taskId}`, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    } catch (err) {
      console.error('Update task error:', err);
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await api.delete(`/projects/${projectId}/tasks/${taskId}`);
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('Delete task error:', err);
    }
  };

  if (loading) return <div className="empty-state"><div className="spinner"></div></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconKanban size={18} /> Project Tasks
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Track progress across team sprints and deliverables
          </span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <IconPlus size={14} />
          <span>New Task</span>
        </button>
      </div>

      <div className="kanban-board">
        {COLUMNS.map((col) => {
          const columnTasks = tasks.filter(t => t.status === col.key);
          return (
            <div key={col.key} className="kanban-column">
              <div className="kanban-column-header">
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.color }} />
                <span>{col.label}</span>
                <span className="count">{columnTasks.length}</span>
              </div>
              <div className="kanban-column-body">
                {columnTasks.map((task) => (
                  <div key={task.id} className="kanban-card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                      <div className="kanban-card-title">{task.title}</div>
                      <button
                        className="btn-icon"
                        style={{
                          padding: '4px',
                          color: 'var(--text-muted)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--discord-red)';
                          e.currentTarget.style.background = 'rgba(242, 63, 67, 0.12)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--text-muted)';
                          e.currentTarget.style.background = 'transparent';
                        }}
                        onClick={() => setTaskToDelete(task)}
                        title="Delete Task"
                        aria-label="Delete Task"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>

                    {task.description && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>
                        {task.description.substring(0, 80)}{task.description.length > 80 ? '...' : ''}
                      </div>
                    )}

                    <div className="kanban-card-meta">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`priority-dot ${task.priority}`} />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                          {task.priority}
                        </span>
                      </div>

                      {task.assignee_username && (
                        <div
                          className="user-avatar sm"
                          style={{ width: 20, height: 20, fontSize: 10, background: 'var(--discord-blurple)' }}
                          title={`Assigned to ${task.assignee_name || task.assignee_username}`}
                        >
                          {(task.assignee_name || task.assignee_username).charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Quick status change */}
                    <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {COLUMNS.filter(c => c.key !== col.key).map(c => (
                        <button
                          key={c.key}
                          className="btn btn-ghost"
                          style={{ fontSize: '0.68rem', padding: '2px 6px' }}
                          onClick={() => updateTaskStatus(task.id, c.key)}
                        >
                          → {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {columnTasks.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    No tasks in {col.label}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create task modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <span>Create Task</span>
              </div>
              <button className="modal-close-btn" onClick={() => setShowCreate(false)} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={createTask}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Title</label>
                  <input
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    placeholder="e.g. Implement Socket connection, Design landing layout"
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    placeholder="Describe acceptance criteria or technical details..."
                    rows={3}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Priority</label>
                    <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}>
                      <option value="low">🟢 Low</option>
                      <option value="medium">🟡 Medium</option>
                      <option value="high">🟠 High</option>
                      <option value="urgent">🔴 Urgent</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Initial Status</label>
                    <select value={newTask.status} onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}>
                      {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Assign To Teammate</label>
                  <select
                    value={newTask.assignee_id}
                    onChange={(e) => setNewTask({ ...newTask, assignee_id: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.username} (@{m.username})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!newTask.title.trim()}>
                  <IconPlus size={14} />
                  <span>Create Task</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-app task delete confirmation modal */}
      {taskToDelete && (
        <ConfirmModal
          isOpen={true}
          title="Delete Task"
          message={`Are you sure you want to delete "${taskToDelete.title}"? This task will be permanently removed from the board.`}
          confirmText="Delete Task"
          confirmVariant="danger"
          onCancel={() => setTaskToDelete(null)}
          onConfirm={async () => {
            const id = taskToDelete.id;
            setTaskToDelete(null);
            await deleteTask(id);
          }}
        />
      )}
    </div>
  );
}
