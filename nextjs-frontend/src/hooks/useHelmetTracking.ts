/**
 * useHelmetTracking Hook
 *
 * Connects to helmet.py WebSocket and implements Pedestrian Dead Reckoning (PDR)
 * using step detection for smooth, jitter-free position tracking.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ==================== TYPES ====================
export interface IMUData {
  accelX: number;      // mg (milli-g)
  accelY: number;      // mg
  accelZ: number;      // mg
  gyroX: number;       // mdps
  gyroY: number;       // mdps
  gyroZ: number;       // mdps
  roll: number;        // degrees
  pitch: number;       // degrees
  yaw: number;         // degrees
  timestamp: number;   // ms
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface TrackingState {
  position: Position;
  heading: number;           // radians
  isConnected: boolean;
  isSimulating: boolean;
  stepCount: number;
  lastIMU: IMUData | null;
}

// ==================== CONSTANTS ====================
const HELMET_WS_URL = 'ws://localhost:8000/ws';

// Step detection parameters (tuned for walking)
const STEP_THRESHOLD = 1150;      // mg - acceleration magnitude threshold
const STEP_COOLDOWN = 280;        // ms - minimum time between steps
const STEP_LENGTH = 0.65;         // meters per step

// Smoothing filter parameters (EMA - Exponential Moving Average)
const HEADING_FILTER_ALPHA = 0.08;   // Lower = smoother heading
const POSITION_FILTER_ALPHA = 0.12;  // Lower = smoother position

// Reconnection settings
const RECONNECT_INTERVAL = 3000;  // ms

// Mock simulation settings
const MOCK_UPDATE_INTERVAL = 100; // ms
const MOCK_STEP_INTERVAL = 600;   // ms between simulated steps

// ==================== UTILITY FUNCTIONS ====================

/**
 * Exponential Moving Average filter
 */
function emaFilter(current: number, previous: number, alpha: number): number {
  return alpha * current + (1 - alpha) * previous;
}

/**
 * Convert degrees to radians
 */
function degToRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate acceleration magnitude from 3-axis data
 */
function calculateAccelMagnitude(ax: number, ay: number, az: number): number {
  return Math.sqrt(ax * ax + ay * ay + az * az);
}

// ==================== MAIN HOOK ====================

interface UseHelmetTrackingOptions {
  enabled: boolean;
  initialPosition?: Position;
  onPositionUpdate?: (position: Position, heading: number) => void;
  onConnectionChange?: (connected: boolean, simulating: boolean) => void;
  onStepDetected?: () => void;
}

