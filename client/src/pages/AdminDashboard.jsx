import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  IconUsers,
  IconAlertTriangle,
  IconCheck,
  IconClose,
  IconSearch,
  IconTrash,
  IconShield,
  IconSparkles,
  IconActivity,
} from '../components/common/Icons';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('reports'); // 'reports' | 'appeals' | 'users' | 'overview'
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Reports state
  const [reports, setReports] = useState([]);
  const [reportFilter, setReportFilter] = useState('pending');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Appeals state
  const [appeals, setAppeals] = useState([]);
  const [appealFilter, setAppealFilter] = useState('pending');
  const [appealNotes, setAppealNotes] = useState({});

  // Users state
  const [usersList, setUsersList] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('all');

  // Notification message
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  useEffect(() => {
    loadAllData();
  }, [reportFilter, appealFilter, userStatusFilter]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [statsRes, reportsRes, appealsRes, usersRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get(`/admin/reports?status=${reportFilter}`),
        api.get(`/admin/appeals?status=${appealFilter}`),
        api.get(`/admin/users?status=${userStatusFilter}&q=${encodeURIComponent(userSearch)}`),
      ]);

      setStats(statsRes.data);
      setReports(reportsRes.data.reports || []);
      setAppeals(appealsRes.data.appeals || []);
      setUsersList(usersRes.data.users || []);
    } catch (err) {
      console.error('Failed to load admin dashboard data:', err);
      showToast('Failed to load admin data. Ensure you have administrator rights.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchUsers = async (e) => {
    e.preventDefault();
    try {
      const res = await api.get(`/admin/users?status=${userStatusFilter}&q=${encodeURIComponent(userSearch)}`);
      setUsersList(res.data.users || []);
    } catch (err) {
      console.error('Search users error:', err);
    }
  };

  // Review Appeal Action
  const handleReviewAppeal = async (appealId, action) => {
    try {
      setActionLoadingId(appealId);
      const notes = appealNotes[appealId] || '';
      const res = await api.post(`/admin/appeals/${appealId}/review`, {
        action,
        admin_notes: notes,
      });

      showToast(res.data.message || `Appeal ${action}ed`);
      loadAllData();
    } catch (err) {
      console.error('Review appeal error:', err);
      showToast(err.response?.data?.error?.message || 'Failed to review appeal');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Moderate User Action (unfreeze, freeze, block, reset_reports, set_role)
  const handleModerateUser = async (targetUserId, action, extra = {}) => {
    try {
      setActionLoadingId(targetUserId);
      const res = await api.post(`/admin/users/${targetUserId}/moderation`, {
        action,
        ...extra,
      });

      showToast(res.data.message || `User action completed`);
      loadAllData();
    } catch (err) {
      console.error('Moderate user error:', err);
      showToast(err.response?.data?.error?.message || 'Failed to update user moderation');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Dismiss report
  const handleDismissReport = async (reportId, dismissPenalty = true) => {
    try {
      setActionLoadingId(reportId);
      await api.patch(`/admin/reports/${reportId}`, {
        status: 'dismissed',
        dismiss_penalty: dismissPenalty,
        admin_notes: 'Dismissed by system administrator',
      });

      showToast('Report dismissed and user penalty cleared.');
      loadAllData();
    } catch (err) {
      console.error('Dismiss report error:', err);
      showToast('Failed to dismiss report');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', maxWidth: 500, margin: '0 auto' }}>
        <div style={{ color: 'var(--discord-red)', marginBottom: 16 }}>
          <IconAlertTriangle size={48} />
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-heading)' }}>
          Access Restricted
        </h2>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
          The System Administrator Portal is strictly reserved for verified platform administrators.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Toast Alert */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 99999,
            padding: '12px 20px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--discord-blurple)',
            borderRadius: 8,
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            color: 'var(--text-heading)',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <IconSparkles size={16} style={{ color: 'var(--discord-blurple)' }} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-heading)' }}>
              System Administrator Portal
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: 4,
                background: 'rgba(88, 101, 242, 0.2)',
                color: 'var(--discord-blurple)',
                border: '1px solid rgba(88, 101, 242, 0.4)',
              }}
            >
              Root Admin
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            Website moderation, user reports, 7-day freeze penalties, unfreeze appeals, and access control.
          </p>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={loadAllData}
          disabled={loading}
          style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span>↻ Refresh Data</span>
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 14,
            marginBottom: 24,
          }}
        >
          <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Users</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-heading)', marginTop: 4 }}>
              {stats.users?.total_users || 0}
            </div>
          </div>

          <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--discord-green)', textTransform: 'uppercase' }}>Active Users</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--discord-green)', marginTop: 4 }}>
              {stats.users?.active_users || 0}
            </div>
          </div>

          <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#FEE75C', textTransform: 'uppercase' }}>Frozen Users (1 Wk)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FEE75C', marginTop: 4 }}>
              {stats.users?.frozen_users || 0}
            </div>
          </div>

          <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--discord-red)', textTransform: 'uppercase' }}>Blocked Users (3+ Rep)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--discord-red)', marginTop: 4 }}>
              {stats.users?.blocked_users || 0}
            </div>
          </div>

          <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--discord-blurple)', textTransform: 'uppercase' }}>Pending Reports</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--discord-blurple)', marginTop: 4 }}>
              {stats.reports?.pending_reports || 0}
            </div>
          </div>

          <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#EB459E', textTransform: 'uppercase' }}>Pending Appeals</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#EB459E', marginTop: 4 }}>
              {stats.appeals?.pending_appeals || 0}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-subtle)', marginBottom: 20 }}>
        <button
          className={`tab ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
          style={{ padding: '8px 16px', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <IconAlertTriangle size={15} />
          <span>User Reports Queue ({stats?.reports?.pending_reports || 0})</span>
        </button>

        <button
          className={`tab ${activeTab === 'appeals' ? 'active' : ''}`}
          onClick={() => setActiveTab('appeals')}
          style={{ padding: '8px 16px', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <IconActivity size={15} />
          <span>Unfreeze Appeals ({stats?.appeals?.pending_appeals || 0})</span>
        </button>

        <button
          className={`tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
          style={{ padding: '8px 16px', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <IconUsers size={15} />
          <span>All Users & Access</span>
        </button>
      </div>

      {/* TAB 1: REPORTS */}
      {activeTab === 'reports' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['pending', 'all', 'resolved', 'dismissed'].map((st) => (
                <button
                  key={st}
                  className={`btn btn-sm ${reportFilter === st ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setReportFilter(st)}
                  style={{ textTransform: 'capitalize', fontSize: '12px', padding: '4px 12px' }}
                >
                  {st}
                </button>
              ))}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Showing {reports.length} report{reports.length !== 1 ? 's' : ''}
            </span>
          </div>

          {reports.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 8 }}>
              <div style={{ color: 'var(--discord-green)', marginBottom: 8 }}>
                <IconCheck size={32} />
              </div>
              <h3 style={{ margin: 0, color: 'var(--text-heading)', fontSize: '1.1rem' }}>No reports found</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                All user reports in this filter category have been resolved.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {reports.map((rep) => (
                <div
                  key={rep.id}
                  style={{
                    padding: '16px 20px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '3px 8px',
                          borderRadius: 4,
                          background:
                            rep.action_taken === 'blocked'
                              ? 'rgba(242, 63, 67, 0.2)'
                              : 'rgba(254, 231, 92, 0.2)',
                          color:
                            rep.action_taken === 'blocked'
                              ? 'var(--discord-red)'
                              : '#FEE75C',
                          border: `1px solid ${
                            rep.action_taken === 'blocked'
                              ? 'rgba(242, 63, 67, 0.4)'
                              : 'rgba(254, 231, 92, 0.4)'
                          }`,
                        }}
                      >
                        Penalty: {rep.action_taken || 'Frozen'}
                      </span>

                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)' }}>
                        Target: {rep.target_type.toUpperCase()} #{rep.target_id}
                      </span>

                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(rep.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background:
                            rep.status === 'pending'
                              ? 'rgba(88, 101, 242, 0.15)'
                              : 'var(--bg-tertiary)',
                          color:
                            rep.status === 'pending'
                              ? 'var(--discord-blurple)'
                              : 'var(--text-muted)',
                        }}
                      >
                        Status: {rep.status}
                      </span>
                    </div>
                  </div>

                  {/* Users involved */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: 12,
                      padding: '10px 14px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 6,
                      fontSize: '12px',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Reported User:</span>
                      <strong style={{ color: 'var(--text-heading)' }}>
                        @{rep.reported_username || 'user'} ({rep.reported_email || 'no email'})
                      </strong>
                      <div style={{ marginTop: 2, color: 'var(--text-muted)' }}>
                        Total Reports: <strong style={{ color: rep.reported_total_reports >= 3 ? 'var(--discord-red)' : 'var(--discord-yellow)' }}>{rep.reported_total_reports || 1}</strong>
                        {' • '}
                        Status: <strong style={{ color: rep.reported_current_status === 'blocked' ? 'var(--discord-red)' : '#FEE75C' }}>{rep.reported_current_status || 'frozen'}</strong>
                      </div>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Reported By:</span>
                      <strong style={{ color: 'var(--text-heading)' }}>
                        @{rep.reporter_username || 'anonymous'} ({rep.reporter_email || ''})
                      </strong>
                    </div>
                  </div>

                  {/* Reason */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                      REASON / VIOLATION DETAILS:
                    </div>
                    <div
                      style={{
                        padding: '10px 14px',
                        background: 'rgba(242, 63, 67, 0.08)',
                        border: '1px solid rgba(242, 63, 67, 0.2)',
                        borderRadius: 6,
                        fontSize: '13px',
                        color: 'var(--text-heading)',
                        fontWeight: 600,
                      }}
                    >
                      {rep.reason}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={() => handleDismissReport(rep.id, true)}
                      disabled={actionLoadingId === rep.id}
                      style={{ color: 'var(--discord-green)', borderColor: 'rgba(87, 242, 135, 0.4)' }}
                    >
                      ✓ Dismiss & Unfreeze User
                    </button>

                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={() => handleModerateUser(rep.reported_user_id, 'unfreeze')}
                      disabled={actionLoadingId === rep.reported_user_id}
                      style={{ fontWeight: 600 }}
                    >
                      Restore Access (Unfreeze)
                    </button>

                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={() => handleModerateUser(rep.reported_user_id, 'block', { reason: rep.reason })}
                      disabled={actionLoadingId === rep.reported_user_id}
                      style={{ color: 'var(--discord-red)', borderColor: 'rgba(242, 63, 67, 0.4)' }}
                    >
                      Block User Permanently
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: UNFREEZE APPEALS */}
      {activeTab === 'appeals' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['pending', 'all', 'approved', 'rejected'].map((st) => (
                <button
                  key={st}
                  className={`btn btn-sm ${appealFilter === st ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setAppealFilter(st)}
                  style={{ textTransform: 'capitalize', fontSize: '12px', padding: '4px 12px' }}
                >
                  {st}
                </button>
              ))}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Showing {appeals.length} appeal request{appeals.length !== 1 ? 's' : ''}
            </span>
          </div>

          {appeals.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 8 }}>
              <div style={{ color: 'var(--discord-green)', marginBottom: 8 }}>
                <IconCheck size={32} />
              </div>
              <h3 style={{ margin: 0, color: 'var(--text-heading)', fontSize: '1.1rem' }}>No appeals pending review</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                All user unfreeze appeal requests have been reviewed.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {appeals.map((app) => (
                <div
                  key={app.id}
                  style={{
                    padding: '16px 20px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: 'var(--discord-blurple)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '14px',
                        }}
                      >
                        {app.username ? app.username.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <strong style={{ color: 'var(--text-heading)', fontSize: '14px' }}>
                          @{app.username} ({app.email})
                        </strong>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Status: <span style={{ color: app.user_status === 'blocked' ? 'var(--discord-red)' : '#FEE75C', fontWeight: 600 }}>{app.user_status}</span>
                          {' • '}
                          Total Reports: {app.report_count}
                          {' • '}
                          Submitted: {new Date(app.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background:
                            app.status === 'pending'
                              ? 'rgba(254, 231, 92, 0.2)'
                              : app.status === 'approved'
                              ? 'rgba(87, 242, 135, 0.2)'
                              : 'rgba(242, 63, 67, 0.2)',
                          color:
                            app.status === 'pending'
                              ? '#FEE75C'
                              : app.status === 'approved'
                              ? 'var(--discord-green)'
                              : 'var(--discord-red)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {app.status}
                      </span>
                    </div>
                  </div>

                  {/* Freeze Reason vs Appeal Message */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                        ORIGINAL REPORT / FREEZE REASON:
                      </span>
                      <div
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(242, 63, 67, 0.08)',
                          borderRadius: 6,
                          fontSize: '12px',
                          color: 'var(--text-normal)',
                        }}
                      >
                        {app.freeze_reason || 'Community violation report'}
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                        USER'S UNFREEZE EXPLANATION:
                      </span>
                      <div
                        style={{
                          padding: '8px 12px',
                          background: 'var(--bg-tertiary)',
                          borderRadius: 6,
                          fontSize: '12px',
                          color: 'var(--text-heading)',
                          fontStyle: 'italic',
                        }}
                      >
                        "{app.appeal_reason}"
                      </div>
                    </div>
                  </div>

                  {/* Admin review note input and action buttons if pending */}
                  {app.status === 'pending' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Admin note to include in user notification (optional)..."
                        value={appealNotes[app.id] || ''}
                        onChange={(e) => setAppealNotes({ ...appealNotes, [app.id]: e.target.value })}
                        style={{ fontSize: '12px', padding: '6px 10px' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleReviewAppeal(app.id, 'reject')}
                          disabled={actionLoadingId === app.id}
                          style={{ color: 'var(--discord-red)', borderColor: 'rgba(242, 63, 67, 0.4)' }}
                        >
                          ✕ Decline Appeal
                        </button>

                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleReviewAppeal(app.id, 'approve')}
                          disabled={actionLoadingId === app.id}
                          style={{ background: 'var(--discord-green)', borderColor: 'var(--discord-green)', fontWeight: 700 }}
                        >
                          ✓ Approve & Unfreeze User
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Reviewed on {new Date(app.reviewed_at).toLocaleString()} by @{app.reviewed_by_username || 'admin'}
                      {app.admin_notes && ` — Note: "${app.admin_notes}"`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ALL USERS & MODERATION */}
      {activeTab === 'users' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            {/* Search */}
            <form onSubmit={handleSearchUsers} style={{ display: 'flex', gap: 8, flex: 1, maxWidth: 400 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search username, email, name..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{ fontSize: '13px', padding: '6px 12px' }}
              />
              <button type="submit" className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconSearch size={14} /> Search
              </button>
            </form>

            {/* Filter buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              {['all', 'active', 'frozen', 'blocked'].map((st) => (
                <button
                  key={st}
                  className={`btn btn-sm ${userStatusFilter === st ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setUserStatusFilter(st)}
                  style={{ textTransform: 'capitalize', fontSize: '12px', padding: '4px 12px' }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-subtle)', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>User</th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Email</th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Role</th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Status</th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Reports</th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map((u) => (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'var(--discord-blurple)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '12px',
                          }}
                        >
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong style={{ color: 'var(--text-heading)', display: 'block' }}>@{u.username}</strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{u.name || u.alias}</span>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '12px 16px', color: 'var(--text-normal)' }}>{u.email}</td>

                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: u.role === 'admin' ? 'rgba(88, 101, 242, 0.2)' : 'var(--bg-subtle)',
                          color: u.role === 'admin' ? 'var(--discord-blurple)' : 'var(--text-muted)',
                        }}
                      >
                        {u.role.toUpperCase()}
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background:
                            u.status === 'active'
                              ? 'rgba(87, 242, 135, 0.15)'
                              : u.status === 'frozen'
                              ? 'rgba(254, 231, 92, 0.15)'
                              : 'rgba(242, 63, 67, 0.15)',
                          color:
                            u.status === 'active'
                              ? 'var(--discord-green)'
                              : u.status === 'frozen'
                              ? '#FEE75C'
                              : 'var(--discord-red)',
                        }}
                      >
                        {u.status.toUpperCase()}
                        {u.status === 'frozen' && u.frozen_until && (
                          <span style={{ fontSize: '10px', fontWeight: 400, opacity: 0.8, marginLeft: 4 }}>
                            (until {new Date(u.frozen_until).toLocaleDateString()})
                          </span>
                        )}
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: u.report_count >= 3 ? 'var(--discord-red)' : u.report_count > 0 ? '#FEE75C' : 'var(--text-muted)',
                        }}
                      >
                        {u.report_count} / 3
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {u.status !== 'active' ? (
                          <button
                            className="btn btn-secondary btn-xs"
                            onClick={() => handleModerateUser(u.id, 'unfreeze')}
                            disabled={actionLoadingId === u.id}
                            style={{ color: 'var(--discord-green)', fontWeight: 600 }}
                            title="Manually unfreeze and restore user access"
                          >
                            Unfreeze
                          </button>
                        ) : (
                          <button
                            className="btn btn-secondary btn-xs"
                            onClick={() => handleModerateUser(u.id, 'freeze', { freeze_days: 7, reason: 'Manual admin freeze' })}
                            disabled={actionLoadingId === u.id}
                            style={{ color: '#FEE75C' }}
                            title="Freeze user account for 7 days"
                          >
                            Freeze (7d)
                          </button>
                        )}

                        {u.status !== 'blocked' ? (
                          <button
                            className="btn btn-secondary btn-xs"
                            onClick={() => handleModerateUser(u.id, 'block', { reason: 'Manual admin block' })}
                            disabled={actionLoadingId === u.id}
                            style={{ color: 'var(--discord-red)' }}
                            title="Permanently block user"
                          >
                            Block
                          </button>
                        ) : (
                          <button
                            className="btn btn-secondary btn-xs"
                            onClick={() => handleModerateUser(u.id, 'unfreeze')}
                            disabled={actionLoadingId === u.id}
                            style={{ color: 'var(--discord-green)' }}
                          >
                            Unblock
                          </button>
                        )}

                        {u.report_count > 0 && (
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() => handleModerateUser(u.id, 'reset_reports')}
                            disabled={actionLoadingId === u.id}
                            title="Reset report count to 0"
                          >
                            Reset Reps
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
