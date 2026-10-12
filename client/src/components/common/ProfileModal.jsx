import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import api, { resolveMediaUrl } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  FiCamera,
  FiEdit,
  FiUser,
  FiZap,
  FiShield,
  FiAward,
  FiStar,
  FiFolder,
  FiUsers,
  FiCode,
  FiExternalLink,
  FiUploadCloud,
  FiCheck,
  FiX,
  FiLink,
} from 'react-icons/fi';
import { FaGithub, FaLinkedin, FaXTwitter, FaGlobe } from 'react-icons/fa6';
import VerifyEmailModal from './VerifyEmailModal';

export default function ProfileModal({ onClose, onProfileUpdated }) {
  const { user, setUser } = useAuth();
  const [activeTab, setActiveTab] = useState('showcase'); // 'showcase' | 'edit'
  const [profile, setProfile] = useState({
    name: '',
    bio: '',
    skills: [],
    username: '',
    alias: '',
    email: '',
    email_verified: false,
    avatar_url: null,
    banner_url: null,
    github_url: '',
    linkedin_url: '',
    twitter_url: '',
    portfolio_url: '',
    pinned_project_id: null,
    pinned_project: null,
    badges: [],
  });

  const [userProjects, setUserProjects] = useState([]);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [skillInput, setSkillInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const bannerFileRef = useRef(null);
  const avatarFileRef = useRef(null);
  const editBannerFileRef = useRef(null);
  const editAvatarFileRef = useRef(null);

  useEffect(() => {
    loadProfileAndProjects();
  }, []);

  const loadProfileAndProjects = async () => {
    setLoading(true);
    try {
      const [profRes, projRes] = await Promise.all([
        api.get('/users/profile'),
        api.get('/projects').catch(() => ({ data: [] })),
      ]);

      const data = profRes.data;
      setProfile({
        name: data.name || '',
        bio: data.bio || '',
        skills: data.skills || [],
        username: data.username || '',
        alias: data.alias || '',
        email: data.email || '',
        email_verified: Boolean(data.email_verified),
        avatar_url: data.avatar_url || null,
        banner_url: data.banner_url || null,
        github_url: data.github_url || '',
        linkedin_url: data.linkedin_url || '',
        twitter_url: data.twitter_url || '',
        portfolio_url: data.portfolio_url || '',
        pinned_project_id: data.pinned_project_id || null,
        pinned_project: data.pinned_project || null,
        badges: data.badges || [],
      });
      setUserProjects(projRes.data || []);
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBanner(true);
    setMessage({ type: '', text: '' });
    try {
      const formData = new FormData();
      formData.append('banner', file);
      const res = await api.post('/users/banner', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const newBannerUrl = res.data.banner_url;
      setProfile(prev => ({ ...prev, banner_url: newBannerUrl }));
      if (setUser) {
        setUser(prev => ({ ...prev, banner_url: newBannerUrl }));
      }
      const saved = localStorage.getItem('user');
      if (saved) {
        const u = JSON.parse(saved);
        u.banner_url = newBannerUrl;
        localStorage.setItem('user', JSON.stringify(u));
      }
      setMessage({ type: 'success', text: 'Banner image updated successfully!' });
      onProfileUpdated?.();
    } catch (err) {
      console.error('Banner upload error:', err);
      setMessage({ type: 'error', text: 'Failed to upload banner.' });
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    setMessage({ type: '', text: '' });
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await api.post('/users/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const newAvatarUrl = res.data.avatar_url;
      setProfile(prev => ({ ...prev, avatar_url: newAvatarUrl }));
      if (setUser) {
        setUser(prev => ({ ...prev, avatar_url: newAvatarUrl }));
      }
      const saved = localStorage.getItem('user');
      if (saved) {
        const u = JSON.parse(saved);
        u.avatar_url = newAvatarUrl;
        localStorage.setItem('user', JSON.stringify(u));
      }
      setMessage({ type: 'success', text: 'Profile picture updated successfully!' });
      onProfileUpdated?.();
    } catch (err) {
      console.error('Avatar upload error:', err);
      setMessage({ type: 'error', text: 'Failed to upload profile picture.' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAddSkill = (e) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault();
      const newSkill = skillInput.trim();
      if (!profile.skills.includes(newSkill)) {
        setProfile({ ...profile, skills: [...profile.skills, newSkill] });
      }
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setProfile({
      ...profile,
      skills: profile.skills.filter(s => s !== skillToRemove),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      await api.patch('/users/profile', {
        name: profile.name,
        bio: profile.bio,
        skills: profile.skills,
        banner_url: profile.banner_url,
        avatar_url: profile.avatar_url,
        github_url: profile.github_url,
        linkedin_url: profile.linkedin_url,
        twitter_url: profile.twitter_url,
        portfolio_url: profile.portfolio_url,
        pinned_project_id: profile.pinned_project_id,
      });

      if (setUser) {
        setUser(prev => ({
          ...prev,
          name: profile.name,
          bio: profile.bio,
          banner_url: profile.banner_url,
          avatar_url: profile.avatar_url,
        }));
      }

      setMessage({ type: 'success', text: 'Profile & Portfolio updated successfully!' });
      onProfileUpdated?.();
      setTimeout(() => {
        setActiveTab('showcase');
        loadProfileAndProjects();
      }, 600);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setMessage({ type: 'error', text: err.response?.data?.error?.message || 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const renderBadgeIcon = (badge) => {
    switch (badge.id || badge.type) {
      case 'early_builder':
        return <FiZap size={14} style={{ color: '#FEE75C' }} />;
      case 'workspace_leader':
        return <FiShield size={14} style={{ color: '#5865F2' }} />;
      case 'top_collaborator':
        return <FiAward size={14} style={{ color: '#57F287' }} />;
      default:
        return <FiStar size={14} style={{ color: '#FEE75C' }} />;
    }
  };

  const getFullImageUrl = (path) => resolveMediaUrl(path);

  return createPortal(
    <>
      <div
        className="modal-overlay"
        onClick={onClose}
        style={{
          zIndex: 99999,
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(5px)',
          padding: 16,
        }}
      >
        <div
          className="modal"
          style={{ maxWidth: 600, width: '92%', padding: 0, overflow: 'hidden' }}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          
          {/* Custom User Banner Header */}
          <div style={{
            position: 'relative',
            height: 130,
            background: profile.banner_url
              ? `url(${getFullImageUrl(profile.banner_url)}) center/cover no-repeat`
              : 'linear-gradient(135deg, #5865F2 0%, #2b3137 100%)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: 12,
          }}>
            <input
              type="file"
              ref={bannerFileRef}
              onChange={handleBannerUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />

            {/* Change Banner Quick Button */}
            <button
              onClick={() => bannerFileRef.current?.click()}
              className="btn btn-xs"
              style={{
                background: 'rgba(0,0,0,0.65)',
                backdropFilter: 'blur(8px)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 11,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
              title="Upload custom banner image"
            >
              <FiCamera size={13} />
              <span>{uploadingBanner ? 'Uploading...' : 'Change Banner'}</span>
            </button>

            <button
              className="modal-close-btn"
              onClick={onClose}
              style={{
                background: 'rgba(0,0,0,0.65)',
                borderRadius: '50%',
                color: '#fff',
                width: 28,
                height: 28,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
              }}
              title="Close"
            >
              <FiX size={16} />
            </button>
          </div>

          {/* Profile Header & Avatar Overlap */}
          <div style={{ padding: '0 24px', position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: -42 }}>
            
            {/* Avatar Circle with Camera Upload Overlay */}
            <div style={{ position: 'relative' }}>
              <input
                type="file"
                ref={avatarFileRef}
                onChange={handleAvatarUpload}
                accept="image/*"
                style={{ display: 'none' }}
              />

              <div
                className="user-avatar lg"
                style={{
                  width: 80,
                  height: 80,
                  fontSize: 32,
                  border: '4px solid var(--bg-primary)',
                  background: 'var(--discord-blurple)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
                onClick={() => avatarFileRef.current?.click()}
                title="Click to change profile picture"
              >
                {profile.avatar_url ? (
                  <img
                    src={getFullImageUrl(profile.avatar_url)}
                    alt={profile.name || profile.username}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span>{(profile.name || profile.username || '?').charAt(0).toUpperCase()}</span>
                )}
              </div>

              {/* Avatar Edit Badge */}
              <button
                type="button"
                onClick={() => avatarFileRef.current?.click()}
                style={{
                  position: 'absolute',
                  bottom: 2,
                  right: 2,
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: 'var(--discord-blurple)',
                  border: '2px solid var(--bg-primary)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                }}
                title="Upload Profile Picture"
              >
                <FiCamera size={13} />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button
                className={`btn btn-sm ${activeTab === 'showcase' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('showcase')}
                style={{ fontSize: 12, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <FiUser size={13} />
                <span>Portfolio Showcase</span>
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'edit' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('edit')}
                style={{ fontSize: 12, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <FiEdit size={13} />
                <span>Edit Profile</span>
              </button>
            </div>
          </div>

          {/* Toast / Status Message */}
          {message.text && (
            <div style={{ padding: '0 24px', marginTop: 12 }}>
              <div
                className={message.type === 'success' ? 'applicant-status-badge accepted' : 'error-msg'}
                style={{ textAlign: 'center', padding: '6px 12px', borderRadius: 6, fontSize: 12 }}
              >
                {message.text}
              </div>
            </div>
          )}

          {loading ? (
            <div className="empty-state" style={{ padding: 48 }}>
              <div className="spinner"></div>
            </div>
          ) : activeTab === 'showcase' ? (
            /* ========================================================= */
            /* TAB 1: RICH PROFILE & PORTFOLIO SHOWCASE                  */
            /* ========================================================= */
            <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '60vh', overflowY: 'auto' }}>
              
              {/* User Names & Alias */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
                    {profile.name || profile.username}
                  </h2>
                  <span style={{ fontSize: 11, background: 'rgba(88, 101, 242, 0.15)', color: 'var(--discord-blurple)', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                    @{profile.alias || profile.username}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  @{profile.username} · Member since {new Date(profile.created_at || Date.now()).getFullYear()}
                </div>
              </div>

              {/* Bio */}
              {profile.bio ? (
                <p style={{ fontSize: 13, color: 'var(--text-normal)', lineHeight: 1.5, background: 'var(--bg-subtle)', padding: 12, borderRadius: 8, margin: 0 }}>
                  {profile.bio}
                </p>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                  No bio written yet. Click "Edit Profile" to tell teammates what you build.
                </p>
              )}

              {/* Achievement Badges */}
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <FiAward size={13} style={{ color: '#FEE75C' }} />
                  <span>Badges & Honors</span>
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(profile.badges || []).map(b => (
                    <div
                      key={b.id || b.title}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'rgba(254, 231, 92, 0.08)',
                        border: '1px solid rgba(254, 231, 92, 0.25)',
                        borderRadius: 16,
                        padding: '4px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-heading)',
                      }}
                      title={b.desc}
                    >
                      {renderBadgeIcon(b)}
                      <span>{b.title}</span>
                    </div>
                  ))}
                  {(profile.badges || []).length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Contribute to workspaces to unlock badges!</span>
                  )}
                </div>
              </div>

              {/* Pinned Showcase Workspace */}
              {profile.pinned_project && (
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <FiStar size={13} style={{ color: '#FEE75C' }} />
                    <span>Featured Workspace</span>
                  </span>
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(88, 101, 242, 0.12) 0%, rgba(255,255,255,0.02) 100%)',
                    border: '1px solid rgba(88, 101, 242, 0.35)',
                    borderRadius: 10,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FiFolder size={17} style={{ color: 'var(--discord-blurple)' }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)' }}>
                          {profile.pinned_project.name}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <FiUsers size={12} />
                        {profile.pinned_project.member_count} members
                      </span>
                    </div>
                    {profile.pinned_project.description && (
                      <p style={{ fontSize: 12, color: 'var(--text-normal)', margin: 0 }}>
                        {profile.pinned_project.description}
                      </p>
                    )}
                    {profile.pinned_project.github_repo && (
                      <div style={{ fontSize: 11, color: 'var(--discord-blurple)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <FaGithub size={13} />
                        <span>{profile.pinned_project.github_repo}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Technical Skills */}
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <FiCode size={13} />
                  <span>Tech Stack & Skills</span>
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {profile.skills.map((s, i) => (
                    <span
                      key={i}
                      style={{
                        background: 'rgba(88, 101, 242, 0.15)',
                        border: '1px solid rgba(88, 101, 242, 0.3)',
                        color: 'var(--text-heading)',
                        borderRadius: 6,
                        padding: '3px 8px',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {s}
                    </span>
                  ))}
                  {profile.skills.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No skills listed.</span>
                  )}
                </div>
              </div>

              {/* Social / External Portfolio Links */}
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <FiLink size={13} />
                  <span>Socials & Portfolio</span>
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {profile.github_url && (
                    <a
                      href={profile.github_url.startsWith('http') ? profile.github_url : `https://github.com/${profile.github_url}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-subtle)', padding: '6px 12px', borderRadius: 8, fontSize: 12, color: 'var(--text-heading)', textDecoration: 'none', border: '1px solid var(--border-subtle)' }}
                    >
                      <FaGithub size={14} />
                      <span>GitHub</span>
                      <FiExternalLink size={11} style={{ opacity: 0.6 }} />
                    </a>
                  )}
                  {profile.linkedin_url && (
                    <a
                      href={profile.linkedin_url.startsWith('http') ? profile.linkedin_url : `https://linkedin.com/in/${profile.linkedin_url}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-subtle)', padding: '6px 12px', borderRadius: 8, fontSize: 12, color: '#0077b5', textDecoration: 'none', border: '1px solid var(--border-subtle)' }}
                    >
                      <FaLinkedin size={14} />
                      <span>LinkedIn</span>
                      <FiExternalLink size={11} style={{ opacity: 0.6 }} />
                    </a>
                  )}
                  {profile.twitter_url && (
                    <a
                      href={profile.twitter_url.startsWith('http') ? profile.twitter_url : `https://x.com/${profile.twitter_url.replace('@', '')}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-subtle)', padding: '6px 12px', borderRadius: 8, fontSize: 12, color: 'var(--text-heading)', textDecoration: 'none', border: '1px solid var(--border-subtle)' }}
                    >
                      <FaXTwitter size={13} />
                      <span>Twitter / X</span>
                      <FiExternalLink size={11} style={{ opacity: 0.6 }} />
                    </a>
                  )}
                  {profile.portfolio_url && (
                    <a
                      href={profile.portfolio_url.startsWith('http') ? profile.portfolio_url : `https://${profile.portfolio_url}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-subtle)', padding: '6px 12px', borderRadius: 8, fontSize: 12, color: 'var(--discord-green)', textDecoration: 'none', border: '1px solid var(--border-subtle)' }}
                    >
                      <FaGlobe size={13} />
                      <span>Portfolio Website</span>
                      <FiExternalLink size={11} style={{ opacity: 0.6 }} />
                    </a>
                  )}
                  {!profile.github_url && !profile.linkedin_url && !profile.twitter_url && !profile.portfolio_url && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No external links connected yet.</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* TAB 2: EDIT PROFILE, SOCIAL LINKS, & PINNED PROJECT       */
            /* ========================================================= */
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                
                {/* Media Management Section: Avatar & Banner */}
                <div style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 10,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FiCamera size={13} />
                    <span>Profile Media & Images</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    
                    {/* Avatar Upload Box */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: 12,
                      background: 'var(--bg-primary)',
                      borderRadius: 8,
                      border: '1px dashed var(--border-medium)',
                      textAlign: 'center',
                    }}>
                      <input
                        type="file"
                        ref={editAvatarFileRef}
                        onChange={handleAvatarUpload}
                        accept="image/*"
                        style={{ display: 'none' }}
                      />
                      <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', background: 'var(--discord-blurple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#fff' }}>
                        {profile.avatar_url ? (
                          <img src={getFullImageUrl(profile.avatar_url)} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          (profile.name || profile.username || '?').charAt(0).toUpperCase()
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-xs btn-secondary"
                        onClick={() => editAvatarFileRef.current?.click()}
                        disabled={uploadingAvatar}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}
                      >
                        <FiCamera size={12} />
                        <span>{uploadingAvatar ? 'Uploading...' : 'Upload Photo'}</span>
                      </button>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Square PNG/JPG (Max 5MB)</span>
                    </div>

                    {/* Banner Upload Box */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: 12,
                      background: 'var(--bg-primary)',
                      borderRadius: 8,
                      border: '1px dashed var(--border-medium)',
                      textAlign: 'center',
                    }}>
                      <input
                        type="file"
                        ref={editBannerFileRef}
                        onChange={handleBannerUpload}
                        accept="image/*"
                        style={{ display: 'none' }}
                      />
                      <div style={{
                        width: '100%',
                        height: 48,
                        borderRadius: 6,
                        background: profile.banner_url ? `url(${getFullImageUrl(profile.banner_url)}) center/cover no-repeat` : 'linear-gradient(135deg, #5865F2, #2b3137)',
                        border: '1px solid var(--border-subtle)',
                      }} />
                      <button
                        type="button"
                        className="btn btn-xs btn-secondary"
                        onClick={() => editBannerFileRef.current?.click()}
                        disabled={uploadingBanner}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}
                      >
                        <FiUploadCloud size={12} />
                        <span>{uploadingBanner ? 'Uploading...' : 'Upload Banner'}</span>
                      </button>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Wide Banner (Max 10MB)</span>
                    </div>

                  </div>
                </div>

                {/* Display Name */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FiUser size={13} />
                    <span>Display Name</span>
                  </label>
                  <input
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    placeholder="Your full name"
                  />
                </div>

                {/* Bio & Background */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FiEdit size={13} />
                    <span>Bio & Background</span>
                  </label>
                  <textarea
                    value={profile.bio}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    placeholder="Tell other builders about your background, goals, and passions..."
                    rows="3"
                  />
                </div>

                {/* Featured Pinned Workspace Picker */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FiFolder size={13} />
                    <span>Featured Pinned Workspace</span>
                  </label>
                  <select
                    value={profile.pinned_project_id || ''}
                    onChange={(e) => setProfile({ ...profile, pinned_project_id: e.target.value ? Number(e.target.value) : null })}
                    style={{
                      width: '100%',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border-medium)',
                      padding: '8px 10px',
                      borderRadius: 6,
                      color: 'var(--text-heading)',
                    }}
                  >
                    <option value="">None (Don't pin a workspace)</option>
                    {userProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Social Handles */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <FiLink size={13} />
                    <span>Social Media & Portfolio Links</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <FaGithub size={13} />
                        <span>GitHub</span>
                      </label>
                      <input
                        value={profile.github_url}
                        onChange={(e) => setProfile({ ...profile, github_url: e.target.value })}
                        placeholder="e.g. torvalds"
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <FaLinkedin size={13} style={{ color: '#0077b5' }} />
                        <span>LinkedIn</span>
                      </label>
                      <input
                        value={profile.linkedin_url}
                        onChange={(e) => setProfile({ ...profile, linkedin_url: e.target.value })}
                        placeholder="e.g. in/username"
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <FaXTwitter size={12} />
                        <span>Twitter / X</span>
                      </label>
                      <input
                        value={profile.twitter_url}
                        onChange={(e) => setProfile({ ...profile, twitter_url: e.target.value })}
                        placeholder="e.g. @builder"
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <FaGlobe size={13} style={{ color: 'var(--discord-green)' }} />
                        <span>Portfolio URL</span>
                      </label>
                      <input
                        value={profile.portfolio_url}
                        onChange={(e) => setProfile({ ...profile, portfolio_url: e.target.value })}
                        placeholder="https://mysite.dev"
                      />
                    </div>
                  </div>
                </div>

                {/* Skills Management */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FiCode size={13} />
                    <span>Technical Skills (Press Enter to add)</span>
                  </label>
                  <input
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={handleAddSkill}
                    placeholder="e.g. React, WebSockets, Python, Docker (Press Enter)"
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {profile.skills.map((skill, index) => (
                      <span
                        key={index}
                        className="skill-tag"
                        style={{ background: 'rgba(88, 101, 242, 0.2)', borderColor: 'var(--discord-blurple)', color: 'var(--text-heading)' }}
                      >
                        {skill}
                        <span
                          style={{ marginLeft: 6, cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 700 }}
                          onClick={() => handleRemoveSkill(skill)}
                        >
                          ×
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border-medium)', padding: '12px 24px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveTab('showcase')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <FiX size={15} />
                  <span>Cancel</span>
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <FiCheck size={15} />
                  <span>{saving ? 'Saving...' : 'Save Profile & Portfolio'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {showVerifyModal && (
        <VerifyEmailModal
          onClose={() => setShowVerifyModal(false)}
          onVerified={() => {
            setShowVerifyModal(false);
            loadProfileAndProjects();
            onProfileUpdated?.();
          }}
        />
      )}
    </>,
    document.body
  );
}
