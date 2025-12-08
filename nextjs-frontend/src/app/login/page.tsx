'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { HardHat, User, Shield, Loader2 } from 'lucide-react';

type LoginMode = 'staff' | 'worker';

export default function LoginPage() {
  const router = useRouter();
  const { setStaffAuth, setWorkerAuth } = useAuthStore();

  const [mode, setMode] = useState<LoginMode>('staff');
  const [username, setUsername] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'staff') {
        const response = await authApi.login(username, password);
        setStaffAuth(response.access_token, response.user);
      } else {
        const response = await authApi.workerLogin(employeeId, password);
        setWorkerAuth(response.access_token, response.worker);
      }
      router.push('/');
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { detail?: string } } };
      setError(errorObj?.response?.data?.detail || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Mine Safety System</h1>
          <p className="text-blue-200">PPE Detection & Compliance Management</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Mode Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('staff');
                setError('');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
                mode === 'staff'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <User className="w-4 h-4" />
              Staff Login
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('worker');
                setError('');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
                mode === 'worker'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <HardHat className="w-4 h-4" />
              Worker Login
            </button>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'staff' ? (
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            ) : (
              <div>
                <label htmlFor="employeeId" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Employee ID
                </label>
                <input
                  type="text"
                  id="employeeId"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="Enter your Employee ID (e.g., W001)"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className={`w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 transition-all ${
                  mode === 'staff' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                } focus:border-transparent`}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-all ${
                mode === 'staff'
                  ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
                  : 'bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400'
              } disabled:cursor-not-allowed`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>Sign In</>
              )}
            </button>
          </form>

          {/* Help Text */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-center text-sm text-gray-500">
              {mode === 'staff' ? (
                <>
                  Staff members use their assigned username and password.
                  <br />
                  Contact your administrator if you need access.
                </>
              ) : (
                <>
                  Workers use their Employee ID and password provided by their supervisor.
                  <br />
                  Need help? Contact your Shift Incharge.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Demo Credentials */}
        <div className="mt-6 bg-white/10 backdrop-blur-sm rounded-xl p-4">
          <h3 className="text-white font-medium mb-3 text-center">Demo Credentials</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {mode === 'staff' ? (
              <>
                <div className="bg-white/10 rounded-lg p-2.5">
                  <p className="text-blue-200 font-medium">Super Admin</p>
                  <p className="text-white">superadmin / admin123</p>
                </div>
                <div className="bg-white/10 rounded-lg p-2.5">
                  <p className="text-blue-200 font-medium">General Manager</p>
                  <p className="text-white">gm / gm123</p>
                </div>
                <div className="bg-white/10 rounded-lg p-2.5">
                  <p className="text-blue-200 font-medium">Area Safety Officer</p>
                  <p className="text-white">aso / aso123</p>
                </div>
                <div className="bg-white/10 rounded-lg p-2.5">
                  <p className="text-blue-200 font-medium">Manager</p>
                  <p className="text-white">manager1 / manager123</p>
                </div>
                <div className="bg-white/10 rounded-lg p-2.5">
                  <p className="text-blue-200 font-medium">Safety Officer</p>
                  <p className="text-white">safety1 / safety123</p>
                </div>
                <div className="bg-white/10 rounded-lg p-2.5">
                  <p className="text-blue-200 font-medium">Shift Incharge</p>
                  <p className="text-white">shift_day1 / shift123</p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-white/10 rounded-lg p-2.5">
                  <p className="text-orange-200 font-medium">Worker (Mine 1)</p>
                  <p className="text-white">W001 / worker123</p>
                </div>
                <div className="bg-white/10 rounded-lg p-2.5">
                  <p className="text-orange-200 font-medium">Worker (Mine 2)</p>
                  <p className="text-white">W101 / worker123</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-blue-200/60 text-sm mt-6">
          Mine Safety PPE Detection System v2.0
        </p>
      </div>
    </div>
  );
}
