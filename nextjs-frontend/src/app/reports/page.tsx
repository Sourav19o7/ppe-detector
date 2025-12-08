'use client';

import { useState } from 'react';
import { FileText, Calendar, Download, Users, AlertTriangle, Clock, Search } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Card } from '@/components/Card';
import { Spinner } from '@/components/Loading';
import { reportsApi, employeeApi } from '@/lib/api';
import { formatDate, formatTime, getDateString } from '@/lib/utils';
import type { AttendanceReport, ViolationReport, Employee } from '@/types';

type ReportType = 'attendance' | 'violations';

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('attendance');
  const [startDate, setStartDate] = useState(getDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [endDate, setEndDate] = useState(getDateString());
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [attendanceReport, setAttendanceReport] = useState<AttendanceReport | null>(null);
  const [violationReport, setViolationReport] = useState<ViolationReport | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');

  const loadEmployees = async () => {
    try {
      const data = await employeeApi.list(0, 100);
      setEmployees(data.employees);
    } catch (err) {
      console.error('Failed to load employees:', err);
    }
  };

  useState(() => {
    loadEmployees();
  });

  const generateReport = async () => {
    setIsLoading(true);
    setAttendanceReport(null);
    setViolationReport(null);

    try {
      if (reportType === 'attendance') {
        const report = await reportsApi.getAttendanceReport(
          startDate,
          endDate,
          selectedEmployee || undefined
        );
        setAttendanceReport(report);
      } else {
        const report = await reportsApi.getViolationsReport(
          startDate,
          endDate,
          selectedEmployee || undefined
        );
        setViolationReport(report);
      }
    } catch (err) {
      console.error('Failed to generate report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCSV = () => {
    let csvContent = '';

    if (reportType === 'attendance' && attendanceReport) {
      csvContent = 'Employee ID,Employee Name,Date,Check Ins,Check Outs,Total Hours\n';
      attendanceReport.records.forEach((record) => {
        csvContent += `${record.employee_id},${record.employee_name},${record.date},"${record.check_ins.map(t => formatTime(t)).join(', ')}","${record.check_outs.map(t => formatTime(t)).join(', ')}",${record.total_hours || 'N/A'}\n`;
      });
    } else if (reportType === 'violations' && violationReport) {
      csvContent = 'ID,Employee ID,Employee Name,Timestamp,Violations,Location\n';
      violationReport.violations.forEach((v) => {
        csvContent += `${v.id},${v.employee_id || 'Unknown'},${v.employee_name || 'Unknown'},${v.timestamp},"${v.violations.map(viol => viol.label).join(', ')}",${v.location || 'N/A'}\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}_report_${startDate}_to_${endDate}.csv`;
    a.click();
  };

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
      emp.employee_id.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 mt-1">Generate attendance and violation reports</p>
        </div>

        {/* Report Configuration */}
        <Card title="Generate Report">
          <div className="space-y-4">
            {/* Report Type */}
            <div className="flex gap-2">
              <button
                onClick={() => setReportType('attendance')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                  reportType === 'attendance'
                    ? 'bg-[#1e3a5f] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Users size={20} />
                Attendance Report
              </button>
              <button
                onClick={() => setReportType('violations')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                  reportType === 'violations'
                    ? 'bg-[#1e3a5f] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <AlertTriangle size={20} />
                Violations Report
              </button>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            {/* Employee Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee (Optional)
              </label>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full"
              >
                <option value="">All Employees</option>
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.name} ({emp.employee_id})
                  </option>
                ))}
              </select>
            </div>

            {/* Generate Button */}
            <button
              onClick={generateReport}
              disabled={isLoading}
              className="w-full py-3 px-4 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#2d4a6f] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" className="border-white/30 border-t-white" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText size={20} />
                  Generate Report
                </>
              )}
            </button>
          </div>
        </Card>

        {/* Attendance Report */}
        {attendanceReport && (
          <Card
            title="Attendance Report"
            description={`${formatDate(attendanceReport.start_date)} - ${formatDate(attendanceReport.end_date)}`}
          >
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-blue-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {attendanceReport.summary.unique_employees}
                </p>
                <p className="text-sm text-blue-700">Employees</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-600">
                  {attendanceReport.summary.total_records}
                </p>
                <p className="text-sm text-green-700">Records</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {attendanceReport.summary.total_days}
                </p>
                <p className="text-sm text-purple-700">Days</p>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-yellow-600">
                  {attendanceReport.summary.total_hours_worked.toFixed(1)}h
                </p>
                <p className="text-sm text-yellow-700">Total Hours</p>
              </div>
            </div>

            {/* Table */}
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th>Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceReport.records.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-gray-500 py-8">
                        No records found
                      </td>
                    </tr>
                  ) : (
                    attendanceReport.records.map((record, idx) => (
                      <tr key={idx}>
                        <td>
                          <div>
                            <p className="font-medium">{record.employee_name}</p>
                            <p className="text-xs text-gray-500">{record.employee_id}</p>
                          </div>
                        </td>
                        <td>{formatDate(record.date)}</td>
                        <td>
                          {record.check_ins.map((t, i) => (
                            <span key={i} className="badge badge-success mr-1">
                              {formatTime(t)}
                            </span>
                          ))}
                        </td>
                        <td>
                          {record.check_outs.map((t, i) => (
                            <span key={i} className="badge badge-info mr-1">
                              {formatTime(t)}
                            </span>
                          ))}
                        </td>
                        <td>{record.total_hours?.toFixed(2) || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Download Button */}
            <button
              onClick={downloadCSV}
              className="mt-4 py-2 px-4 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors flex items-center gap-2"
            >
              <Download size={18} />
              Download CSV
            </button>
          </Card>
        )}

        {/* Violations Report */}
        {violationReport && (
          <Card
            title="Violations Report"
            description={`${formatDate(violationReport.start_date)} - ${formatDate(violationReport.end_date)}`}
          >
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-red-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-red-600">
                  {violationReport.summary.total_violations}
                </p>
                <p className="text-sm text-red-700">Total Violations</p>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-orange-600">
                  {violationReport.summary.employees_with_violations}
                </p>
                <p className="text-sm text-orange-700">Employees</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg text-center col-span-2 md:col-span-1">
                <p className="text-2xl font-bold text-blue-600">
                  {Object.keys(violationReport.summary.violation_breakdown).length}
                </p>
                <p className="text-sm text-blue-700">Violation Types</p>
              </div>
            </div>

            {/* Violation Breakdown */}
            {Object.keys(violationReport.summary.violation_breakdown).length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Breakdown by Type:</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(violationReport.summary.violation_breakdown).map(([type, count]) => (
                    <span key={type} className="badge badge-danger">
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Table */}
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Date/Time</th>
                    <th>Violations</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {violationReport.violations.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-gray-500 py-8">
                        No violations found
                      </td>
                    </tr>
                  ) : (
                    violationReport.violations.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <p className="font-medium">
                            {record.employee_name || 'Unknown'}
                          </p>
                          {record.employee_id && (
                            <p className="text-xs text-gray-500">{record.employee_id}</p>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-1 text-gray-600">
                            <Calendar size={14} />
                            {formatDate(record.timestamp)}
                          </div>
                          <div className="flex items-center gap-1 text-gray-500 text-sm">
                            <Clock size={12} />
                            {formatTime(record.timestamp)}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {record.violations.map((v, i) => (
                              <span key={i} className="badge badge-danger text-xs">
                                {v.label}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="text-gray-600">{record.location || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Download Button */}
            <button
              onClick={downloadCSV}
              className="mt-4 py-2 px-4 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors flex items-center gap-2"
            >
              <Download size={18} />
              Download CSV
            </button>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
