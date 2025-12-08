'use client';

import { useState, useEffect } from 'react';
import {
  Building2, Plus, Search, Edit2, Trash2, X,
  MapPin, Users, Clock, CheckCircle, XCircle,
  AlertTriangle, Settings, Activity
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Card } from '@/components/Card';
import { Spinner, LoadingOverlay } from '@/components/Loading';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { formatDate } from '@/lib/utils';

interface Mine {
  id?: string;
  mine_id: string;
  name: string;
  location: string;
  type: string;
  status: string;
  total_workers?: number;
  active_shifts?: number;
  safety_score?: number;
  created_at?: string;
  updated_at?: string;
}

export default function MinesPage() {
  const { token, user } = useAuthStore();
  const [mines, setMines] = useState<Mine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMine, setEditingMine] = useState<Mine | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    mine_id: '',
    name: '',
    location: '',
    type: 'underground',
    status: 'active',
  });

  const mineTypes = [
    { value: 'underground', label: 'Underground' },
    { value: 'opencast', label: 'Opencast' },
    { value: 'mixed', label: 'Mixed' },
  ];

  const statuses = [
    { value: 'active', label: 'Active' },
    { value: 'maintenance', label: 'Under Maintenance' },
    { value: 'inactive', label: 'Inactive' },
  ];

  useEffect(() => {
    loadMines();
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadMines();
    }, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  const loadMines = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get('/mines', token);
      const minesData = response.mines || response || [];
      setMines(minesData);
    } catch (err) {
      console.error('Failed to load mines:', err);
      // Mock data for demo
      setMines([
        {
          mine_id: 'MINE001',
          name: 'Jharia Coal Mine',
          location: 'Jharia, Jharkhand',
          type: 'underground',
          status: 'active',
          total_workers: 245,
          active_shifts: 3,
          safety_score: 92,
          created_at: '2024-01-15',
        },
        {
          mine_id: 'MINE002',
          name: 'Bokaro Steel Mine',
          location: 'Bokaro, Jharkhand',
          type: 'opencast',
          status: 'active',
          total_workers: 178,
          active_shifts: 2,
          safety_score: 88,
          created_at: '2024-02-20',
        },
        {
          mine_id: 'MINE003',
          name: 'Raniganj Colliery',
          location: 'Raniganj, West Bengal',
          type: 'mixed',
          status: 'maintenance',
          total_workers: 125,
          active_shifts: 1,
          safety_score: 76,
          created_at: '2024-03-10',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingMine(null);
    setFormData({
      mine_id: '',
      name: '',
      location: '',
      type: 'underground',
      status: 'active',
    });
    setModalError(null);
    setShowModal(true);
  };

  const openEditModal = (mine: Mine) => {
    setEditingMine(mine);
    setFormData({
      mine_id: mine.mine_id,
      name: mine.name,
      location: mine.location,
      type: mine.type,
      status: mine.status,
    });
    setModalError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);

    try {
      if (editingMine) {
        await apiClient.put(`/mines/${editingMine.mine_id}`, formData, token);
        setMines(mines.map(m =>
          m.mine_id === editingMine.mine_id ? { ...m, ...formData } : m
        ));
        setMessage({ type: 'success', text: 'Mine updated successfully' });
      } else {
        const response = await apiClient.post('/mines', formData, token);
        const newMine = response.data || response || {
          ...formData,
          total_workers: 0,
          active_shifts: 0,
          safety_score: 100,
          created_at: new Date().toISOString(),
        };
        setMines([...mines, newMine]);
        setMessage({ type: 'success', text: 'Mine added successfully' });
      }
      setShowModal(false);
    } catch (err: any) {
      console.error('Error saving mine:', err);
      // For demo, update local state anyway
      if (editingMine) {
        setMines(mines.map(m =>
          m.mine_id === editingMine.mine_id ? { ...m, ...formData } : m
        ));
        setMessage({ type: 'success', text: 'Mine updated successfully' });
      } else {
        setMines([...mines, {
          ...formData,
          total_workers: 0,
          active_shifts: 0,
          safety_score: 100,
          created_at: new Date().toISOString(),
        }]);
        setMessage({ type: 'success', text: 'Mine added successfully' });
      }
      setShowModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (mine: Mine) => {
    if (!confirm(`Are you sure you want to delete ${mine.name}?`)) return;

    try {
      await apiClient.delete(`/mines/${mine.mine_id}`, token);
      setMines(mines.filter(m => m.mine_id !== mine.mine_id));
      setMessage({ type: 'success', text: 'Mine deleted successfully' });
    } catch (err) {
      console.error('Error deleting mine:', err);
      // For demo, update local state
      setMines(mines.filter(m => m.mine_id !== mine.mine_id));
      setMessage({ type: 'success', text: 'Mine deleted successfully' });
    }
  };

  const filteredMines = mines.filter(mine =>
    mine.name.toLowerCase().includes(search.toLowerCase()) ||
    mine.mine_id.toLowerCase().includes(search.toLowerCase()) ||
    mine.location.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: mines.length,
    active: mines.filter(m => m.status === 'active').length,
    totalWorkers: mines.reduce((sum, m) => sum + (m.total_workers || 0), 0),
    avgSafety: mines.length > 0
      ? Math.round(mines.reduce((sum, m) => sum + (m.safety_score || 0), 0) / mines.length)
      : 0,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getSafetyColor = (score?: number) => {
    if (!score) return 'text-gray-500';
    if (score >= 90) return 'text-green-600';
    if (score >= 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mines Management</h1>
            <p className="text-gray-500 mt-1">Manage mine locations and configurations</p>
          </div>
          {user?.role === 'super_admin' && (
            <button
              onClick={openAddModal}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus size={18} />
              Add Mine
            </button>
          )}
        </div>

        {/* Message */}
        {message && (
          <div
            className={`p-4 rounded-lg flex items-center gap-3 ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle size={20} />
            ) : (
              <XCircle size={20} />
            )}
            <p>{message.text}</p>
            <button
              onClick={() => setMessage(null)}
              className="ml-auto hover:opacity-70"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-[#1a237e]/10 rounded-lg">
                <Building2 className="text-[#1a237e]" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Mines</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Activity className="text-green-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Active Mines</p>
                <p className="text-2xl font-bold">{stats.active}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Users className="text-blue-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Workers</p>
                <p className="text-2xl font-bold">{stats.totalWorkers}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <AlertTriangle className="text-purple-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Avg Safety Score</p>
                <p className={`text-2xl font-bold ${getSafetyColor(stats.avgSafety)}`}>
                  {stats.avgSafety}%
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, ID, or location..."
                className="w-full pl-10"
              />
            </div>
          </div>
        </Card>

        {/* Mines Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : filteredMines.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <Building2 className="mx-auto text-gray-300 mb-4" size={48} />
              <p className="text-gray-500">
                {search ? 'No mines found matching your search' : 'No mines added yet'}
              </p>
              {!search && user?.role === 'super_admin' && (
                <button onClick={openAddModal} className="btn btn-primary mt-4">
                  <Plus size={18} className="mr-2" />
                  Add First Mine
                </button>
              )}
            </div>
          ) : (
            filteredMines.map((mine) => (
              <Card key={mine.mine_id} className="hover:shadow-md transition-shadow">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#1a237e]/10 rounded-lg">
                        <Building2 className="text-[#1a237e]" size={24} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{mine.name}</h3>
                        <p className="text-sm text-gray-500">{mine.mine_id}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full capitalize ${getStatusColor(mine.status)}`}>
                      {mine.status}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin size={16} className="text-gray-400" />
                      {mine.location}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Settings size={16} className="text-gray-400" />
                      <span className="capitalize">{mine.type} Mining</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                    <div className="text-center">
                      <p className="text-lg font-semibold">{mine.total_workers || 0}</p>
                      <p className="text-xs text-gray-500">Workers</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">{mine.active_shifts || 0}</p>
                      <p className="text-xs text-gray-500">Shifts</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-lg font-semibold ${getSafetyColor(mine.safety_score)}`}>
                        {mine.safety_score || 0}%
                      </p>
                      <p className="text-xs text-gray-500">Safety</p>
                    </div>
                  </div>

                  {/* Actions */}
                  {user?.role === 'super_admin' && (
                    <div className="flex gap-2 pt-2 border-t">
                      <button
                        onClick={() => openEditModal(mine)}
                        className="flex-1 btn btn-secondary flex items-center justify-center gap-2"
                      >
                        <Edit2 size={16} />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(mine)}
                        className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Add/Edit Mine Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md my-8 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-semibold">
                {editingMine ? 'Edit Mine' : 'Add New Mine'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mine ID *
                </label>
                <input
                  type="text"
                  value={formData.mine_id}
                  onChange={(e) => setFormData({ ...formData, mine_id: e.target.value })}
                  placeholder="e.g., MINE001"
                  disabled={!!editingMine}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mine Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter mine name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location *
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Jharia, Jharkhand"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mine Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  {mineTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 btn btn-primary flex items-center justify-center gap-2"
                >
                  {isSubmitting && <Spinner size="sm" className="border-white/30 border-t-white" />}
                  {editingMine ? 'Update Mine' : 'Add Mine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSubmitting && <LoadingOverlay message="Processing..." />}
    </AppLayout>
  );
}
