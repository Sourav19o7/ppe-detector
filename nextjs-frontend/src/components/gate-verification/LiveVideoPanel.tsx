'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Square, Wifi, WifiOff, Camera, User, CheckCircle, AlertCircle } from 'lucide-react';
import { Spinner } from '../Loading';

interface LiveVideoPanelProps {
  isActive: boolean;
  onFrameCapture?: (frame: string) => void;
  identifiedWorker?: { name: string; employee_id: string } | null;
  attendanceMarked?: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function LiveVideoPanel({
  isActive,
  onFrameCapture,
  identifiedWorker,
  attendanceMarked,
}: LiveVideoPanelProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const onFrameCaptureRef = useRef(onFrameCapture);
  onFrameCaptureRef.current = onFrameCapture;

  // Get WebSocket URL
  const getWebSocketUrl = () => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiHost = API_URL.replace(/^https?:\/\//, '');
    return `${wsProtocol}//${apiHost}/ws/video`;
  };

  // Connect to WebSocket
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = getWebSocketUrl();
    console.log('Connecting to WebSocket:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'frame' && data.frame) {
            const frameData = `data:image/jpeg;base64,${data.frame}`;
            setCurrentFrame(frameData);

            // Send frame to parent for detection if active
            if (isActive) {
              onFrameCaptureRef.current?.(frameData);
            }
          } else if (data.type === 'heartbeat') {
            // Heartbeat received, connection is alive
          } else if (data.error) {
            console.error('WebSocket error:', data.error);
            setError(data.error);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error');
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect if streaming is still enabled
        if (isStreaming) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect...');
            connectWebSocket();
          }, 2000);
        }
      };
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      setError('Failed to connect');
    }
  }, [isStreaming, isActive]);

  // Disconnect WebSocket
  const disconnectWebSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setCurrentFrame(null);
  }, []);

  // Start streaming
  const startStreaming = useCallback(() => {
    setIsStreaming(true);
    setError(null);
    connectWebSocket();
  }, [connectWebSocket]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    setIsStreaming(false);
    disconnectWebSocket();
  }, [disconnectWebSocket]);

  // Auto-start when verification becomes active
  useEffect(() => {
    if (isActive && !isStreaming) {
      startStreaming();
    }
  }, [isActive, isStreaming, startStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectWebSocket();
    };
  }, [disconnectWebSocket]);

  const toggleStream = () => {
    if (isStreaming) {
      stopStreaming();
    } else {
      startStreaming();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Video Display */}
      <div className="relative aspect-video bg-stone-900 rounded-xl overflow-hidden">
        {/* Video Frame */}
        {currentFrame ? (
          <img
            src={currentFrame}
            alt="Live video feed"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {isStreaming ? (
              <div className="text-center text-white">
                <Spinner size="lg" className="mx-auto mb-4" />
                <p>Connecting to camera...</p>
              </div>
            ) : (
              <div className="text-center text-white">
                <Camera size={48} className="mx-auto mb-4 text-stone-400" />
                <p className="text-stone-300">Click Start to begin verification</p>
              </div>
            )}
          </div>
        )}

        {/* Overlays */}
        {isStreaming && (
          <>
            {/* Live badge */}
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              LIVE
            </div>

            {/* Connection Status */}
            <div className={`absolute top-3 right-3 flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
              isConnected ? 'bg-green-600/90 text-white' : 'bg-yellow-600/90 text-white'
            }`}>
              {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {isConnected ? 'Connected' : 'Reconnecting...'}
            </div>
          </>
        )}

        {/* Scanning indicator when active */}
        {isActive && isStreaming && (
          <div className="absolute inset-0 border-4 border-orange-500 animate-pulse rounded-xl pointer-events-none" />
        )}

        {/* Worker Identified Notification */}
        {identifiedWorker && (
          <div className="absolute bottom-3 left-3 right-3 bg-green-600/95 text-white p-3 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <User size={28} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-lg">{identifiedWorker.name}</p>
                <p className="text-sm text-green-100">ID: {identifiedWorker.employee_id}</p>
              </div>
              {attendanceMarked && (
                <div className="flex flex-col items-center gap-1 bg-white/20 px-3 py-2 rounded-lg">
                  <CheckCircle size={24} />
                  <span className="text-xs font-semibold">ATTENDANCE</span>
                  <span className="text-xs">MARKED</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="absolute bottom-3 left-3 right-3 bg-red-600/95 text-white p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <button
        onClick={toggleStream}
        className={`w-full py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
          isStreaming
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600'
        }`}
      >
        {isStreaming ? (
          <>
            <Square size={18} />
            Stop Camera
          </>
        ) : (
          <>
            <Play size={18} />
            Start Camera
          </>
        )}
      </button>
    </div>
  );
}
