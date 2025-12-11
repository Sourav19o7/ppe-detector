'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import AppLayout from '@/components/AppLayout';
import { PageLoading } from '@/components/Loading';

// Role-specific dashboard imports
import ShiftInchargeDashboard from '@/components/dashboards/ShiftInchargeDashboard';
import SafetyOfficerDashboard from '@/components/dashboards/SafetyOfficerDashboard';
import ManagerDashboard from '@/components/dashboards/ManagerDashboard';
import AreaSafetyOfficerDashboard from '@/components/dashboards/AreaSafetyOfficerDashboard';
import GeneralManagerDashboard from '@/components/dashboards/GeneralManagerDashboard';
import WorkerDashboard from '@/components/dashboards/WorkerDashboard';
import SuperAdminDashboard from '@/components/dashboards/SuperAdminDashboard';

export default function DashboardPage() {
  const { getRole, isAuthenticated, userType } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Wait for component mount
  if (!mounted) {
    return (
      <AppLayout>
        <PageLoading />
      </AppLayout>
    );
  }

  const role = getRole();

  // If role is null after hydration, show loading (auth might still be processing)
  if (!role) {
    return (
      <AppLayout>
        <PageLoading />
      </AppLayout>
    );
  }

  // Render role-specific dashboard
  const renderDashboard = () => {
    switch (role) {
      case 'super_admin':
        return <SuperAdminDashboard />;
      case 'general_manager':
        return <GeneralManagerDashboard />;
      case 'area_safety_officer':
        return <AreaSafetyOfficerDashboard />;
      case 'manager':
        return <ManagerDashboard />;
      case 'safety_officer':
        return <SafetyOfficerDashboard />;
      case 'shift_incharge':
        return <ShiftInchargeDashboard />;
      case 'worker':
        return <WorkerDashboard />;
      default:
        // Fallback - super admin dashboard as it has most access
        return <SuperAdminDashboard />;
    }
  };

  return (
    <AppLayout>
      {renderDashboard()}
    </AppLayout>
  );
}
