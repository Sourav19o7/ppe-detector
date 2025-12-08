'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Users, Plus, Search, Edit2, Trash2, Camera as CameraIcon,
  CheckCircle, XCircle, X, Upload, RefreshCw, UserPlus
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Card } from '@/components/Card';
import { Spinner, LoadingOverlay } from '@/components/Loading';
import { employeeApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { Employee } from '@/types';

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Employee | null>(null);
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<Employee | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    worker_id: '',
    department: '',
  });
  const [faceImage, setFaceImage] = useState<File | null>(null);
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadWorkers();
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadWorkers();
    }, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  const loadWorkers = async () => {
    try {
      setIsLoading(true);
      const data = await employeeApi.list(0, 50, search || undefined);
      setWorkers(data.employees);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load workers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingWorker(null);
    setFormData({ name: '', worker_id: '', department: '' });
    setFaceImage(null);
    setFacePreview(null);
    setModalError(null);
    setShowModal(true);
  };

  const openEditModal = (worker: Employee) => {
    setEditingWorker(worker);
    setFormData({
      name: worker.name,
      worker_id: worker.employee_id,
      department: worker.department || '',
    });
    setFaceImage(null);
    setFacePreview(null);
    setShowModal(true);
  };

  const openFaceModal = (worker: Employee) => {
    setSelectedWorker(worker);
    setFaceImage(null);
    setFacePreview(null);
    setShowFaceModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFaceImage(file);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setFacePreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const [modalError, setModalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);

    try {
      if (editingWorker) {
        await employeeApi.update(
          editingWorker.employee_id,
          formData.name,
          formData.department || undefined
        );
        setMessage({ type: 'success', text: 'Worker updated successfully' });
      } else {
        await employeeApi.create(
          formData.name,
          formData.worker_id,
          formData.department || undefined,
          faceImage || undefined
        );
        setMessage({ type: 'success', text: 'Worker registered successfully' });
      }
      setShowModal(false);
      loadWorkers();
    } catch (err: unknown) {
      console.error('Registration error:', err);
      const error = err as { response?: { data?: { detail?: string }; status?: number }; message?: string };
      let errorMessage = 'Failed to register worker. Please try again.';

      if (error.response?.status === 401) {
        errorMessage = 'Session expired. Please login again.';
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }

      setModalError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterFace = async () => {
    if (!selectedWorker || !faceImage) return;

    setIsSubmitting(true);
    setMessage(null);

    try {
      await employeeApi.registerFace(selectedWorker.employee_id, faceImage);
      setMessage({ type: 'success', text: 'Face registered successfully' });
      setShowFaceModal(false);
      loadWorkers();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to register face',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (worker: Employee) => {
    if (!confirm(`Are you sure you want to delete ${worker.name}?`)) return;

    try {
      await employeeApi.delete(worker.employee_id);
      setMessage({ type: 'success', text: 'Worker deleted successfully' });
      loadWorkers();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to delete worker',
      });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Workers</h1>
            <p className="text-gray-500 mt-1">Register workers and manage their face recognition</p>
          </div>
          <button
            onClick={openAddModal}
            className="btn btn-primary flex items-center gap-2"
          >
            <UserPlus size={18} />
            Register Worker
          </button>
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

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-[#1a237e]/10 rounded-lg">
                <UserPlus className="text-[#1a237e]" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Register New Worker</h3>
                <p className="text-sm text-gray-500">Add a new worker with face recognition</p>
              </div>
              <button
                onClick={openAddModal}
                className="btn btn-primary"
              >
                Register
              </button>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Users className="text-green-600" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Total Workers</h3>
                <p className="text-sm text-gray-500">{total} registered workers</p>
              </div>
              <div className="text-2xl font-bold text-[#1a237e]">{total}</div>
            </div>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, ID, or department..."
                className="w-full pl-10"
              />
            </div>
            <button
              onClick={loadWorkers}
              className="btn btn-secondary flex items-center gap-2"
            >
              <RefreshCw size={18} />
              Refresh
            </button>
          </div>
        </Card>

        {/* Workers Table */}
        <Card title="Registered Workers">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Worker ID</th>
                  <th>Department</th>
                  <th>Face Status</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12">
                      <Spinner size="md" />
                    </td>
                  </tr>
                ) : workers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-500 py-12">
                      <div className="flex flex-col items-center gap-3">
                        <Users className="text-gray-300" size={48} />
                        <p>{search ? 'No workers found matching your search' : 'No workers registered yet'}</p>
                        {!search && (
                          <button onClick={openAddModal} className="btn btn-primary mt-2">
                            <UserPlus size={18} className="mr-2" />
                            Register First Worker
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  workers.map((worker) => (
                    <tr key={worker.id}>
                      <td className="font-medium">{worker.name}</td>
                      <td>{worker.employee_id}</td>
                      <td>{worker.department || '-'}</td>
                      <td>
                        {worker.face_registered ? (
                          <span className="badge badge-success">Registered</span>
                        ) : (
                          <span className="badge badge-warning">Not Registered</span>
                        )}
                      </td>
                      <td className="text-gray-500">{formatDate(worker.created_at)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openFaceModal(worker)}
                            className="p-2 text-[#1a237e] hover:bg-[#1a237e]/10 rounded-lg transition-colors"
                            title="Register/Update Face"
                          >
                            <CameraIcon size={18} />
                          </button>
                          <button
                            onClick={() => openEditModal(worker)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(worker)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {workers.length > 0 && (
            <div className="mt-4 text-sm text-gray-500">
              Showing {workers.length} of {total} workers
            </div>
          )}
        </Card>
      </div>

      {/* Add/Edit Worker Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md my-8 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-semibold">
                {editingWorker ? 'Edit Worker' : 'Register New Worker'}
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
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter worker's full name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Worker ID *
                </label>
                <input
                  type="text"
                  value={formData.worker_id}
                  onChange={(e) => setFormData({ ...formData, worker_id: e.target.value })}
                  placeholder="e.g., WRK001"
                  disabled={!!editingWorker}
                  required
                />
                {!editingWorker && (
                  <p className="text-xs text-gray-500 mt-1">Unique identifier for the worker</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="e.g., Construction, Warehouse"
                />
              </div>

              {!editingWorker && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Face Photo
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#1a237e]/30 rounded-lg p-6 text-center cursor-pointer hover:border-[#1a237e]/50 hover:bg-[#1a237e]/5 transition-colors"
                  >
                    {facePreview ? (
                      <img
                        src={facePreview}
                        alt="Preview"
                        className="w-32 h-32 object-cover rounded-lg mx-auto"
                      />
                    ) : (
                      <>
                        <CameraIcon className="mx-auto text-[#1a237e]/50 mb-2" size={40} />
                        <p className="text-sm text-gray-600">Click to upload face photo</p>
                        <p className="text-xs text-gray-400 mt-1">Required for attendance recognition</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              )}

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
                  {editingWorker ? 'Update' : 'Register Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Register Face Modal */}
      {showFaceModal && selectedWorker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md my-8 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold">Register Face</h2>
                <p className="text-sm text-gray-500">{selectedWorker.name}</p>
              </div>
              <button
                onClick={() => setShowFaceModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                Upload a clear photo of the worker's face. This will be used for attendance recognition.
              </p>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#1a237e]/30 rounded-lg p-8 text-center cursor-pointer hover:border-[#1a237e]/50 hover:bg-[#1a237e]/5 transition-colors"
              >
                {facePreview ? (
                  <img
                    src={facePreview}
                    alt="Preview"
                    className="w-48 h-48 object-cover rounded-lg mx-auto"
                  />
                ) : (
                  <>
                    <CameraIcon className="mx-auto text-[#1a237e]/50 mb-2" size={48} />
                    <p className="text-gray-600">Click to upload face photo</p>
                    <p className="text-sm text-gray-400 mt-1">Make sure face is clearly visible</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setShowFaceModal(false)}
                  className="flex-1 btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRegisterFace}
                  disabled={!faceImage || isSubmitting}
                  className="flex-1 btn btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting && <Spinner size="sm" className="border-white/30 border-t-white" />}
                  Register Face
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSubmitting && <LoadingOverlay message="Processing..." />}
    </AppLayout>
  );
}
