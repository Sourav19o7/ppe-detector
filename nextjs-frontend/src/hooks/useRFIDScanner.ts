'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import type { VerificationItemType } from '@/types';

interface RFIDScanEvent {
  tagId: string;
  tagType: VerificationItemType;
  timestamp: Date;
}

interface UseRFIDScannerOptions {
  enabled: boolean;
  onScan: (event: RFIDScanEvent) => void;
  mockMode?: boolean; // Enable keyboard shortcuts for testing
}

interface RFIDScannerState {
  isConnected: boolean;
  lastScan: RFIDScanEvent | null;
  error: string | null;
}

/**
 * Hook for RFID scanner integration
 *
 * Mock mode keyboard shortcuts (for development):
 * - Press 'H' to simulate helmet RFID scan
 * - Press 'V' to simulate vest RFID scan
 * - Press 'S' to simulate shoes RFID scan
 *
 * Real RFID integration:
 * Replace the mock implementation with actual RFID reader connection
 * Expected data format from RFID reader:
 * {
 *   tagId: string (unique tag identifier),
 *   tagType: 'helmet' | 'vest' | 'shoes' (determined by tag prefix or lookup)
 * }
 */
export function useRFIDScanner({ enabled, onScan, mockMode = true }: UseRFIDScannerOptions): RFIDScannerState {
  const [state, setState] = useState<RFIDScannerState>({
    isConnected: false,
    lastScan: null,
    error: null,
  });

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  // Generate mock tag ID
  const generateMockTagId = useCallback((type: VerificationItemType): string => {
    const prefix = {
      helmet: 'HLM',
      vest: 'VST',
      shoes: 'SHS',
      face: 'FCE', // Not used for RFID, but included for completeness
    };
    return `${prefix[type]}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }, []);

  // Handle mock keyboard input
  useEffect(() => {
    if (!enabled || !mockMode) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      let tagType: VerificationItemType | null = null;

      switch (event.key.toLowerCase()) {
        case 'h':
          tagType = 'helmet';
          break;
        case 'v':
          tagType = 'vest';
          break;
        case 's':
          tagType = 'shoes';
          break;
      }

      if (tagType) {
        const scanEvent: RFIDScanEvent = {
          tagId: generateMockTagId(tagType),
          tagType,
          timestamp: new Date(),
        };

        setState((prev) => ({
          ...prev,
          lastScan: scanEvent,
        }));

        onScanRef.current(scanEvent);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Simulate connection established
    setState((prev) => ({
      ...prev,
      isConnected: true,
      error: null,
    }));

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      setState((prev) => ({
        ...prev,
        isConnected: false,
      }));
    };
  }, [enabled, mockMode, generateMockTagId]);

  // Real RFID integration placeholder
  useEffect(() => {
    if (!enabled || mockMode) return;

    // TODO: Implement real RFID reader connection
    // Example WebSocket connection to RFID reader service:
    //
    // const ws = new WebSocket('ws://localhost:8080/rfid');
    //
    // ws.onopen = () => {
    //   setState(prev => ({ ...prev, isConnected: true, error: null }));
    // };
    //
    // ws.onmessage = (event) => {
    //   const data = JSON.parse(event.data);
    //   const scanEvent: RFIDScanEvent = {
    //     tagId: data.tagId,
    //     tagType: determineTagType(data.tagId), // Map tag ID to type
    //     timestamp: new Date(),
    //   };
    //   setState(prev => ({ ...prev, lastScan: scanEvent }));
    //   onScanRef.current(scanEvent);
    // };
    //
    // ws.onerror = () => {
    //   setState(prev => ({ ...prev, error: 'RFID connection failed' }));
    // };
    //
    // ws.onclose = () => {
    //   setState(prev => ({ ...prev, isConnected: false }));
    // };
    //
    // return () => ws.close();

    // For now, just mark as not connected when not in mock mode
    setState((prev) => ({
      ...prev,
      isConnected: false,
      error: 'Real RFID integration not implemented. Enable mock mode for testing.',
    }));
  }, [enabled, mockMode]);

  return state;
}

// Helper function to manually trigger a scan (for UI buttons)
export function createManualScanTrigger(
  onScan: (event: RFIDScanEvent) => void
): (tagType: VerificationItemType) => void {
  return (tagType: VerificationItemType) => {
    const prefix = {
      helmet: 'HLM',
      vest: 'VST',
      shoes: 'SHS',
      face: 'FCE',
    };

    const scanEvent: RFIDScanEvent = {
      tagId: `${prefix[tagType]}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      tagType,
      timestamp: new Date(),
    };

    onScan(scanEvent);
  };
}
