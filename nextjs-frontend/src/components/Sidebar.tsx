'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  HardHat,
  Mountain,
  DoorOpen,
  Bell,
  FileText,
  Shield,
  TrendingUp,
  AlertTriangle,
  Clock,
  Settings,
  User,
  AlertCircle,
  GraduationCap,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore, getNavigationForRole } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  LayoutDashboard,
  Users,
  HardHat,
  Mountain,
  DoorOpen,
  Bell,
  FileText,
  Shield,
  TrendingUp,
  AlertTriangle,
  Clock,
  Settings,
  User,
  AlertCircle,
  GraduationCap,
};

// Role display names and colors
const roleConfig: Record<UserRole, { label: string; color: string; bgColor: string }> = {
  super_admin: { label: 'Super Admin', color: 'text-purple-300', bgColor: 'bg-purple-500/20' },
  general_manager: { label: 'General Manager', color: 'text-blue-300', bgColor: 'bg-blue-500/20' },
  area_safety_officer: { label: 'Area Safety Officer', color: 'text-cyan-300', bgColor: 'bg-cyan-500/20' },
  manager: { label: 'Manager', color: 'text-green-300', bgColor: 'bg-green-500/20' },
  safety_officer: { label: 'Safety Officer', color: 'text-yellow-300', bgColor: 'bg-yellow-500/20' },
  shift_incharge: { label: 'Shift Incharge', color: 'text-orange-300', bgColor: 'bg-orange-500/20' },
  worker: { label: 'Worker', color: 'text-gray-300', bgColor: 'bg-gray-500/20' },
};

export default function Sidebar() {
  const pathname = usePathname();
  const { logout, user, worker, userType, getRole } = useAuthStore();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const role = getRole();
  const navItems = getNavigationForRole(role);
  const displayName = userType === 'worker' ? worker?.name : user?.full_name;
  const roleInfo = role ? roleConfig[role] : null;

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  // Determine sidebar color based on role
  const getSidebarColor = () => {
    if (userType === 'worker') return 'bg-gradient-to-b from-orange-800 to-orange-900';
    return 'bg-gradient-to-b from-[#1a237e] to-[#0d1542]';
  };

  const getAccentColor = () => {
    if (userType === 'worker') return 'bg-orange-700';
    return 'bg-[#283593]';
  };

  const getBorderColor = () => {
    if (userType === 'worker') return 'border-orange-700';
    return 'border-[#283593]';
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className={cn(
          'lg:hidden fixed top-4 left-4 z-50 p-2 text-white rounded-lg',
          userType === 'worker' ? 'bg-orange-600' : 'bg-[#1a237e]'
        )}
      >
        {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-full w-64 text-white z-40 transition-transform duration-300',
          'lg:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full',
          getSidebarColor()
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo & Role Badge */}
          <div className={cn('p-6 border-b', getBorderColor())}>
            <div className="flex items-center gap-3 mb-3">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center',
                userType === 'worker' ? 'bg-orange-600' : 'bg-blue-600'
              )}>
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Mine Safety</h1>
                <p className="text-xs text-blue-200/70">v2.0</p>
              </div>
            </div>
            {roleInfo && (
              <div className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
                roleInfo.bgColor, roleInfo.color
              )}>
                <span className="w-2 h-2 rounded-full bg-current"></span>
                {roleInfo.label}
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 overflow-y-auto">
            <ul className="space-y-1 px-3">
              {navItems.map((item) => {
                const Icon = iconMap[item.icon] || LayoutDashboard;
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setIsMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-lg transition-all',
                        isActive
                          ? cn(getAccentColor(), 'text-white shadow-lg')
                          : 'text-blue-100/80 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <Icon size={20} />
                      <span className="text-sm font-medium">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Quick Actions for specific roles */}
          {role === 'shift_incharge' && (
            <div className={cn('px-4 py-3 border-t', getBorderColor())}>
              <button className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                <AlertTriangle size={16} />
                Emergency Alert
              </button>
            </div>
          )}

          {role === 'worker' && (
            <div className={cn('px-4 py-3 border-t', getBorderColor())}>
              <button className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                <AlertCircle size={16} />
                SOS Alert
              </button>
            </div>
          )}

          {/* User section */}
          <div className={cn('p-4 border-t', getBorderColor())}>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-blue-200/70 mb-0.5">Logged in as</p>
                <p className="font-medium text-sm truncate">{displayName || 'User'}</p>
                {userType === 'worker' && worker && (
                  <p className="text-xs text-blue-200/70">ID: {worker.employee_id}</p>
                )}
              </div>
              <button
                onClick={handleLogout}
                className={cn(
                  'p-2 text-blue-200 hover:text-white rounded-lg transition-colors',
                  userType === 'worker' ? 'hover:bg-orange-700' : 'hover:bg-[#283593]'
                )}
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
