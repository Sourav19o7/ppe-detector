'use client';

import { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Calendar,
  Download,
  Filter,
  Mountain,
  Users,
  Shield,
  AlertTriangle,
  Target,
  Clock,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Card, StatCard } from '@/components/Card';
import { Spinner } from '@/components/Loading';
import { dashboardApi, mineApi } from '@/lib/api';
import type { GeneralManagerDashboard, Mine } from '@/types';

export default function PerformancePage() {
  const [data, setData] = useState<GeneralManagerDashboard | null>(null);
  const [mines, setMines] = useState<Mine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>('month');
  const [selectedMine, setSelectedMine] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, [timeRange, selectedMine]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [dashboardData, minesData] = await Promise.all([
        dashboardApi.getGeneralManager(),
        mineApi.list({ is_active: true }),
      ]);
      setData(dashboardData);
      setMines(minesData.mines);
      setError(null);
    } catch (err) {
      setError('Failed to load performance data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-500 mb-4">{error || 'Failed to load data'}</p>
          <button onClick={loadData} className="btn btn-primary">
            Retry
          </button>
        </div>
      </AppLayout>
    );
  }

  // Calculate performance metrics
  const avgCompliance = data.mine_performance.length > 0
    ? data.mine_performance.reduce((sum, m) => sum + m.compliance_rate, 0) / data.mine_performance.length
    : 0;

  const bestMine = data.mine_performance.reduce((best, m) =>
    m.compliance_rate > (best?.compliance_rate || 0) ? m : best
  , data.mine_performance[0]);

  const worstMine = data.mine_performance.reduce((worst, m) =>
    m.compliance_rate < (worst?.compliance_rate || 100) ? m : worst
  , data.mine_performance[0]);

  const totalEntries = data.mine_performance.reduce((sum, m) => sum + m.total_entries, 0);
  const totalViolations = data.mine_performance.reduce((sum, m) => sum + m.violations, 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Performance Analytics</h1>
            <p className="text-gray-500 mt-1">Detailed performance metrics across all operations</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
            </select>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>
        </div>

        {/* KPI Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Avg Compliance"
            value={`${avgCompliance.toFixed(1)}%`}
            icon={<Shield size={24} />}
            color={avgCompliance >= 90 ? 'green' : avgCompliance >= 80 ? 'yellow' : 'red'}
          />
          <StatCard
            title="Total Entries"
            value={totalEntries.toLocaleString()}
            icon={<Users size={24} />}
            color="blue"
          />
          <StatCard
            title="Total Violations"
            value={totalViolations}
            icon={<AlertTriangle size={24} />}
            color={totalViolations === 0 ? 'green' : 'red'}
          />
          <StatCard
            title="Active Mines"
            value={data.organization_overview.total_mines}
            icon={<Mountain size={24} />}
            color="purple"
          />
        </div>

        {/* Best vs Worst Performers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Best Performer */}
          {bestMine && (
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5" />
                <span className="text-green-100 text-sm font-medium">Best Performer</span>
              </div>
              <h3 className="text-2xl font-bold">{bestMine.mine_name}</h3>
              <div className="flex items-center gap-6 mt-4">
                <div>
                  <p className="text-green-100 text-sm">Compliance Rate</p>
                  <p className="text-3xl font-bold">{bestMine.compliance_rate}%</p>
                </div>
                <div>
                  <p className="text-green-100 text-sm">Violations</p>
                  <p className="text-3xl font-bold">{bestMine.violations}</p>
                </div>
              </div>
            </div>
          )}

          {/* Worst Performer */}
          {worstMine && worstMine !== bestMine && (
            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-5 h-5" />
                <span className="text-red-100 text-sm font-medium">Needs Improvement</span>
              </div>
              <h3 className="text-2xl font-bold">{worstMine.mine_name}</h3>
              <div className="flex items-center gap-6 mt-4">
                <div>
                  <p className="text-red-100 text-sm">Compliance Rate</p>
                  <p className="text-3xl font-bold">{worstMine.compliance_rate}%</p>
                </div>
                <div>
                  <p className="text-red-100 text-sm">Violations</p>
                  <p className="text-3xl font-bold">{worstMine.violations}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mine Performance Comparison */}
        <Card title="Mine Performance Comparison" description="Compliance rates across all mines">
          <div className="space-y-4">
            {data.mine_performance
              .sort((a, b) => b.compliance_rate - a.compliance_rate)
              .map((mine, index) => (
                <div key={mine.mine_id} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900">{mine.mine_name}</span>
                      <span className={`font-bold ${
                        mine.compliance_rate >= 90 ? 'text-green-600' :
                        mine.compliance_rate >= 80 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {mine.compliance_rate}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          mine.compliance_rate >= 90 ? 'bg-green-500' :
                          mine.compliance_rate >= 80 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${mine.compliance_rate}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span>{mine.total_entries.toLocaleString()} entries</span>
                      <span>{mine.violations} violations</span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </Card>

        {/* Regulatory Compliance */}
        <Card title="Regulatory Compliance Status" description="Progress towards regulatory requirements">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-gray-500">Current Compliance</p>
                  <p className="text-4xl font-bold text-gray-900">{data.regulatory_status.current_compliance}%</p>
                </div>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  data.regulatory_status.status === 'compliant' ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  <Target className={`w-8 h-8 ${
                    data.regulatory_status.status === 'compliant' ? 'text-green-600' : 'text-red-600'
                  }`} />
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className={`h-4 rounded-full ${
                    data.regulatory_status.current_compliance >= data.regulatory_status.compliance_threshold
                      ? 'bg-green-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(100, data.regulatory_status.current_compliance)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-sm">
                <span className="text-gray-500">0%</span>
                <span className="text-gray-500">Target: {data.regulatory_status.compliance_threshold}%</span>
                <span className="text-gray-500">100%</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Regulatory Threshold</span>
                  <span className="font-bold text-gray-900">{data.regulatory_status.compliance_threshold}%</span>
                </div>
              </div>
              <div className={`p-4 rounded-lg ${
                data.regulatory_status.status === 'compliant'
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center gap-2">
                  {data.regulatory_status.status === 'compliant' ? (
                    <>
                      <Shield className="w-5 h-5 text-green-600" />
                      <span className="font-medium text-green-700">Compliant</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                      <span className="font-medium text-red-700">Non-Compliant</span>
                    </>
                  )}
                </div>
                <p className="text-sm mt-1 opacity-80">
                  {data.regulatory_status.status === 'compliant'
                    ? 'All mines are meeting regulatory requirements'
                    : 'Immediate action required to meet regulatory standards'}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Financial Impact */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card title="Cost Savings">
            <div className="text-center py-4">
              <p className="text-5xl font-bold text-green-600">
                ${data.financial_insights.estimated_cost_savings.toLocaleString()}
              </p>
              <p className="text-gray-500 mt-2">Estimated savings from prevented incidents</p>
            </div>
          </Card>
          <Card title="Violations Prevented">
            <div className="text-center py-4">
              <p className="text-5xl font-bold text-blue-600">
                {data.financial_insights.violations_prevented_this_week}
              </p>
              <p className="text-gray-500 mt-2">Violations prevented through early intervention this week</p>
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
