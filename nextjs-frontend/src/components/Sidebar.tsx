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
  ShieldCheck,
  Siren,
  UserCog,
  ClipboardCheck,
  BarChart3,
  ShieldAlert,
  Gauge,
  BadgeCheck,
  PanelLeftClose,
  PanelLeft,
  Pickaxe,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuthStore, getNavigationForRole, useSidebarStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';

// Icon mapping with better, more descriptive icons
const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  LayoutDashboard: Gauge,
  Users: UserCog,
  HardHat: HardHat,
  Mountain: Pickaxe,
  DoorOpen: DoorOpen,
  Bell: Bell,
  FileText: ClipboardCheck,
  Shield: ShieldAlert,
  TrendingUp: BarChart3,
  AlertTriangle: AlertTriangle,
  Clock: Clock,
  Settings: Settings,
  User: User,
  AlertCircle: Siren,
  GraduationCap: BadgeCheck,
};

// Role display names and colors
const roleConfig: Record<UserRole, { label: string; color: string; bgColor: string }> = {
  super_admin: { label: 'Super Admin', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  general_manager: { label: 'General Manager', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  area_safety_officer: { label: 'Area Safety Officer', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  manager: { label: 'Manager', color: 'text-lime-700', bgColor: 'bg-lime-100' },
  safety_officer: { label: 'Safety Officer', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  shift_incharge: { label: 'Shift Incharge', color: 'text-cyan-700', bgColor: 'bg-cyan-100' },
  worker: { label: 'Worker', color: 'text-stone-700', bgColor: 'bg-stone-100' },
};

export default function Sidebar() {
  const pathname = usePathname();
  const { logout, user, worker, userType, getRole } = useAuthStore();
  const { isCollapsed, toggle } = useSidebarStore();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const role = getRole();
  const navItems = getNavigationForRole(role);
  const displayName = userType === 'worker' ? worker?.name : user?.full_name;
  const roleInfo = role ? roleConfig[role] : null;

  // Handle Ctrl+B keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2.5 bg-white text-orange-600 rounded-xl shadow-lg border border-stone-200"
      >
        {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-full z-40 transition-all duration-300 ease-in-out',
          'lg:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          'bg-white border-r border-gray-100 shadow-sm',
          isCollapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo & Collapse Button */}
          <div className={cn(
            'border-b border-gray-100 flex items-center justify-between flex-shrink-0',
            isCollapsed ? 'p-3' : 'px-5 py-4'
          )}>
            <div className={cn('flex items-center gap-3', isCollapsed && 'justify-center w-full')}>
              <div className={cn(
                'rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-md',
                isCollapsed ? 'w-11 h-11' : 'w-11 h-11'
              )}>
                <ShieldCheck className="text-white w-6 h-6" />
              </div>
              {!isCollapsed && (
                <div>
                  <h1 className="text-lg font-bold text-stone-700">Kavach</h1>
                  <p className="text-xs text-stone-400">Mine Safety System</p>
                </div>
              )}
            </div>
            {!isCollapsed && (
              <button
                onClick={toggle}
                className="hidden lg:flex p-1.5 text-stone-300 hover:text-stone-500 hover:bg-gray-50 rounded-lg transition-colors"
                title="Collapse sidebar (Ctrl+B)"
              >
                <PanelLeftClose size={18} />
              </button>
            )}
          </div>

          {/* Expand button when collapsed */}
          {isCollapsed && (
            <button
              onClick={toggle}
              className="hidden lg:flex mx-auto mt-3 p-1.5 text-stone-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
              title="Expand sidebar (Ctrl+B)"
            >
              <PanelLeft size={18} />
            </button>
          )}

          {/* Role Badge */}
          {!isCollapsed && roleInfo && (
            <div className="px-5 py-2.5 flex-shrink-0">
              <div className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold',
                roleInfo.bgColor, roleInfo.color
              )}>
                <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
                {roleInfo.label}
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className={cn('flex-1 py-2', isCollapsed ? 'px-2' : 'px-3')}>
            <ul className="space-y-0.5">
              {navItems.map((item) => {
                const Icon = iconMap[item.icon] || Gauge;
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setIsMobileOpen(false)}
                      title={isCollapsed ? item.name : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg transition-all duration-200',
                        isCollapsed ? 'px-3 py-2.5 justify-center' : 'px-3 py-2.5',
                        isActive
                          ? 'bg-gradient-to-r from-orange-400 to-amber-400 text-white shadow-sm'
                          : 'text-stone-500 hover:bg-gray-50 hover:text-stone-700'
                      )}
                    >
                      <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                      {!isCollapsed && (
                        <span className="text-sm font-medium">{item.name}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Quick Actions for specific roles */}
          {!isCollapsed && role === 'shift_incharge' && (
            <div className="px-3 py-3 border-t border-gray-100 flex-shrink-0">
              <button className="w-full py-2.5 bg-gradient-to-r from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm">
                <Siren size={18} />
                Emergency Alert
              </button>
            </div>
          )}

          {!isCollapsed && role === 'worker' && (
            <div className="px-3 py-3 border-t border-gray-100 flex-shrink-0">
              <button className="w-full py-2.5 bg-gradient-to-r from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm">
                <Siren size={18} />
                SOS Alert
              </button>
            </div>
          )}

          {/* Collapsed quick action icons */}
          {isCollapsed && (role === 'shift_incharge' || role === 'worker') && (
            <div className="px-2 py-3 border-t border-gray-100 flex-shrink-0">
              <button
                className="w-full p-2.5 bg-red-400 hover:bg-red-500 text-white rounded-lg flex items-center justify-center transition-all"
                title={role === 'worker' ? 'SOS Alert' : 'Emergency Alert'}
              >
                <Siren size={18} />
              </button>
            </div>
          )}

          {/* User section */}
          <div className={cn(
            'border-t border-gray-100 bg-gray-50/30 flex-shrink-0',
            isCollapsed ? 'p-2' : 'p-3'
          )}>
            {isCollapsed ? (
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <User size={18} className="text-stone-400" />
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 text-stone-300 hover:text-red-400 hover:bg-red-50/50 rounded-lg transition-all"
                  title="Logout"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0">
                  <User size={20} className="text-stone-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-700 truncate text-sm">{displayName || 'User'}</p>
                  {userType === 'worker' && worker && (
                    <p className="text-xs text-stone-400">ID: {worker.employee_id}</p>
                  )}
                  {userType === 'staff' && user && (
                    <p className="text-xs text-stone-400">{user.username}</p>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-stone-300 hover:text-red-400 hover:bg-red-50/50 rounded-lg transition-all flex-shrink-0"
                  title="Logout"
                >
                  <LogOut size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
