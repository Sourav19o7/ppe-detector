'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Flame,
  Wind,
  Gauge,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Activity,
  MapPin,
  ThermometerSun,
  Droplets,
  Mountain,
  Shield,
  XCircle,
  CheckCircle,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Card, StatCard } from '@/components/Card';
import { Spinner } from '@/components/Loading';
import { gasSensorApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface GasReading {
  id: string;
  mine_id: string;
  mine_name: string;
  zone_id?: string;
  zone_name?: string;
  gate_id?: string;
  gate_name?: string;
  sensor_id?: string;
  methane_ppm: number;
  co_ppm: number;
  pressure_hpa: number;
  altitude_m: number;
  temperature_c?: number;
  humidity?: number;
  severity: 'normal' | 'medium' | 'high' | 'critical';
  timestamp: string;
}

interface GasStats {
  total_readings: number;
  time_range_hours: number;
  methane: {
    current: number;
    avg: number;
    max: number;
    min: number;
  };
  co: {
    current: number;
    avg: number;
    max: number;
    min: number;
  };
  severity_distribution: {
    normal: number;
    medium: number;
    high: number;
    critical: number;
  };
  total_alerts: number;
  is_safe: boolean;
}

export default function GasMonitoringPage() {
  const { getMineId } = useAuthStore();
  const [latestReadings, setLatestReadings] = useState<GasReading[]>([]);
  const [stats, setStats] = useState<GasStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [timeRange, setTimeRange] = useState(24);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const mineId = getMineId();

      const [latestData, statsData] = await Promise.all([
        gasSensorApi.getLatest(mineId || undefined),
        gasSensorApi.getStats(mineId || undefined, timeRange),
      ]);

      setLatestReadings(latestData.readings || []);
      setStats(statsData);
      setError(null);
    } catch (err) {
      setError('Failed to load gas monitoring data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [getMineId, timeRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadData();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  if (loading && !stats) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      </AppLayout>
    );
  }

  if (error && !stats) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={loadData} className="btn btn-primary">
            Retry
          </button>
        </div>
      </AppLayout>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'red';
      case 'high': return 'red';
      case 'medium': return 'yellow';
      default: return 'green';
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors = {
      critical: 'bg-red-100 text-red-700 border-red-200',
      high: 'bg-orange-100 text-orange-700 border-orange-200',
      medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      normal: 'bg-green-100 text-green-700 border-green-200',
    };
    return colors[severity as keyof typeof colors] || colors.normal;
  };

  const getGasLevelStatus = (ppm: number, type: 'methane' | 'co') => {
    if (type === 'methane') {
      if (ppm > 12500) return { status: 'DANGER', color: 'text-red-600' };
      if (ppm > 10000) return { status: 'WARNING', color: 'text-orange-600' };
      if (ppm > 5000) return { status: 'ELEVATED', color: 'text-yellow-600' };
      return { status: 'SAFE', color: 'text-green-600' };
    } else {
      if (ppm > 50) return { status: 'DANGER', color: 'text-red-600' };
      if (ppm > 35) return { status: 'WARNING', color: 'text-orange-600' };
      if (ppm > 25) return { status: 'ELEVATED', color: 'text-yellow-600' };
      return { status: 'SAFE', color: 'text-green-600' };
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
              <Wind className="w-7 h-7 text-cyan-600" />
              Gas Monitoring System
            </h1>
            <p className="text-stone-500 mt-1">Real-time methane and carbon monoxide detection</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(Number(e.target.value))}
              className="px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
            >
              <option value={1}>Last Hour</option>
              <option value={6}>Last 6 Hours</option>
              <option value={24}>Last 24 Hours</option>
              <option value={72}>Last 3 Days</option>
              <option value={168}>Last Week</option>
            </select>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                autoRefresh
                  ? 'bg-cyan-600 text-white'
                  : 'bg-stone-100 text-stone-700'
              }`}
            >
              <Activity className="w-4 h-4" />
              {autoRefresh ? 'Live' : 'Paused'}
            </button>
            <button
              onClick={loadData}
              className="flex items-center gap-2 px-4 py-2 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Overall Status Banner */}
        {stats && (
          <div className={`rounded-xl p-6 ${
            stats.is_safe
              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
              : 'bg-gradient-to-r from-red-500 to-red-600 text-white'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {stats.is_safe ? (
                    <CheckCircle className="w-6 h-6" />
                  ) : (
                    <XCircle className="w-6 h-6" />
                  )}
                  <span className="text-sm font-medium opacity-90">
                    System Status
                  </span>
                </div>
                <h2 className="text-3xl font-bold">
                  {stats.is_safe ? 'ALL CLEAR' : 'ALERT - ACTION REQUIRED'}
                </h2>
                <p className="mt-1 opacity-90">
                  {stats.is_safe
                    ? 'All gas levels within safe limits'
                    : `${stats.total_alerts} active alerts requiring attention`}
                </p>
              </div>
              <Shield className="w-16 h-16 opacity-20" />
            </div>
          </div>
        )}

        {/* Statistics Overview */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Methane (CH₄)"
              value={`${Math.round(stats.methane.current)} PPM`}
              icon={<Flame size={24} />}
              color={getSeverityColor(getGasLevelStatus(stats.methane.current, 'methane').status)}
              subtitle={getGasLevelStatus(stats.methane.current, 'methane').status}
            />
            <StatCard
              title="Carbon Monoxide"
              value={`${Math.round(stats.co.current)} PPM`}
              icon={<Wind size={24} />}
              color={getSeverityColor(getGasLevelStatus(stats.co.current, 'co').status)}
              subtitle={getGasLevelStatus(stats.co.current, 'co').status}
            />
            <StatCard
              title="Active Alerts"
              value={stats.total_alerts}
              icon={<AlertTriangle size={24} />}
              color={stats.total_alerts > 0 ? 'red' : 'green'}
            />
            <StatCard
              title="Total Readings"
              value={stats.total_readings}
              icon={<Activity size={24} />}
              color="blue"
              subtitle={`Last ${timeRange}h`}
            />
          </div>
        )}

        {/* Gas Trends */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Methane Trends */}
            <Card title="Methane (CH₄) Levels" description={`Statistics for last ${timeRange} hours`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-stone-50 rounded-lg">
                  <div>
                    <p className="text-sm text-stone-500">Current</p>
                    <p className={`text-2xl font-bold ${getGasLevelStatus(stats.methane.current, 'methane').color}`}>
                      {Math.round(stats.methane.current)} PPM
                    </p>
                  </div>
                  <Flame className={`w-12 h-12 ${getGasLevelStatus(stats.methane.current, 'methane').color}`} />
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-stone-500">Average</p>
                    <p className="text-lg font-bold text-blue-600">{Math.round(stats.methane.avg)}</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="text-xs text-stone-500">Max</p>
                    <p className="text-lg font-bold text-red-600">{Math.round(stats.methane.max)}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-xs text-stone-500">Min</p>
                    <p className="text-lg font-bold text-green-600">{Math.round(stats.methane.min)}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-stone-200">
                  <h4 className="text-sm font-medium text-stone-700 mb-2">Safety Thresholds</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-stone-600">Safe</span>
                      <span className="text-green-600 font-medium">&lt; 5,000 PPM</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Warning</span>
                      <span className="text-orange-600 font-medium">10,000 PPM</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Danger</span>
                      <span className="text-red-600 font-medium">&gt; 12,500 PPM</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* CO Trends */}
            <Card title="Carbon Monoxide (CO) Levels" description={`Statistics for last ${timeRange} hours`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-stone-50 rounded-lg">
                  <div>
                    <p className="text-sm text-stone-500">Current</p>
                    <p className={`text-2xl font-bold ${getGasLevelStatus(stats.co.current, 'co').color}`}>
                      {Math.round(stats.co.current)} PPM
                    </p>
                  </div>
                  <Wind className={`w-12 h-12 ${getGasLevelStatus(stats.co.current, 'co').color}`} />
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-stone-500">Average</p>
                    <p className="text-lg font-bold text-blue-600">{Math.round(stats.co.avg)}</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="text-xs text-stone-500">Max</p>
                    <p className="text-lg font-bold text-red-600">{Math.round(stats.co.max)}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-xs text-stone-500">Min</p>
                    <p className="text-lg font-bold text-green-600">{Math.round(stats.co.min)}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-stone-200">
                  <h4 className="text-sm font-medium text-stone-700 mb-2">OSHA Standards</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-stone-600">Safe</span>
                      <span className="text-green-600 font-medium">&lt; 25 PPM</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Warning</span>
                      <span className="text-orange-600 font-medium">35 PPM</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Danger</span>
                      <span className="text-red-600 font-medium">&gt; 50 PPM</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Live Sensor Readings */}
        <Card title="Live Sensor Readings" description="Real-time data from all active sensors">
          {latestReadings.length === 0 ? (
            <div className="text-center py-12 text-stone-500">
              <Wind className="w-12 h-12 mx-auto mb-4 text-stone-300" />
              <p>No sensor data available</p>
              <p className="text-sm mt-2">Waiting for sensor readings...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {latestReadings.map((reading) => (
                <div
                  key={reading.id}
                  className={`p-4 rounded-xl border-2 ${
                    reading.severity === 'critical'
                      ? 'bg-red-50 border-red-200'
                      : reading.severity === 'high'
                      ? 'bg-orange-50 border-orange-200'
                      : reading.severity === 'medium'
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-green-50 border-green-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-stone-500" />
                        <span className="font-medium text-stone-900">
                          {reading.zone_name || reading.gate_name || reading.mine_name}
                        </span>
                      </div>
                      {reading.sensor_id && (
                        <p className="text-xs text-stone-500 mt-1">Sensor {reading.sensor_id}</p>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityBadge(reading.severity)}`}>
                      {reading.severity.toUpperCase()}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Methane */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Flame className="w-4 h-4 text-orange-500" />
                        <span className="text-sm text-stone-600">CH₄</span>
                      </div>
                      <span className={`font-bold ${getGasLevelStatus(reading.methane_ppm, 'methane').color}`}>
                        {Math.round(reading.methane_ppm)} PPM
                      </span>
                    </div>

                    {/* CO */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wind className="w-4 h-4 text-cyan-500" />
                        <span className="text-sm text-stone-600">CO</span>
                      </div>
                      <span className={`font-bold ${getGasLevelStatus(reading.co_ppm, 'co').color}`}>
                        {Math.round(reading.co_ppm)} PPM
                      </span>
                    </div>

                    {/* Environmental Data */}
                    <div className="pt-3 border-t border-stone-200 grid grid-cols-2 gap-2 text-xs">
                      {reading.temperature_c !== undefined && (
                        <div className="flex items-center gap-1">
                          <ThermometerSun className="w-3 h-3 text-stone-400" />
                          <span className="text-stone-600">{reading.temperature_c.toFixed(1)}°C</span>
                        </div>
                      )}
                      {reading.humidity !== undefined && (
                        <div className="flex items-center gap-1">
                          <Droplets className="w-3 h-3 text-stone-400" />
                          <span className="text-stone-600">{reading.humidity.toFixed(0)}%</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Gauge className="w-3 h-3 text-stone-400" />
                        <span className="text-stone-600">{reading.pressure_hpa.toFixed(0)} hPa</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Mountain className="w-3 h-3 text-stone-400" />
                        <span className="text-stone-600">{reading.altitude_m.toFixed(1)} m</span>
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="text-xs text-stone-400 text-right">
                      {new Date(reading.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Safety Information */}
        <Card title="Safety Guidelines" description="Emergency procedures and contact information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-stone-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Emergency Response
              </h4>
              <ul className="space-y-2 text-sm text-stone-600">
                <li className="flex items-start gap-2">
                  <span className="text-red-600">•</span>
                  <span>If gas levels exceed danger thresholds, evacuate immediately</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-600">•</span>
                  <span>Alert shift incharge and safety officer</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-600">•</span>
                  <span>Do not re-enter until levels return to safe limits</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-600">•</span>
                  <span>Report all gas alerts to management</span>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-stone-900 mb-3 flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-600" />
                Prevention Measures
              </h4>
              <ul className="space-y-2 text-sm text-stone-600">
                <li className="flex items-start gap-2">
                  <span className="text-green-600">•</span>
                  <span>Ensure proper ventilation in all zones</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600">•</span>
                  <span>Regular sensor calibration and maintenance</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600">•</span>
                  <span>Monitor readings continuously during shifts</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600">•</span>
                  <span>Report any unusual odors or symptoms immediately</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
