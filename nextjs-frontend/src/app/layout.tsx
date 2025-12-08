import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Safety System - PPE & Attendance',
  description: 'PPE Detection and Attendance Management System',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
