'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'primereact/dialog';

interface Props {
  title: string;
  subtitle?: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSignOut: () => void;
}

/** App header: sidebar toggle + page title on the left, user menu on the right. */
export function AppTopBar({ title, subtitle, sidebarOpen, onToggleSidebar, onSignOut }: Props) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <button type="button" className="app-header-toggle" aria-label="Toggle sidebar" aria-expanded={sidebarOpen} onClick={onToggleSidebar}>
          <i className="pi pi-bars" aria-hidden="true" />
        </button>
        <div className="app-header-titles">
          <h1 title={title}>{title}</h1>
          {subtitle && <div className="app-header-sub" title={subtitle}>{subtitle}</div>}
        </div>
      </div>
      <UserMenu onSignOut={onSignOut} />
    </header>
  );
}

function UserMenu({ onSignOut }: { onSignOut: () => void }) {
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setName(d.username))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  function onMenuKey(e: React.KeyboardEvent) {
    const list = items.current.filter(Boolean) as HTMLButtonElement[];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  }

  const display = name || 'Admin';

  return (
    <div className="user-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="user-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="user-menu-list"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
      >
        <span className="user-avatar" aria-hidden="true">{display.charAt(0).toUpperCase()}</span>
        <span className="user-text">
          <span className="user-name">{display}</span>
          <span className="user-role">Admin</span>
        </span>
        <i className="pi pi-chevron-down user-chev" aria-hidden="true" />
      </button>

      {open && (
        <div id="user-menu-list" className="user-dropdown" role="menu" aria-label="User menu" onKeyDown={onMenuKey}>
          <div className="user-dropdown-head">
            <span>Signed in as</span>
            <strong title={display}>{display}</strong>
          </div>
          <div className="user-dropdown-rule" role="separator" />
          <button ref={(el) => { items.current[0] = el; }} type="button" role="menuitem" className="user-item" onClick={() => { close(); setProfile(true); }}>
            <i className="pi pi-user" aria-hidden="true" /><span>Profile</span>
          </button>
          <button ref={(el) => { items.current[1] = el; }} type="button" role="menuitem" className="user-item" onClick={() => { close(); onSignOut(); }}>
            <i className="pi pi-sign-out" aria-hidden="true" /><span>Sign out</span>
          </button>
        </div>
      )}

      <Dialog header="Profile" visible={profile} onHide={() => setProfile(false)} style={{ width: 'min(400px, 92vw)' }} dismissableMask>
        <dl className="profile-details">
          <dt>Signed in as</dt>
          <dd>{display}</dd>
          <dt>Role</dt>
          <dd>Admin</dd>
        </dl>
      </Dialog>
    </div>
  );
}