export function useHelmetTracking({
  enabled,
  initialPosition = { x: 0, y: 1.7, z: 0 },
  onPositionUpdate,
  onConnectionChange,
  onStepDetected,
}: UseHelmetTrackingOptions): TrackingState {
  // State
  const [state, setState] = useState<TrackingState>({
    position: initialPosition,
    heading: 0,
    isConnected: false,
    isSimulating: false,
    stepCount: 0,
    lastIMU: null,
  });

  // Refs for mutable values (don't trigger re-renders)
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mockIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mockStepIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // PDR state refs
  const positionRef = useRef<Position>(initialPosition);
  const filteredPositionRef = useRef<Position>(initialPosition);
  const headingRef = useRef<number>(0);
  const filteredHeadingRef = useRef<number>(0);
  const lastStepTimeRef = useRef<number>(0);
  const stepCountRef = useRef<number>(0);
  const lastAccelMagnitudeRef = useRef<number>(1000);
  const wasAboveThresholdRef = useRef<boolean>(false);

  // Callbacks refs (to avoid stale closures)
  const onPositionUpdateRef = useRef(onPositionUpdate);
  const onConnectionChangeRef = useRef(onConnectionChange);
  const onStepDetectedRef = useRef(onStepDetected);

  useEffect(() => {
    onPositionUpdateRef.current = onPositionUpdate;
    onConnectionChangeRef.current = onConnectionChange;
    onStepDetectedRef.current = onStepDetected;
  }, [onPositionUpdate, onConnectionChange, onStepDetected]);

  /**
   * Process incoming IMU data and update position
   */
  const processIMUData = useCallback((imu: IMUData) => {
    const now = Date.now();

    // Update heading from yaw (convert to radians, apply filter)
    const rawHeading = degToRad(imu.yaw);
    filteredHeadingRef.current = emaFilter(
      rawHeading,
      filteredHeadingRef.current,
      HEADING_FILTER_ALPHA
    );
    headingRef.current = filteredHeadingRef.current;

    // Calculate acceleration magnitude for step detection
    const accelMag = calculateAccelMagnitude(imu.accelX, imu.accelY, imu.accelZ);

    // Step detection using peak detection
    // Detect rising edge crossing threshold (step impact)
    const isAboveThreshold = accelMag > STEP_THRESHOLD;
    const timeSinceLastStep = now - lastStepTimeRef.current;

    if (
      isAboveThreshold &&
      !wasAboveThresholdRef.current &&
      timeSinceLastStep > STEP_COOLDOWN
    ) {
      // Step detected!
      lastStepTimeRef.current = now;
      stepCountRef.current += 1;

      // Update position based on heading
      const heading = filteredHeadingRef.current;
      positionRef.current = {
        x: positionRef.current.x + STEP_LENGTH * Math.sin(heading),
        y: positionRef.current.y,
        z: positionRef.current.z - STEP_LENGTH * Math.cos(heading),
      };

      // Notify step detected
      onStepDetectedRef.current?.();
    }

    wasAboveThresholdRef.current = isAboveThreshold;
    lastAccelMagnitudeRef.current = accelMag;

    // Apply position smoothing filter
    filteredPositionRef.current = {
      x: emaFilter(positionRef.current.x, filteredPositionRef.current.x, POSITION_FILTER_ALPHA),
      y: positionRef.current.y,
      z: emaFilter(positionRef.current.z, filteredPositionRef.current.z, POSITION_FILTER_ALPHA),
    };

    // Update state and notify
    const newPosition = filteredPositionRef.current;
    const newHeading = filteredHeadingRef.current;

    setState(prev => ({
      ...prev,
      position: newPosition,
      heading: newHeading,
      stepCount: stepCountRef.current,
      lastIMU: imu,
    }));

    onPositionUpdateRef.current?.(newPosition, newHeading);
  }, []);

  /**
   * Parse WebSocket message from helmet.py
   */
  const parseHelmetMessage = useCallback((data: string): IMUData | null => {
    try {
      const json = JSON.parse(data);

      return {
        accelX: json['Accel X (mg)'] ?? 0,
        accelY: json['Accel Y (mg)'] ?? 0,
        accelZ: json['Accel Z (mg)'] ?? 1000,
        gyroX: json['Gyro X (mdps)'] ?? 0,
        gyroY: json['Gyro Y (mdps)'] ?? 0,
        gyroZ: json['Gyro Z (mdps)'] ?? 0,
        roll: json['Roll (Deg)'] ?? 0,
        pitch: json['Pitch (Deg)'] ?? 0,
        yaw: json['Yaw (Deg)'] ?? 0,
        timestamp: json['Timestamp (ms)'] ?? Date.now(),
      };
    } catch (e) {
      console.error('[HelmetTracking] Failed to parse message:', e);
      return null;
    }
  }, []);

  /**
   * Start mock simulation when helmet is disconnected
   */
  const startMockSimulation = useCallback(() => {
    console.log('[HelmetTracking] Starting mock simulation');

    let mockYaw = 0;
    let mockTime = 0;

    // Update mock IMU data at regular intervals
    mockIntervalRef.current = setInterval(() => {
      mockTime += MOCK_UPDATE_INTERVAL;

      // Gentle heading drift for realistic movement
      mockYaw += (Math.random() - 0.5) * 2;
      mockYaw = mockYaw % 360;

      const mockIMU: IMUData = {
        accelX: (Math.random() - 0.5) * 100,
        accelY: (Math.random() - 0.5) * 100,
        accelZ: 980 + (Math.random() - 0.5) * 50,
        gyroX: (Math.random() - 0.5) * 50,
        gyroY: (Math.random() - 0.5) * 50,
        gyroZ: (Math.random() - 0.5) * 50,
        roll: (Math.random() - 0.5) * 5,
        pitch: (Math.random() - 0.5) * 5,
        yaw: mockYaw,
        timestamp: mockTime,
      };

      // Update heading only (not triggering steps)
      const rawHeading = degToRad(mockIMU.yaw);
      filteredHeadingRef.current = emaFilter(
        rawHeading,
        filteredHeadingRef.current,
        HEADING_FILTER_ALPHA
      );

      setState(prev => ({
        ...prev,
        heading: filteredHeadingRef.current,
        lastIMU: mockIMU,
      }));
    }, MOCK_UPDATE_INTERVAL);

    // Simulate steps at regular intervals
    mockStepIntervalRef.current = setInterval(() => {
      const heading = filteredHeadingRef.current;
      stepCountRef.current += 1;

      positionRef.current = {
        x: positionRef.current.x + STEP_LENGTH * Math.sin(heading),
        y: positionRef.current.y,
        z: positionRef.current.z - STEP_LENGTH * Math.cos(heading),
      };

      filteredPositionRef.current = {
        x: emaFilter(positionRef.current.x, filteredPositionRef.current.x, POSITION_FILTER_ALPHA),
        y: positionRef.current.y,
        z: emaFilter(positionRef.current.z, filteredPositionRef.current.z, POSITION_FILTER_ALPHA),
      };

      const newPosition = filteredPositionRef.current;

      setState(prev => ({
        ...prev,
        position: newPosition,
        stepCount: stepCountRef.current,
      }));

      onPositionUpdateRef.current?.(newPosition, filteredHeadingRef.current);
      onStepDetectedRef.current?.();
    }, MOCK_STEP_INTERVAL);

    setState(prev => ({
      ...prev,
      isSimulating: true,
      isConnected: false,
    }));

    onConnectionChangeRef.current?.(false, true);
  }, []);

  /**
   * Stop mock simulation
   */
  const stopMockSimulation = useCallback(() => {
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current);
      mockIntervalRef.current = null;
    }
    if (mockStepIntervalRef.current) {
      clearInterval(mockStepIntervalRef.current);
      mockStepIntervalRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isSimulating: false,
    }));
  }, []);

  /**
   * Connect to helmet.py WebSocket
   */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    console.log('[HelmetTracking] Connecting to', HELMET_WS_URL);

    try {
      const ws = new WebSocket(HELMET_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[HelmetTracking] Connected to helmet.py');
        stopMockSimulation();

        setState(prev => ({
          ...prev,
          isConnected: true,
          isSimulating: false,
        }));

        onConnectionChangeRef.current?.(true, false);
      };

      ws.onmessage = (event) => {
        const imu = parseHelmetMessage(event.data);
        if (imu) {
          processIMUData(imu);
        }
      };

      ws.onerror = (error) => {
        console.error('[HelmetTracking] WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('[HelmetTracking] Disconnected from helmet.py');
        wsRef.current = null;

        setState(prev => ({
          ...prev,
          isConnected: false,
        }));

        onConnectionChangeRef.current?.(false, false);

        // Start mock simulation and schedule reconnect
        if (enabled) {
          startMockSimulation();
          reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_INTERVAL);
        }
      };
    } catch (error) {
      console.error('[HelmetTracking] Failed to create WebSocket:', error);

      // Start mock simulation on connection failure
      if (enabled) {
        startMockSimulation();
        reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_INTERVAL);
      }
    }
  }, [enabled, parseHelmetMessage, processIMUData, startMockSimulation, stopMockSimulation]);

  /**
   * Disconnect from WebSocket
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    stopMockSimulation();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isConnected: false,
      isSimulating: false,
    }));
  }, [stopMockSimulation]);

  /**
   * Reset position to initial/entrance
   */
  const resetPosition = useCallback((newPosition?: Position) => {
    const pos = newPosition || initialPosition;
    positionRef.current = pos;
    filteredPositionRef.current = pos;
    stepCountRef.current = 0;

    setState(prev => ({
      ...prev,
      position: pos,
      stepCount: 0,
    }));
  }, [initialPosition]);

  // Effect: Connect/disconnect based on enabled state
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  // Effect: Update initial position when it changes
  useEffect(() => {
    if (!enabled) {
      positionRef.current = initialPosition;
      filteredPositionRef.current = initialPosition;
      setState(prev => ({
        ...prev,
        position: initialPosition,
      }));
    }
  }, [initialPosition, enabled]);

  return state;
}

// Export reset function separately for imperative usage
export function createHelmetTrackingController() {
  let resetFn: ((pos?: Position) => void) | null = null;

  return {
    setResetFunction: (fn: (pos?: Position) => void) => {
      resetFn = fn;
    },
    reset: (pos?: Position) => {
      resetFn?.(pos);
    },
  };
}

export default useHelmetTracking;
