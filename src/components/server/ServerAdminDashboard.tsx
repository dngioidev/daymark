import React, { useState, useEffect } from 'react';
import {
  Server,
  Smartphone,
  Shield,
  Layers,
  RefreshCw,
  Terminal,
  Copy,
  Check,
  Download,
  Key,
  LogOut,
  Clock,
  HardDrive,
  FileText,
  Calendar,
  CheckCircle2,
  Lock,
  Monitor,
} from 'lucide-react';
import { DailyDocument, StandaloneNote, AppSettings } from '../../types/daymark';
import { MarkdownPreview } from '../MarkdownPreview';

interface ServerAdminDashboardProps {
  username: string;
  onLogout: () => void;
  onSwitchToMobile: () => void;
  onSwitchToDesktop?: () => void;
  dailyDocs: DailyDocument[];
  notes: StandaloneNote[];
  settings: AppSettings;
  onExportZip: () => void;
}

type ServerTab = 'devices' | 'vault' | 'deploy' | 'security';

export const ServerAdminDashboard: React.FC<ServerAdminDashboardProps> = ({
  username,
  onLogout,
  onSwitchToMobile,
  onSwitchToDesktop,
  dailyDocs,
  notes,
  settings,
  onExportZip,
}) => {
  const [activeTab, setActiveTab] = useState<ServerTab>('devices');
  const [serverStats, setServerStats] = useState<any>(null);
  const [serverDevices, setServerDevices] = useState<any[]>([]);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Selected note for server vault preview
  const [selectedDocDate, setSelectedDocDate] = useState<string>(dailyDocs[0]?.date || '2026-10-16');
  const activeDailyDoc = dailyDocs.find((d) => d.date === selectedDocDate) || dailyDocs[0];

  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);

  const fetchServerInfo = async () => {
    try {
      const statsRes = await fetch(`${window.location.origin}/api/server/stats`);
      if (statsRes.ok) setServerStats(await statsRes.json());

      const devRes = await fetch(`${window.location.origin}/api/devices`);
      if (devRes.ok) {
        const data = await devRes.json();
        setServerDevices(data.devices || []);
      }
    } catch (e) {
      console.error('Failed to fetch server stats:', e);
    }
  };

  useEffect(() => {
    fetchServerInfo();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    try {
      const res = await fetch(`${window.location.origin}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer session',
        },
        body: JSON.stringify({ newPassword }),
      });
      if (res.ok) {
        setPasswordStatus('Password successfully updated on server!');
        setNewPassword('');
        setTimeout(() => setPasswordStatus(null), 3000);
      }
    } catch (err) {
      alert('Failed to update password');
    }
  };

  const DOCKER_COMPOSE_SNIPPET = `version: '3.8'

services:
  daymark-server:
    image: ghcr.io/daymark/daymark-server:latest
    container_name: daymark_sync_server
    restart: always
    ports:
      - "3000:3000"
    environment:
      - DAYMARK_USER=admin
      - DAYMARK_PASSWORD=daymark2026
      - PORT=3000
    volumes:
      - ./daymark-vault:/data/vault
      - ./daymark-config:/data/config`;

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col text-xs">
      {/* Server Admin Header */}
      <header className="bg-stone-900 text-stone-100 border-b border-stone-800 px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight">Daymark Self-Hosted Server</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
                ● Live · Port 3000
              </span>
            </div>
            <span className="text-[11px] text-stone-400">
              Authenticated as <code className="font-mono text-amber-400">{username}</code>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onSwitchToDesktop && (
            <button
              onClick={onSwitchToDesktop}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition-colors border border-stone-700"
            >
              <Monitor className="w-3.5 h-3.5 text-amber-400" />
              <span>Desktop Notes</span>
            </button>
          )}

          <button
            onClick={onSwitchToMobile}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition-colors border border-stone-700"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile App View</span>
          </button>

          <button
            onClick={onLogout}
            title="Log out of server admin"
            className="p-1.5 text-stone-400 hover:text-stone-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Admin Body */}
      <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1 flex flex-col">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-stone-200 dark:border-stone-800 pb-2">
          <button
            onClick={() => setActiveTab('devices')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'devices'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Mobile Sync Gateway</span>
          </button>

          <button
            onClick={() => setActiveTab('vault')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'vault'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Hosted Markdown Vault</span>
          </button>

          <button
            onClick={() => setActiveTab('deploy')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'deploy'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Self-Deploy Guide (Docker)</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'security'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Security & Password</span>
          </button>
        </div>

        {/* TAB 1: SYNC GATEWAY & MOBILE DEVICES */}
        {activeTab === 'devices' && (
          <div className="space-y-6">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-2xs">
                <div className="text-stone-500 text-[11px]">Registered Mobile Devices</div>
                <div className="text-xl font-bold font-mono text-stone-900 dark:text-stone-100 mt-1">
                  {serverDevices.length}
                </div>
              </div>

              <div className="p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-2xs">
                <div className="text-stone-500 text-[11px]">Vault Daily Documents</div>
                <div className="text-xl font-bold font-mono text-amber-600 mt-1">
                  {dailyDocs.length}
                </div>
              </div>

              <div className="p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-2xs">
                <div className="text-stone-500 text-[11px]">Standalone Markdown Notes</div>
                <div className="text-xl font-bold font-mono text-stone-900 dark:text-stone-100 mt-1">
                  {notes.length}
                </div>
              </div>

              <div className="p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-2xs">
                <div className="text-stone-500 text-[11px]">Sync Server Protocol</div>
                <div className="text-sm font-semibold font-mono text-emerald-600 mt-1">
                  v1.2 (Idempotent)
                </div>
              </div>
            </div>

            {/* Mobile Pairing Instructions Card */}
            <div className="p-5 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    Connect Your Mobile App to this Server
                  </h3>
                  <p className="text-stone-500 text-[11px]">
                    In your Daymark mobile app, go to the <strong>Sync</strong> tab and enter these credentials:
                  </p>
                </div>
                <button
                  onClick={() =>
                    handleCopy(
                      `Server: ${window.location.origin}/api/sync\nUser: ${username}\nPassword: daymark2026`,
                      'pairing'
                    )
                  }
                  className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 rounded-md font-medium transition-colors flex items-center gap-1.5"
                >
                  {copiedText === 'pairing' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedText === 'pairing' ? 'Copied' : 'Copy Credentials'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[11px]">
                <div className="p-3 bg-stone-50 dark:bg-stone-800/60 rounded-lg border border-stone-200 dark:border-stone-700">
                  <div className="text-stone-400 text-[10px] uppercase font-sans">Server Sync URL</div>
                  <div className="font-semibold text-stone-900 dark:text-stone-100 truncate mt-0.5">
                    {window.location.origin}/api/sync
                  </div>
                </div>

                <div className="p-3 bg-stone-50 dark:bg-stone-800/60 rounded-lg border border-stone-200 dark:border-stone-700">
                  <div className="text-stone-400 text-[10px] uppercase font-sans">Username</div>
                  <div className="font-semibold text-stone-900 dark:text-stone-100 mt-0.5">
                    {username}
                  </div>
                </div>

                <div className="p-3 bg-stone-50 dark:bg-stone-800/60 rounded-lg border border-stone-200 dark:border-stone-700">
                  <div className="text-stone-400 text-[10px] uppercase font-sans">Default Password</div>
                  <div className="font-semibold text-stone-900 dark:text-stone-100 mt-0.5">
                    daymark2026
                  </div>
                </div>
              </div>
            </div>

            {/* Registered Mobile Devices List */}
            <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Paired Mobile Devices
                </h3>
                <button
                  onClick={fetchServerInfo}
                  className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 rounded"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="divide-y divide-stone-100 dark:divide-stone-800">
                {serverDevices.map((dev) => (
                  <div key={dev.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-stone-900 dark:text-stone-100">
                          {dev.name}
                        </div>
                        <div className="text-[11px] text-stone-400 font-mono">
                          Platform: {dev.platform} · IP: {dev.ip}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>Synced</span>
                      </span>
                      <div className="text-[10px] text-stone-400 font-mono">
                        {new Date(dev.lastSyncAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: HOSTED VAULT EXPLORER */}
        {activeTab === 'vault' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 flex-1 min-h-[500px]">
            {/* List column */}
            <div className="md:col-span-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-stone-800">
                <span className="font-bold text-stone-900 dark:text-stone-100">Daily Documents</span>
                <button
                  onClick={onExportZip}
                  className="px-2.5 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded font-medium shadow-2xs"
                >
                  Download Vault ZIP
                </button>
              </div>

              <div className="space-y-1.5 overflow-y-auto max-h-[500px]">
                {dailyDocs.map((doc) => {
                  const tasks = doc.headings.flatMap((h) => h.items);
                  const isSelected = doc.date === selectedDocDate;
                  return (
                    <button
                      key={doc.date}
                      onClick={() => setSelectedDocDate(doc.date)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-colors flex items-center justify-between ${
                        isSelected
                          ? 'bg-amber-50/60 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 font-semibold'
                          : 'border-transparent hover:bg-stone-50 dark:hover:bg-stone-800'
                      }`}
                    >
                      <span className="font-mono">{doc.date}.md</span>
                      <span className="text-[11px] text-stone-400 font-mono">
                        {tasks.length} tasks
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Note Preview Column */}
            <div className="md:col-span-8 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 space-y-4 overflow-y-auto max-h-[600px]">
              <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800">
                <div>
                  <h3 className="text-sm font-bold font-mono">
                    Daily/{activeDailyDoc?.date.substring(0, 4)}/10-October/{activeDailyDoc?.date}.md
                  </h3>
                  <span className="text-[11px] text-stone-400">Canonical Markdown View</span>
                </div>
              </div>

              {activeDailyDoc && (
                <div className="space-y-5">
                  {activeDailyDoc.headings.map((heading) => (
                    <div key={heading.name} className="space-y-2">
                      <h4 className="font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                        <span className="text-amber-600 font-mono">#</span>
                        <span>{heading.name}</span>
                      </h4>

                      {heading.items.map((task) => (
                        <div
                          key={task.id}
                          className="p-2.5 bg-stone-50 dark:bg-stone-800/50 rounded-lg border border-stone-200 dark:border-stone-800 flex items-start gap-2.5"
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded-xs flex items-center justify-center border text-[10px] mt-0.5 ${
                              task.status === 'done'
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-stone-300 dark:border-stone-600'
                            }`}
                          >
                            {task.status === 'done' && '✓'}
                          </span>
                          <div>
                            <div
                              className={`font-medium ${
                                task.status === 'done' ? 'line-through text-stone-400' : ''
                              }`}
                            >
                              {task.title}
                            </div>
                            <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                              Status: {task.status} · Created: {task.createdDate}
                              {task.completedDate && ` · Completed: ${task.completedDate}`}
                            </div>
                          </div>
                        </div>
                      ))}

                      {heading.notesContent && (
                        <div className="p-3 bg-stone-50 dark:bg-stone-800/40 rounded-lg border border-stone-100 dark:border-stone-800">
                          <MarkdownPreview content={heading.notesContent} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: DOCKER & SELF-DEPLOY */}
        {activeTab === 'deploy' && (
          <div className="p-6 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-600" />
                <span>Self-Host Daymark on your Private Server or VPS</span>
              </h3>
              <p className="text-stone-500 text-[11px] mt-0.5">
                Run this Docker Compose file to deploy Daymark sync server on Raspberry Pi, Ubuntu VPS, or your home lab.
              </p>
            </div>

            <div className="relative">
              <pre className="p-4 bg-stone-900 text-stone-100 text-xs font-mono rounded-xl overflow-x-auto leading-relaxed border border-stone-800">
                {DOCKER_COMPOSE_SNIPPET}
              </pre>
              <button
                onClick={() => handleCopy(DOCKER_COMPOSE_SNIPPET, 'docker')}
                className="absolute top-3 right-3 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded text-xs font-mono flex items-center gap-1.5"
              >
                {copiedText === 'docker' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedText === 'docker' ? 'Copied' : 'Copy docker-compose.yml'}</span>
              </button>
            </div>

            <div className="pt-2">
              <h4 className="font-semibold text-stone-800 dark:text-stone-200 mb-1">
                Start with Single Shell Command
              </h4>
              <div className="p-3 bg-stone-50 dark:bg-stone-800/60 rounded-lg font-mono text-[11px] flex items-center justify-between">
                <code>docker run -d -p 3000:3000 -v ./daymark-vault:/data/vault ghcr.io/daymark/daymark-server:latest</code>
                <button
                  onClick={() =>
                    handleCopy(
                      'docker run -d -p 3000:3000 -v ./daymark-vault:/data/vault ghcr.io/daymark/daymark-server:latest',
                      'cmd'
                    )
                  }
                  className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                >
                  {copiedText === 'cmd' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SECURITY */}
        {activeTab === 'security' && (
          <div className="max-w-md p-6 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Change Server Password
              </h3>
              <p className="text-stone-500 text-[11px]">
                Update the password required for mobile sync and server administration.
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg font-mono"
                />
              </div>

              {passwordStatus && (
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-lg text-[11px] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{passwordStatus}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow-2xs transition-colors"
              >
                Update Password
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
