'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { HardHat, UserCog, ShieldCheck, Loader2, AlertCircle, KeyRound, User } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='m36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}></div>
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl mb-5 shadow-xl">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-stone-800 mb-3">Kavach</h1>
          <p className="text-stone-500 text-lg">Mine Safety & PPE Compliance System</p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-stone-200 rounded-2xl shadow-xl p-8">
          {/* Mode Toggle */}
          <div className="flex bg-stone-100 rounded-xl p-1.5 mb-8">
            <button
              type="button"
              onClick={() => {
                setMode('staff');
                setError('');
              }}
              className={`flex-1 flex items-center justify-center gap-3 py-3.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'staff'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <UserCog size={22} />
              Staff Login
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('worker');
                setError('');
              }}
              className={`flex-1 flex items-center justify-center gap-3 py-3.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'worker'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-md'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <HardHat size={22} />
              Worker Login
            </button>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {mode === 'staff' ? (
              <div>
                <label htmlFor="username" className="block text-sm font-semibold text-stone-700 mb-2">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={22} />
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className="w-full pl-12"
                    required
                  />
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor="employeeId" className="block text-sm font-semibold text-stone-700 mb-2">
                  Employee ID
                </label>
                <div className="relative">
                  <HardHat className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={22} />
                  <input
                    type="text"
                    id="employeeId"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="Enter your Employee ID (e.g., W001)"
                    className="w-full pl-12"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-stone-700 mb-2">
                Password
              </label>
              <div className="relative">
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={22} />
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-12"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3.5 rounded-xl text-sm flex items-center gap-3">
                <AlertCircle size={22} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary py-4 text-base"
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>Sign In</>
              )}
            </button>
          </form>

          {/* Help Text */}
          <div className="mt-8 pt-6 border-t border-stone-100">
            <p className="text-center text-sm text-stone-500">
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
        <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-5 shadow-lg">
          <h3 className="text-stone-700 font-semibold mb-4 text-center">Demo Credentials</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {mode === 'staff' ? (
              <>
                <div className="bg-stone-50 rounded-xl p-3">
                  <p className="text-orange-600 font-semibold">Super Admin</p>
                  <p className="text-stone-600 mt-1">superadmin / admin123</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3">
                  <p className="text-orange-600 font-semibold">General Manager</p>
                  <p className="text-stone-600 mt-1">gm / gm123</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3">
                  <p className="text-orange-600 font-semibold">Area Safety Officer</p>
                  <p className="text-stone-600 mt-1">aso / aso123</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3">
                  <p className="text-orange-600 font-semibold">Manager</p>
                  <p className="text-stone-600 mt-1">manager1 / manager123</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3">
                  <p className="text-orange-600 font-semibold">Safety Officer</p>
                  <p className="text-stone-600 mt-1">safety1 / safety123</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3">
                  <p className="text-orange-600 font-semibold">Shift Incharge</p>
                  <p className="text-stone-600 mt-1">shift_day1 / shift123</p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-stone-50 rounded-xl p-3">
                  <p className="text-amber-600 font-semibold">Worker (Mine 1)</p>
                  <p className="text-stone-600 mt-1">W001 / worker123</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3">
                  <p className="text-amber-600 font-semibold">Worker (Mine 2)</p>
                  <p className="text-stone-600 mt-1">W101 / worker123</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-stone-400 text-sm mt-6">
          Kavach - Mine Safety System v2.0
        </p>
      </div>
    </div>
  );
}
