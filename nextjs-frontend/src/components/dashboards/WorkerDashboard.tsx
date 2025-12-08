'use client';

import { useEffect, useState } from 'react';
import {
  Shield,
  Award,
  AlertTriangle,
  Clock,
  Calendar,
  TrendingUp,
  Bell,
  CheckCircle,
  Star,
  Flame,
} from 'lucide-react';
import { Card } from '@/components/Card';
import { Spinner } from '@/components/Loading';
import { dashboardApi, alertApi } from '@/lib/api';
import type { WorkerDashboard as DashboardType } from '@/types';

// Badge icons and colors
const badgeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  safety_star: { icon: <Star className="w-4 h-4" />, color: 'bg-yellow-100 text-yellow-700', label: 'Safety Star' },
  perfect_record: { icon: <CheckCircle className="w-4 h-4" />, color: 'bg-green-100 text-green-700', label: 'Perfect Record' },
  streak_7: { icon: <Flame className="w-4 h-4" />, color: 'bg-orange-100 text-orange-700', label: '7 Day Streak' },
  streak_30: { icon: <Flame className="w-4 h-4" />, color: 'bg-red-100 text-red-700', label: '30 Day Streak' },
};

export default function WorkerDashboard() {
  const [data, setData] = useState<DashboardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const dashboardData = await dashboardApi.getWorker();
      setData(dashboardData);
    } catch (err) {
      setError('Failed to load dashboard');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeNotification = async (id: string) => {
    try {
      await alertApi.acknowledgeWarning(id);
      loadData();
    } catch (err) {
      console.error('Failed to acknowledge:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error || 'Failed to load data'}</p>
        <button onClick={loadData} className="mt-4 btn btn-primary">
          Retry
        </button>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">Welcome, {data.worker.name}!</h1>
        <p className="text-orange-100 mt-1">
          {data.worker.mine_name} • {data.worker.zone_name || 'General'}
        </p>

        {/* Compliance Score Circle */}
        <div className="flex items-center gap-6 mt-6">
          <div className="relative">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="8"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="white"
                strokeWidth="8"
                strokeDasharray={`${data.compliance.score * 2.51} 251`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold">{Math.round(data.compliance.score)}</span>
            </div>
          </div>
          <div>
            <p className="text-orange-100 text-sm">Compliance Score</p>
            <p className="text-3xl font-bold">{data.compliance.score >= 90 ? 'Excellent!' : data.compliance.score >= 70 ? 'Good' : 'Needs Improvement'}</p>
            <p className="text-orange-100 text-sm mt-1">
              {data.compliance.current_streak_days} day streak
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <Calendar className="w-6 h-6 text-blue-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{data.statistics.total_entries}</p>
          <p className="text-xs text-gray-500">Total Entries</p>
        </div>
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{data.compliance.total_violations}</p>
          <p className="text-xs text-gray-500">Violations</p>
        </div>
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <Flame className="w-6 h-6 text-orange-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{data.compliance.current_streak_days}</p>
          <p className="text-xs text-gray-500">Day Streak</p>
        </div>
      </div>

      {/* Shift Info Card */}
      <Card title="Your Shift" className="bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              data.shift_info.is_current_shift ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              <Clock className={`w-6 h-6 ${data.shift_info.is_current_shift ? 'text-green-600' : 'text-gray-600'}`} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{data.shift_info.shift_name}</p>
              <p className="text-sm text-gray-500">
                {data.shift_info.start_time} - {data.shift_info.end_time}
              </p>
            </div>
          </div>
          {data.shift_info.is_current_shift && (
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              Active Now
            </span>
          )}
        </div>
      </Card>

      {/* Badges */}
      {data.badges.length > 0 && (
        <Card title="Badges Earned" className="bg-white">
          <div className="flex flex-wrap gap-2">
            {data.badges.map((badge) => {
              const config = badgeConfig[badge] || {
                icon: <Award className="w-4 h-4" />,
                color: 'bg-gray-100 text-gray-700',
                label: badge
              };
              return (
                <span
                  key={badge}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${config.color}`}
                >
                  {config.icon}
                  {config.label}
                </span>
              );
            })}
          </div>
        </Card>
      )}

      {/* Notifications */}
      {data.notifications.length > 0 && (
        <Card title="Notifications" className="bg-white">
          <div className="space-y-3">
            {data.notifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-3 rounded-lg border-l-4 ${
                  notif.severity === 'severe'
                    ? 'bg-red-50 border-red-500'
                    : notif.severity === 'moderate'
                    ? 'bg-yellow-50 border-yellow-500'
                    : 'bg-blue-50 border-blue-500'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{notif.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(notif.date).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleAcknowledgeNotification(notif.id)}
                    className="text-xs px-2 py-1 bg-white border rounded hover:bg-gray-50"
                  >
                    OK
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Violations */}
      {data.recent_violations.length > 0 && (
        <Card title="Recent Violations" className="bg-white">
          <div className="space-y-3">
            {data.recent_violations.map((violation, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap gap-1">
                    {violation.violations.map((v, i) => (
                      <span key={i} className="text-sm text-red-700">
                        {v.replace('NO-', 'Missing ')}
                        {i < violation.violations.length - 1 && ', '}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    {violation.date} at {violation.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Safety Tip */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
        <div className="flex items-start gap-3">
          <Shield className="w-6 h-6 text-blue-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-blue-900">Safety Tip</p>
            <p className="text-sm text-blue-700 mt-1">
              Always ensure your helmet is securely fastened before entering the work area.
              A properly worn helmet can save your life!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
