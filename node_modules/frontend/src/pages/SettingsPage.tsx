import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, Users, Bell, Sliders, Zap } from 'lucide-react';
import api from '../lib/api';
import { formatDateTime, formatRelativeTime } from '../lib/utils';
import type { AppSettings, User } from '../types';

// ─── Threshold Slider ─────────────────────────────────────────────────────────
interface ThresholdSliderProps {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (val: number) => void;
}

function ThresholdSlider({ label, description, value, min, max, step, unit, onChange }: ThresholdSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-800">{label}</p>
          <p className="text-[11px] text-slate-400">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            min={min} max={max} step={step}
            onChange={e => onChange(parseFloat(e.target.value))}
            className="w-16 px-2 py-1 text-xs text-center border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <span className="text-xs text-slate-400">{unit}</span>
        </div>
      </div>
      <div className="relative">
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #6366F1 ${((value - min) / (max - min)) * 100}%, #E2E8F0 0%)`,
          }}
        />
      </div>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────
export function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'thresholds' | 'notifications' | 'users'>('thresholds');

  const { data: settings, isLoading: settingsLoading } = useQuery<AppSettings>({
    queryKey: ['settings'],
    queryFn: async () => { const { data } = await api.get('/settings'); return data; },
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => { const { data } = await api.get('/settings/users'); return data; },
    enabled: activeTab === 'users',
  });

  const [localSettings, setLocalSettings] = useState<Partial<AppSettings>>({});

  // Merge server settings with local edits
  const merged = { ...settings, ...localSettings } as AppSettings;

  const updateMutation = useMutation({
    mutationFn: (data: Partial<AppSettings>) => api.patch('/settings', data),
    onSuccess: () => {
      toast.success('Settings saved successfully');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setLocalSettings({});
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const handleSave = () => updateMutation.mutate(localSettings);

  const updateField = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    setLocalSettings(prev => ({ ...prev, [key]: val }));
  };

  const TABS = [
    { id: 'thresholds', label: 'Matching Rules', icon: Sliders },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'users', label: 'Users', icon: Users },
  ] as const;

  if (settingsLoading) return (
    <div className="p-6 space-y-4">
      {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
    </div>
  );

  return (
    <div className="p-6 max-w-3xl">
      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl mb-6 w-fit">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors btn-press ${
              activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <tab.icon size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Matching Rules */}
      {activeTab === 'thresholds' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={15} className="text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-800">Reconciliation Engine Thresholds</h3>
            </div>
            <p className="text-xs text-slate-500 -mt-4">These settings control how the matching algorithm classifies transactions. Changes take effect on the next reconciliation run.</p>

            <ThresholdSlider
              label="Exact Match Time Window"
              description="Max minutes between transaction and expected payment for exact match"
              value={merged.exactMatchWindowMins || 15}
              min={1} max={60} step={1} unit="min"
              onChange={v => updateField('exactMatchWindowMins', v)}
            />
            <ThresholdSlider
              label="Fuzzy Match Amount Tolerance"
              description="Max % difference in amount for fuzzy matching"
              value={merged.amountTolerancePct || 2}
              min={0.1} max={10} step={0.1} unit="%"
              onChange={v => updateField('amountTolerancePct', v)}
            />
            <ThresholdSlider
              label="Fuzzy Match Time Window"
              description="Max hours between timestamps for fuzzy matching"
              value={merged.timeWindowHours || 2}
              min={1} max={24} step={1} unit="hrs"
              onChange={v => updateField('timeWindowHours', v)}
            />
            <ThresholdSlider
              label="Auto-match Confidence Cutoff"
              description="Min confidence score to auto-match (above this → AUTO_MATCHED)"
              value={merged.confidenceCutoffAuto || 90}
              min={50} max={99} step={1} unit="%"
              onChange={v => updateField('confidenceCutoffAuto', v)}
            />
            <ThresholdSlider
              label="Flag Confidence Cutoff"
              description="Min confidence score to flag (below this → FLAGGED for review)"
              value={merged.confidenceCutoffFlag || 60}
              min={10} max={89} step={1} unit="%"
              onChange={v => updateField('confidenceCutoffFlag', v)}
            />
            <ThresholdSlider
              label="Stale Order Threshold"
              description="Hours after expected payment before flagging as UNMATCHED_ORDER"
              value={merged.staleOrderHours || 48}
              min={12} max={168} step={1} unit="hrs"
              onChange={v => updateField('staleOrderHours', v)}
            />
          </div>

          {Object.keys(localSettings).length > 0 && (
            <div className="flex items-center justify-between p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
              <p className="text-xs text-indigo-700 font-medium">You have unsaved changes</p>
              <div className="flex gap-2">
                <button onClick={() => setLocalSettings({})}
                  className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 btn-press">
                  Discard
                </button>
                <button onClick={handleSave} disabled={updateMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 btn-press disabled:opacity-70">
                  <Save size={11} /> Save Changes
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notifications */}
      {activeTab === 'notifications' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h3 className="text-sm font-semibold text-slate-800">Notification Rules</h3>
          {[
            { key: 'emailOnUnmatched' as const, label: 'Email on unmatched orders', desc: 'Send email when unmatched order count exceeds threshold' },
            { key: 'dailyDigest' as const, label: 'Daily reconciliation digest', desc: 'Receive a daily summary email at 9:00 AM IST' },
          ].map(toggle => (
            <div key={toggle.key} className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-800">{toggle.label}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{toggle.desc}</p>
              </div>
              <div
                onClick={() => {
                  const val = !(merged[toggle.key]);
                  updateField(toggle.key, val);
                  updateMutation.mutate({ [toggle.key]: val });
                }}
                className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${merged[toggle.key] ? 'bg-indigo-600' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${merged[toggle.key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </div>
          ))}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-700">Unmatched order threshold</label>
            <p className="text-[11px] text-slate-400">Trigger notifications when this many orders are unmatched</p>
            <input
              type="number" min={1} max={100}
              value={merged.unMatchedThreshold || 5}
              onChange={e => updateField('unMatchedThreshold', parseInt(e.target.value))}
              className="w-24 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          {Object.keys(localSettings).length > 0 && (
            <button onClick={handleSave} disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 btn-press disabled:opacity-70">
              <Save size={11} /> Save
            </button>
          )}
        </div>
      )}

      {/* Users */}
      {activeTab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">User Management</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">All users with access to ReconAI</p>
          </div>
          {usersLoading ? (
            <div className="p-4 space-y-3">
              {Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {(users || []).map((user: User) => (
                <div key={user.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-semibold flex-shrink-0">
                    {user.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900">{user.name}</p>
                    <p className="text-[11px] text-slate-400">{user.email}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full
                      ${user.role === 'ADMIN' ? 'bg-indigo-50 text-indigo-700' :
                        user.role === 'ANALYST' ? 'bg-emerald-50 text-emerald-700' :
                        'bg-slate-100 text-slate-600'}`}
                    >
                      {user.role}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-1">Last seen {user.lastLogin ? formatRelativeTime(user.lastLogin) : 'Never'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
