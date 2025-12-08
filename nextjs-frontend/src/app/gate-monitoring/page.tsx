'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  DoorOpen,
  Camera as CameraIcon,
  RefreshCw,
  UserCheck,
  UserX,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Shield,
  Clock,
  Users,
  Play,
  Pause,
  Volume2,
  VolumeX,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Card, StatCard } from '@/components/Card';
import { Spinner } from '@/components/Loading';
import CameraCapture from '@/components/Camera';
import { gateEntryApi, mineApi, alertApi } from '@/lib/api';
import { formatTime } from '@/lib/utils';
import { useAuthStore } from '@/lib/store';
import type { GateEntry, Gate, Mine, LiveEntriesResponse } from '@/types';

export default function GateMonitoringPage() {
  const { getMineId } = useAuthStore();
  const [liveData, setLiveData] = useState<LiveEntriesResponse | null>(null);
  const [mines, setMines] = useState<Mine[]>([]);
  const [selectedMine, setSelectedMine] = useState<string>('');
  const [selectedGate, setSelectedGate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState<{
    success: boolean;
    message: string;
    entry?: GateEntry;
  } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize mines and gates
  useEffect(() => {
    const initializeMines = async () => {
      try {
        const mineId = getMineId();
        const minesData = await mineApi.list({ is_active: true });
        setMines(minesData.mines);

        if (mineId && minesData.mines.find(m => m.id === mineId)) {
          setSelectedMine(mineId);
        } else if (minesData.mines.length > 0) {
          setSelectedMine(minesData.mines[0].id);
        }
      } catch (err) {
        console.error('Failed to load mines:', err);
      }
    };
    initializeMines();
  }, [getMineId]);

  // Load live data
  const loadLiveData = useCallback(async (showRefresh = false) => {
    if (!selectedMine) return;

    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);

      const params: { mine_id?: string; gate_id?: string; limit?: number } = {
        mine_id: selectedMine,
        limit: 20,
      };
      if (selectedGate) params.gate_id = selectedGate;

      const data = await gateEntryApi.getLive(params);
      setLiveData(data);
      setError(null);
    } catch (err) {
      setError('Failed to load live data');
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMine, selectedGate]);

  useEffect(() => {
    loadLiveData();
  }, [loadLiveData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => loadLiveData(true), 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadLiveData]);

  // Get gates for selected mine
  const selectedMineData = mines.find(m => m.id === selectedMine);
  const gates = selectedMineData?.gates || [];

  // Handle detection at gate
  const handleDetection = async (imageFile: File) => {
    if (!selectedGate) {
      setDetectionResult({
        success: false,
        message: 'Please select a gate first',
      });
      return;
    }

    try {
      setDetecting(true);
      const result = await gateEntryApi.detect(selectedGate, imageFile, 'entry');

      if (result.success) {
        // Play sound for violations
        if (result.violations?.length > 0 && soundEnabled && audioRef.current) {
          audioRef.current.play();
        }

        setDetectionResult({
          success: true,
          message: result.violations?.length > 0
            ? `Entry recorded with violations: ${result.violations.join(', ')}`
            : 'Entry recorded successfully - PPE compliant',
          entry: result.entry,
        });

        // Refresh data
        loadLiveData(true);
      } else {
        setDetectionResult({
          success: false,
          message: result.message || 'Detection failed',
        });
      }
    } catch (err: any) {
      setDetectionResult({
        success: false,
        message: err.response?.data?.detail || 'Detection failed',
      });
    } finally {
      setDetecting(false);
    }
  };

  // Handle entry override
  const handleOverride = async (entryId: string) => {
    const reason = window.prompt('Enter reason for override:');
    if (!reason) return;

    try {
      await gateEntryApi.override(entryId, reason);
      loadLiveData(true);
    } catch (err) {
      console.error('Override failed:', err);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Hidden audio element for alerts */}
        <audio ref={audioRef} src="/alert-sound.mp3" preload="auto" />

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gate Monitoring</h1>
            <p className="text-gray-500 mt-1">Real-time PPE detection and worker tracking</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-lg ${soundEnabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}
              title={soundEnabled ? 'Sound On' : 'Sound Off'}
            >
              {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                autoRefresh ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {autoRefresh ? <Play size={16} /> : <Pause size={16} />}
              <span className="text-sm font-medium">Auto-refresh</span>
            </button>
            <button
              onClick={() => loadLiveData(true)}
              disabled={refreshing}
              className="btn btn-secondary flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Mine</label>
            <select
              value={selectedMine}
              onChange={(e) => {
                setSelectedMine(e.target.value);
                setSelectedGate('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {mines.map((mine) => (
                <option key={mine.id} value={mine.id}>{mine.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Gate</label>
            <select
              value={selectedGate}
              onChange={(e) => setSelectedGate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Gates</option>
              {gates.map((gate) => (
                <option key={gate.id} value={gate.id}>{gate.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setShowCamera(!showCamera)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                showCamera
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <CameraIcon size={20} />
              {showCamera ? 'Close Camera' : 'Open Camera'}
            </button>
          </div>
        </div>

        {/* Stats */}
        {liveData && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              title="Entries"
              value={liveData.summary.total_entries}
              icon={<UserCheck size={24} />}
              color="green"
            />
            <StatCard
              title="Exits"
              value={liveData.summary.total_exits}
              icon={<UserX size={24} />}
              color="blue"
            />
            <StatCard
              title="Inside Now"
              value={liveData.summary.currently_inside}
              icon={<Users size={24} />}
              color="purple"
            />
            <StatCard
              title="Violations"
              value={liveData.summary.total_violations}
              icon={<AlertTriangle size={24} />}
              color="red"
            />
            <StatCard
              title="Compliance"
              value={`${liveData.summary.compliance_rate}%`}
              icon={<Shield size={24} />}
              color={liveData.summary.compliance_rate >= 90 ? 'green' : 'yellow'}
            />
          </div>
        )}

        {/* Camera Section */}
        {showCamera && selectedGate && (
          <Card title="Gate Camera" description="Capture image for PPE detection">
            <div className="space-y-4">
              <CameraCapture
                onCapture={handleDetection}
                disabled={detecting}
              />
              {detecting && (
                <div className="flex items-center justify-center gap-2 text-blue-600">
                  <Spinner size="sm" />
                  <span>Processing detection...</span>
                </div>
              )}
              {detectionResult && (
                <div className={`p-4 rounded-lg ${
                  detectionResult.success
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-center gap-2">
                    {detectionResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                    <span className={detectionResult.success ? 'text-green-700' : 'text-red-700'}>
                      {detectionResult.message}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {showCamera && !selectedGate && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Please select a specific gate to enable camera detection</span>
            </div>
          </div>
        )}

        {/* Live Entries Table */}
        <Card
          title="Live Gate Entries"
          description={`${liveData?.shift_name || 'Current Shift'} (${liveData?.shift_start || ''} - ${liveData?.shift_end || ''})`}
          action={
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="w-4 h-4" />
              <span>Updated: {new Date().toLocaleTimeString()}</span>
            </div>
          }
        >
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">{error}</div>
          ) : !liveData?.entries?.length ? (
            <div className="text-center py-12 text-gray-500">
              <DoorOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No entries recorded this shift</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Worker</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Gate</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">PPE Status</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {liveData.entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-gray-900">{entry.worker_name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{entry.employee_id || '-'}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {entry.gate_name || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          entry.entry_type === 'entry'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {entry.entry_type === 'entry' ? (
                            <>
                              <UserCheck size={12} />
                              Entry
                            </>
                          ) : (
                            <>
                              <UserX size={12} />
                              Exit
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          entry.status === 'approved'
                            ? 'bg-green-100 text-green-700'
                            : entry.status === 'override'
                            ? 'bg-yellow-100 text-yellow-700'
                            : entry.status === 'denied'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {entry.status === 'approved' && <CheckCircle size={12} />}
                          {entry.status === 'denied' && <XCircle size={12} />}
                          {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {entry.violations.length === 0 ? (
                          <span className="text-green-600 text-sm flex items-center gap-1">
                            <Shield size={14} />
                            Compliant
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {entry.violations.map((v, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                {v.replace('NO-', '')}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {formatTime(entry.timestamp)}
                      </td>
                      <td className="py-3 px-4">
                        {entry.status === 'denied' && (
                          <button
                            onClick={() => handleOverride(entry.id)}
                            className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 rounded"
                          >
                            Override
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
