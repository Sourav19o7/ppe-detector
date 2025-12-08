'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Clock,
  MapPin,
  Filter,
  ChevronLeft,
  ChevronRight,
  Shield,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Card, StatCard } from '@/components/Card';
import { Spinner } from '@/components/Loading';
import { useAuthStore } from '@/lib/store';
import { workerApi } from '@/lib/api';
import { formatTime } from '@/lib/utils';

interface Violation {
  id: string;
  timestamp: string;
  gate_name?: string;
  violations: string[];
  status: string;
  shift: string;
}

interface ViolationStats {
  total: number;
  thisWeek: number;
  thisMonth: number;
  mostCommon: string;
}

export default function MyViolationsPage() {
  const { worker } = useAuthStore();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [stats, setStats] = useState<ViolationStats>({
    total: 0,
    thisWeek: 0,
    thisMonth: 0,
    mostCommon: '-',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState<'all' | 'week' | 'month'>('all');
  const limit = 10;

  useEffect(() => {
    loadViolations();
  }, [page, filter]);

  const loadViolations = async () => {
    if (!worker) return;

    try {
      setLoading(true);
      const data = await workerApi.getViolations(worker.id, page * limit, limit);

      // Process violations data
      const processedViolations: Violation[] = (data.violations || []).map((v: any) => ({
        id: v.id || v._id,
        timestamp: v.timestamp,
        gate_name: v.gate_name,
        violations: v.violations || [],
        status: v.status || 'recorded',
        shift: v.shift || 'unknown',
      }));

      setViolations(processedViolations);
      setTotalPages(Math.ceil((data.total || 0) / limit));

      // Calculate stats
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const allViolations = data.violations || [];
      const weekViolations = allViolations.filter((v: any) => new Date(v.timestamp) >= weekAgo);
      const monthViolations = allViolations.filter((v: any) => new Date(v.timestamp) >= monthAgo);

      // Find most common violation type
      const violationCounts: Record<string, number> = {};
      allViolations.forEach((v: any) => {
        (v.violations || []).forEach((type: string) => {
          violationCounts[type] = (violationCounts[type] || 0) + 1;
        });
      });
      const mostCommon = Object.entries(violationCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

      setStats({
        total: data.total || 0,
        thisWeek: weekViolations.length,
        thisMonth: monthViolations.length,
        mostCommon: mostCommon.replace('NO-', 'Missing '),
      });

      setError(null);
    } catch (err) {
      setError('Failed to load violations');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getViolationColor = (type: string) => {
    if (type.includes('HELMET') || type.includes('helmet')) return 'bg-red-100 text-red-700';
    if (type.includes('VEST') || type.includes('vest')) return 'bg-orange-100 text-orange-700';
    if (type.includes('GLOVES') || type.includes('gloves')) return 'bg-yellow-100 text-yellow-700';
    if (type.includes('BOOTS') || type.includes('boots')) return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Violations</h1>
          <p className="text-gray-500 mt-1">Track and learn from your PPE compliance history</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Violations"
            value={stats.total}
            icon={<AlertTriangle size={24} />}
            color="red"
          />
          <StatCard
            title="This Week"
            value={stats.thisWeek}
            icon={<Calendar size={24} />}
            color={stats.thisWeek === 0 ? 'green' : 'yellow'}
          />
          <StatCard
            title="This Month"
            value={stats.thisMonth}
            icon={<Calendar size={24} />}
            color={stats.thisMonth === 0 ? 'green' : 'yellow'}
          />
          <StatCard
            title="Most Common"
            value={stats.mostCommon}
            icon={<TrendingUp size={24} />}
            color="blue"
          />
        </div>

        {/* Compliance Tip */}
        {stats.total > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Shield className="w-6 h-6 text-orange-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-orange-800">Improve Your Compliance</p>
                <p className="text-sm text-orange-700 mt-1">
                  {stats.mostCommon !== '-'
                    ? `Your most common violation is "${stats.mostCommon}". Make sure to double-check this item before entering the work area.`
                    : 'Review your violations below and take steps to improve your safety compliance.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* No Violations Message */}
        {stats.total === 0 && !loading && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
            <Shield className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-green-800">Excellent Compliance!</h3>
            <p className="text-green-700 mt-2">
              You have no recorded violations. Keep up the great work!
            </p>
          </div>
        )}

        {/* Violations List */}
        {stats.total > 0 && (
          <Card title="Violation History">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : error ? (
              <div className="text-center py-12 text-red-500">{error}</div>
            ) : (
              <>
                <div className="space-y-4">
                  {violations.map((violation) => (
                    <div
                      key={violation.id}
                      className="p-4 bg-gray-50 rounded-xl border border-gray-100"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                          </div>
                          <div>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {violation.violations.map((type, i) => (
                                <span
                                  key={i}
                                  className={`px-2 py-1 rounded-full text-xs font-medium ${getViolationColor(type)}`}
                                >
                                  {type.replace('NO-', 'Missing ')}
                                </span>
                              ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {new Date(violation.timestamp).toLocaleDateString()}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {new Date(violation.timestamp).toLocaleTimeString()}
                              </span>
                              {violation.gate_name && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-4 h-4" />
                                  {violation.gate_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded-full capitalize">
                          {violation.shift}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-4 border-t">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>
                    <span className="text-sm text-gray-500">
                      Page {page + 1} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </Card>
        )}

        {/* Safety Reminders */}
        <Card title="PPE Checklist">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">🪖</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Safety Helmet</p>
                <p className="text-xs text-gray-500">Must be worn at all times</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">🦺</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">High-Vis Vest</p>
                <p className="text-xs text-gray-500">Required in all work areas</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">🧤</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Safety Gloves</p>
                <p className="text-xs text-gray-500">For handling equipment</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">👢</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Safety Boots</p>
                <p className="text-xs text-gray-500">Steel-toe boots required</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
