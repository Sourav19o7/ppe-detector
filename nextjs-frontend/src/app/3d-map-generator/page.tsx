'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Upload, ChevronRight, Settings2, Play, ArrowLeft, Maximize2, Download, Flashlight, Map } from 'lucide-react';
import Script from 'next/script';

// Types for mine data
interface WallData {
  start: { x: number; z: number };
  end: { x: number; z: number };
  height: number;
  length: number;
}

interface RoomData {
  center: { x: number; z: number };
  width: number;
  depth: number;
  area: number;
}

interface MineData {
  walls: WallData[];
  rooms: RoomData[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  wallHeight: number;
  imageWidth?: number;
  imageHeight?: number;
}

// Declare THREE and cv as global
declare global {
  interface Window {
    cv: any;
    THREE: any;
  }
}

export default function Map3DGeneratorPage() {
  // State
  const [cvReady, setCvReady] = useState(false);
  const [threeReady, setThreeReady] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const [processedData, setProcessedData] = useState<MineData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [showViewer, setShowViewer] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Settings
  const [threshold, setThreshold] = useState(100);
  const [wallHeight, setWallHeight] = useState(4);
  const [scale, setScale] = useState(1);
  const [addLights, setAddLights] = useState(true);
  const [addDust, setAddDust] = useState(true);

  // Refs
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

  // Three.js refs
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const clockRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Movement state
  const moveStateRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    running: false
  });
  const eulerRef = useRef({ x: 0, y: 0 });
  const isPointerLockedRef = useRef(false);
  const flashlightRef = useRef<any>(null);
  const isFlashlightOnRef = useRef(true);

  // Config
  const CONFIG = {
    camera: { height: 1.7, fov: 75, near: 0.1, far: 1000 },
    movement: { speed: 0.15, runMultiplier: 2, sensitivity: 0.002 },
    fog: { color: 0x0a0a0a, density: 0.015 },
    lighting: { ambient: 0x1a1a1a, point: 0xffaa44 }
  };

  // Handle file upload
  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, JPEG)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setUploadedImage(img);
        setShowPreview(true);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  // Extract mine data from OpenCV results - defined early to be used by processImage
  const extractMineDataFn = useCallback((lines: any, contours: any, width: number, height: number): MineData => {
    const cv = window.cv;
    const walls: WallData[] = [];
    const rooms: RoomData[] = [];

    const worldScale = 0.5 * scale;
    const offsetX = width / 2;
    const offsetY = height / 2;

    // Extract walls
    for (let i = 0; i < lines.rows; i++) {
      const x1 = (lines.data32S[i * 4] - offsetX) * worldScale;
      const z1 = (lines.data32S[i * 4 + 1] - offsetY) * worldScale;
      const x2 = (lines.data32S[i * 4 + 2] - offsetX) * worldScale;
      const z2 = (lines.data32S[i * 4 + 3] - offsetY) * worldScale;

      const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
      if (length > 1) {
        walls.push({
          start: { x: x1, z: z1 },
          end: { x: x2, z: z2 },
          height: wallHeight,
          length
        });
      }
    }

    // Extract rooms
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area > 500) {
        const rect = cv.boundingRect(contour);
        const roomWidth = rect.width * worldScale;
        const roomDepth = rect.height * worldScale;
        const roomCenterX = (rect.x + rect.width / 2 - offsetX) * worldScale;
        const roomCenterZ = (rect.y + rect.height / 2 - offsetY) * worldScale;

        if (roomWidth > 2 && roomDepth > 2) {
          rooms.push({
            center: { x: roomCenterX, z: roomCenterZ },
            width: roomWidth,
            depth: roomDepth,
            area: roomWidth * roomDepth
          });
        }
      }
    }

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    walls.forEach(wall => {
      minX = Math.min(minX, wall.start.x, wall.end.x);
      maxX = Math.max(maxX, wall.start.x, wall.end.x);
      minZ = Math.min(minZ, wall.start.z, wall.end.z);
      maxZ = Math.max(maxZ, wall.start.z, wall.end.z);
    });

    return {
      walls,
      rooms,
      bounds: { minX, maxX, minZ, maxZ },
      wallHeight,
      imageWidth: width,
      imageHeight: height
    };
  }, [scale, wallHeight]);

  // Fallback mine data
  const createFallbackMineData = useCallback((): MineData => {
    const walls: WallData[] = [
      { start: { x: -4, z: 0 }, end: { x: -4, z: -80 }, height: wallHeight, length: 80 },
      { start: { x: 4, z: 0 }, end: { x: 4, z: -80 }, height: wallHeight, length: 80 },
      { start: { x: -4, z: -80 }, end: { x: 4, z: -80 }, height: wallHeight, length: 8 },
      { start: { x: -4, z: -20 }, end: { x: -25, z: -20 }, height: wallHeight, length: 21 },
      { start: { x: -4, z: -25 }, end: { x: -25, z: -25 }, height: wallHeight, length: 21 },
      { start: { x: -25, z: -20 }, end: { x: -25, z: -25 }, height: wallHeight, length: 5 },
      { start: { x: 4, z: -40 }, end: { x: 25, z: -40 }, height: wallHeight, length: 21 },
      { start: { x: 4, z: -45 }, end: { x: 25, z: -45 }, height: wallHeight, length: 21 },
      { start: { x: 25, z: -40 }, end: { x: 25, z: -45 }, height: wallHeight, length: 5 },
    ];

    const rooms: RoomData[] = [
      { center: { x: 0, z: -40 }, width: 8, depth: 80, area: 640 },
      { center: { x: -15, z: -22.5 }, width: 21, depth: 5, area: 105 },
      { center: { x: 15, z: -42.5 }, width: 21, depth: 5, area: 105 },
    ];

    return {
      walls,
      rooms,
      bounds: { minX: -25, maxX: 25, minZ: -80, maxZ: 0 },
      wallHeight
    };
  }, [wallHeight]);

  // Process image with OpenCV
  const processImage = useCallback(() => {
    if (!cvReady || !originalCanvasRef.current || !processedCanvasRef.current || !uploadedImage) {
      console.log('processImage: not ready yet', { cvReady, hasOriginalCanvas: !!originalCanvasRef.current, hasProcessedCanvas: !!processedCanvasRef.current, hasImage: !!uploadedImage });
      return;
    }

    const cv = window.cv;
    if (!cv || !cv.Mat) {
      console.log('OpenCV not fully initialized, retrying...');
      setTimeout(processImage, 100);
      return;
    }

    try {
      const originalCanvas = originalCanvasRef.current;
      const processedCanvas = processedCanvasRef.current;

      console.log('Processing image with OpenCV...', { width: originalCanvas.width, height: originalCanvas.height });

      // Read image from canvas
      let src = cv.imread(originalCanvas);
      let dst = new cv.Mat();
      let gray = new cv.Mat();
      let edges = new cv.Mat();
      let lines = new cv.Mat();
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();

      console.log('Source image loaded:', src.rows, 'x', src.cols);

      // Convert to grayscale
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Apply Gaussian blur
      cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);

      // Canny edge detection
      cv.Canny(gray, edges, threshold * 0.5, threshold, 3, false);

      // Dilate edges
      let kernel = cv.Mat.ones(3, 3, cv.CV_8U);
      cv.dilate(edges, edges, kernel);

      // Find contours
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      // Detect lines using Hough Transform
      cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 50, 30, 10);

      console.log('Detected lines:', lines.rows, 'contours:', contours.size());

      // Extract mine data
      const mineData = extractMineDataFn(lines, contours, originalCanvas.width, originalCanvas.height);
      console.log('Extracted mine data:', {
        wallCount: mineData.walls.length,
        roomCount: mineData.rooms.length,
        bounds: mineData.bounds,
        sampleWalls: mineData.walls.slice(0, 3)
      });
      setProcessedData(mineData);

      // Set up processed canvas dimensions
      processedCanvas.width = originalCanvas.width;
      processedCanvas.height = originalCanvas.height;

      // Create output image (black background)
      dst = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC4);

      // Draw walls (lines) in green
      for (let i = 0; i < lines.rows; i++) {
        const x1 = lines.data32S[i * 4];
        const y1 = lines.data32S[i * 4 + 1];
        const x2 = lines.data32S[i * 4 + 2];
        const y2 = lines.data32S[i * 4 + 3];
        cv.line(dst, new cv.Point(x1, y1), new cv.Point(x2, y2), [0, 255, 0, 255], 2);
      }

      // Draw contours (rooms) in orange
      for (let i = 0; i < contours.size(); i++) {
        cv.drawContours(dst, contours, i, [255, 128, 0, 255], 1, cv.LINE_8, hierarchy, 0);
      }

      // Display result on processed canvas
      cv.imshow(processedCanvas, dst);

      console.log('Image processing complete. Walls:', mineData.walls.length, 'Rooms:', mineData.rooms.length);

      // Cleanup OpenCV matrices
      src.delete();
      dst.delete();
      gray.delete();
      edges.delete();
      lines.delete();
      contours.delete();
      hierarchy.delete();
      kernel.delete();

    } catch (err) {
      console.error('OpenCV processing error:', err);
      // Fallback to demo mine data
      setProcessedData(createFallbackMineData());
    }
  }, [cvReady, threshold, uploadedImage, extractMineDataFn, createFallbackMineData]);

  // Check if scripts are already loaded on mount
  useEffect(() => {
    // Check if Three.js is already available
    if (window.THREE && !threeReady) {
      setThreeReady(true);
      console.log('Three.js already available');
    }
    // Check if OpenCV is already available
    if (window.cv && window.cv.Mat && !cvReady) {
      setCvReady(true);
      console.log('OpenCV already available');
    }
  }, [threeReady, cvReady]);

  // Draw original image on canvas
  useEffect(() => {
    if (uploadedImage && originalCanvasRef.current) {
      const canvas = originalCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const maxSize = 400;
      const imgScale = Math.min(maxSize / uploadedImage.width, maxSize / uploadedImage.height);
      canvas.width = uploadedImage.width * imgScale;
      canvas.height = uploadedImage.height * imgScale;
      ctx.drawImage(uploadedImage, 0, 0, canvas.width, canvas.height);

      console.log('Original image drawn to canvas:', canvas.width, 'x', canvas.height);
    }
  }, [uploadedImage]);

  // Process image when OpenCV is ready and image is loaded
  useEffect(() => {
    if (cvReady && uploadedImage && originalCanvasRef.current && showPreview) {
      // Give the canvas a moment to render
      const timer = setTimeout(() => {
        processImage();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [cvReady, uploadedImage, showPreview, processImage]);

  // Re-process when threshold or scale settings change
  useEffect(() => {
    if (showPreview && cvReady && uploadedImage && originalCanvasRef.current) {
      processImage();
    }
  }, [threshold, scale, showPreview, cvReady, uploadedImage, processImage]);

  // Update minimap
  const updateMinimap = useCallback((camera: any, mineData: MineData) => {
    const canvas = minimapCanvasRef.current;
    if (!canvas || !mineData.bounds) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { minX, maxX, minZ, maxZ } = mineData.bounds;
    const mapWidth = canvas.width;
    const mapHeight = canvas.height;
    const padding = 10;

    // Calculate scale to fit the mine in the minimap
    const mineWidth = maxX - minX;
    const mineDepth = maxZ - minZ;
    const scaleX = (mapWidth - padding * 2) / mineWidth;
    const scaleZ = (mapHeight - padding * 2) / mineDepth;
    const mapScale = Math.min(scaleX, scaleZ);

    // Helper to convert world coords to minimap coords
    const toMapX = (x: number) => padding + (x - minX) * mapScale;
    const toMapZ = (z: number) => padding + (z - minZ) * mapScale;

    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, mapWidth, mapHeight);

    // Draw walls
    ctx.strokeStyle = '#4ade80'; // Green
    ctx.lineWidth = 2;
    mineData.walls.forEach(wall => {
      ctx.beginPath();
      ctx.moveTo(toMapX(wall.start.x), toMapZ(wall.start.z));
      ctx.lineTo(toMapX(wall.end.x), toMapZ(wall.end.z));
      ctx.stroke();
    });

    // Draw rooms as filled areas
    ctx.fillStyle = 'rgba(74, 222, 128, 0.1)';
    mineData.rooms.forEach(room => {
      const rx = toMapX(room.center.x - room.width / 2);
      const rz = toMapZ(room.center.z - room.depth / 2);
      const rw = room.width * mapScale;
      const rd = room.depth * mapScale;
      ctx.fillRect(rx, rz, rw, rd);
    });

    // Draw player position
    const playerX = toMapX(camera.position.x);
    const playerZ = toMapZ(camera.position.z);

    // Player direction indicator (triangle)
    ctx.save();
    ctx.translate(playerX, playerZ);
    ctx.rotate(-eulerRef.current.y); // Rotate based on camera direction

    ctx.fillStyle = '#f97316'; // Orange
    ctx.beginPath();
    ctx.moveTo(0, -8); // Point forward
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Draw player dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(playerX, playerZ, 3, 0, Math.PI * 2);
    ctx.fill();

    // Draw border
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, mapWidth, mapHeight);
  }, []);

  // Generate 3D environment
  const generate3DEnvironment = useCallback(async () => {
    if (!processedData || !threeReady) {
      alert('Please upload and process a blueprint first');
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(0);

    const steps = [
      { progress: 20, status: 'Creating 3D scene...' },
      { progress: 40, status: 'Building walls and floors...' },
      { progress: 60, status: 'Setting up lighting...' },
      { progress: 80, status: 'Adding particles and effects...' },
      { progress: 100, status: 'Finalizing environment...' }
    ];

    for (const step of steps) {
      setProcessingProgress(step.progress);
      setProcessingStatus(step.status);
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    setIsProcessing(false);
    setShowViewer(true);

    // Initialize 3D scene after state update
    setTimeout(() => init3DScene(), 100);
  }, [processedData, threeReady]);

  // Initialize Three.js scene
  const init3DScene = useCallback(() => {
    if (!viewerContainerRef.current || !processedData) return;

    const THREE = window.THREE;
    const mineData = processedData;

    console.log('Initializing 3D scene with mine data:', {
      wallCount: mineData.walls.length,
      roomCount: mineData.rooms.length,
      bounds: mineData.bounds
    });

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.fog.color);
    scene.fog = new THREE.FogExp2(CONFIG.fog.color, CONFIG.fog.density);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov,
      viewerContainerRef.current.clientWidth / viewerContainerRef.current.clientHeight,
      CONFIG.camera.near,
      CONFIG.camera.far
    );
    const startZ = mineData.bounds ? (mineData.bounds.maxZ + mineData.bounds.minZ) / 2 : 0;
    camera.position.set(0, CONFIG.camera.height, startZ + 5);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(viewerContainerRef.current.clientWidth, viewerContainerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    viewerContainerRef.current.innerHTML = '';
    viewerContainerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    clockRef.current = new THREE.Clock();

    // Build the mine
    createLighting(scene, mineData);
    createFlashlight(scene, camera);
    createMineFromData(scene, mineData);
    if (addDust) createDustParticles(scene, mineData);

    // Setup controls
    setupControls(renderer.domElement, camera);

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      const delta = clockRef.current.getDelta();

      // Apply movement
      const moveState = moveStateRef.current;
      if (moveState.forward || moveState.backward || moveState.left || moveState.right) {
        const speed = CONFIG.movement.speed * (moveState.running ? CONFIG.movement.runMultiplier : 1);

        const direction = new THREE.Vector3();
        direction.z = Number(moveState.forward) - Number(moveState.backward);
        direction.x = Number(moveState.right) - Number(moveState.left);
        direction.normalize();

        const velocity = new THREE.Vector3(direction.x * speed, 0, direction.z * speed);
        velocity.applyQuaternion(camera.quaternion);
        velocity.y = 0;
        camera.position.add(velocity);
      }

      // Keep camera at proper height
      camera.position.y = CONFIG.camera.height;

      // Bound camera
      if (mineData.bounds) {
        const { minX, maxX, minZ, maxZ } = mineData.bounds;
        camera.position.x = Math.max(minX - 5, Math.min(maxX + 5, camera.position.x));
        camera.position.z = Math.max(minZ - 5, Math.min(maxZ + 5, camera.position.z));
      }

      // Update minimap
      updateMinimap(camera, mineData);

      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      if (!viewerContainerRef.current) return;
      camera.aspect = viewerContainerRef.current.clientWidth / viewerContainerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(viewerContainerRef.current.clientWidth, viewerContainerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [processedData, addDust, addLights, updateMinimap]);

  // Create lighting
  const createLighting = (scene: any, mineData: MineData) => {
    const THREE = window.THREE;

    const ambient = new THREE.AmbientLight(CONFIG.lighting.ambient, 0.3);
    scene.add(ambient);

    if (!addLights) return;

    const lightPositions: { x: number; y: number; z: number }[] = [];

    if (mineData.rooms.length > 0) {
      mineData.rooms.forEach(room => {
        lightPositions.push({ x: room.center.x, y: 3, z: room.center.z });
      });
    }

    if (mineData.bounds) {
      const { minX, maxX, minZ, maxZ } = mineData.bounds;
      const midX = (minX + maxX) / 2;
      const midZ = (minZ + maxZ) / 2;
      lightPositions.push({ x: midX, y: 3, z: minZ + 5 });
      lightPositions.push({ x: midX, y: 3, z: maxZ - 5 });
      lightPositions.push({ x: midX, y: 3, z: midZ });
    }

    if (lightPositions.length === 0) {
      lightPositions.push({ x: 0, y: 3, z: -15 }, { x: 0, y: 3, z: -30 }, { x: 0, y: 3, z: -45 });
    }

    lightPositions.forEach(pos => {
      const light = new THREE.PointLight(CONFIG.lighting.point, 1, 30);
      light.position.set(pos.x, pos.y, pos.z);
      light.castShadow = true;
      scene.add(light);

      const fixtureGeom = new THREE.CylinderGeometry(0.1, 0.2, 0.3, 8);
      const fixtureMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
      const fixture = new THREE.Mesh(fixtureGeom, fixtureMat);
      fixture.position.set(pos.x, pos.y + 0.3, pos.z);
      scene.add(fixture);
    });
  };

  // Create flashlight
  const createFlashlight = (scene: any, camera: any) => {
    const THREE = window.THREE;

    const flashlight = new THREE.SpotLight(0xffffff, 2, 50, Math.PI / 6, 0.3, 1);
    flashlight.castShadow = true;
    flashlightRef.current = flashlight;

    const flashlightTarget = new THREE.Object3D();
    flashlightTarget.position.set(0, 0, -1);
    scene.add(flashlightTarget);
    flashlight.target = flashlightTarget;

    camera.add(flashlight);
    flashlight.position.set(0.3, -0.2, 0);
    scene.add(camera);

    const playerLight = new THREE.PointLight(0xffffee, 0.5, 8);
    camera.add(playerLight);
  };

  // Create mine geometry
  const createMineFromData = (scene: any, mineData: MineData) => {
    const THREE = window.THREE;

    // Create textures
    const rockTexture = createRockTexture();
    const floorTexture = createFloorTexture();

    const wallMaterial = new THREE.MeshStandardMaterial({
      map: rockTexture,
      roughness: 0.9,
      metalness: 0.1,
      bumpMap: rockTexture,
      bumpScale: 0.3,
      side: THREE.DoubleSide  // Make walls visible from both sides
    });

    const floorMaterial = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.95,
      metalness: 0.05
    });

    const ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 1,
      metalness: 0
    });

    // Floor and ceiling
    if (mineData.bounds) {
      const { minX, maxX, minZ, maxZ } = mineData.bounds;
      const width = maxX - minX + 20;
      const depth = maxZ - minZ + 20;
      const centerX = (minX + maxX) / 2;
      const centerZ = (minZ + maxZ) / 2;

      const floorGeom = new THREE.PlaneGeometry(width, depth);
      const floor = new THREE.Mesh(floorGeom, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(centerX, 0, centerZ);
      floor.receiveShadow = true;
      scene.add(floor);

      const ceiling = new THREE.Mesh(floorGeom, ceilingMaterial);
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.set(centerX, mineData.wallHeight, centerZ);
      scene.add(ceiling);
    }

    // Walls - using PlaneGeometry like ar-min repo for proper wall rendering
    mineData.walls.forEach(wall => {
      const dx = wall.end.x - wall.start.x;
      const dz = wall.end.z - wall.start.z;
      const length = Math.sqrt(dx * dx + dz * dz);

      // Skip walls that are too short
      if (length < 0.5) return;

      // Calculate angle - atan2(dz, dx) gives angle from X-axis
      const angle = Math.atan2(dz, dx);

      // Create wall as a plane (like ar-min) - DoubleSide material makes it visible from both sides
      const wallGeom = new THREE.PlaneGeometry(length, wall.height);
      const wallMesh = new THREE.Mesh(wallGeom, wallMaterial);

      const centerX = (wall.start.x + wall.end.x) / 2;
      const centerZ = (wall.start.z + wall.end.z) / 2;

      wallMesh.position.set(centerX, wall.height / 2, centerZ);
      // Rotate the plane to align with the wall direction
      // PlaneGeometry faces +Z by default, so we rotate to align with the wall vector
      wallMesh.rotation.y = -angle;
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      scene.add(wallMesh);
    });

    // Also log wall count for debugging
    console.log('Created', mineData.walls.length, 'walls in 3D scene');

    // Rails
    if (mineData.bounds) {
      const railMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.3 });
      const { minZ, maxZ } = mineData.bounds;
      const railLength = maxZ - minZ;

      const railGeom = new THREE.BoxGeometry(0.1, 0.1, railLength);
      const leftRail = new THREE.Mesh(railGeom, railMat);
      leftRail.position.set(-1.5, 0.05, (minZ + maxZ) / 2);
      scene.add(leftRail);

      const rightRail = new THREE.Mesh(railGeom, railMat);
      rightRail.position.set(-0.5, 0.05, (minZ + maxZ) / 2);
      scene.add(rightRail);
    }
  };

  // Create rock texture
  const createRockTexture = () => {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const gray = Math.floor(30 + Math.random() * 30);
      ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
      ctx.fillRect(x, y, 2, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  };

  // Create floor texture
  const createFloorTexture = () => {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#3d3428';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 300; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const size = 1 + Math.random() * 4;
      const gray = Math.floor(40 + Math.random() * 30);
      ctx.fillStyle = `rgb(${gray}, ${gray - 5}, ${gray - 10})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
  };

  // Create dust particles
  const createDustParticles = (scene: any, mineData: MineData) => {
    const THREE = window.THREE;
    if (!mineData.bounds) return;

    const { minX, maxX, minZ, maxZ } = mineData.bounds;
    const particleCount = 500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = minX + Math.random() * (maxX - minX);
      positions[i + 1] = Math.random() * mineData.wallHeight;
      positions[i + 2] = minZ + Math.random() * (maxZ - minZ);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x888888,
      size: 0.05,
      transparent: true,
      opacity: 0.6
    });

    const dustParticles = new THREE.Points(geometry, material);
    scene.add(dustParticles);
  };

  // Setup controls
  const setupControls = (canvas: HTMLCanvasElement, camera: any) => {
    const THREE = window.THREE;

    canvas.addEventListener('click', () => {
      canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      isPointerLockedRef.current = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (event) => {
      if (!isPointerLockedRef.current) return;

      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;

      eulerRef.current.y -= movementX * CONFIG.movement.sensitivity;
      eulerRef.current.x -= movementY * CONFIG.movement.sensitivity;
      eulerRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, eulerRef.current.x));

      const euler = new THREE.Euler(eulerRef.current.x, eulerRef.current.y, 0, 'YXZ');
      camera.quaternion.setFromEuler(euler);
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveStateRef.current.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveStateRef.current.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveStateRef.current.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveStateRef.current.right = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          moveStateRef.current.running = true;
          break;
        case 'KeyF':
          isFlashlightOnRef.current = !isFlashlightOnRef.current;
          if (flashlightRef.current) {
            flashlightRef.current.intensity = isFlashlightOnRef.current ? 2 : 0;
          }
          break;
        case 'Escape':
          document.exitPointerLock();
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveStateRef.current.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveStateRef.current.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveStateRef.current.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveStateRef.current.right = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          moveStateRef.current.running = false;
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
  };

  // Export mine data
  const exportMineData = () => {
    if (!processedData) return;

    const exportData = {
      name: 'Generated Mine',
      version: '1.0',
      generatedAt: new Date().toISOString(),
      settings: { wallHeight, scale },
      walls: processedData.walls,
      rooms: processedData.rooms,
      bounds: processedData.bounds
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mine_layout_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Back to upload
  const backToUpload = () => {
    setShowViewer(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (rendererRef.current) {
      rendererRef.current.dispose();
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    dropZoneRef.current?.classList.add('border-orange-500', 'bg-orange-50');
  };

  const handleDragLeave = () => {
    dropZoneRef.current?.classList.remove('border-orange-500', 'bg-orange-50');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dropZoneRef.current?.classList.remove('border-orange-500', 'bg-orange-50');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  // Calculate stats
  const wallCount = processedData?.walls.length || 0;
  const roomCount = processedData?.rooms.length || 0;
  const totalArea = processedData?.rooms.reduce((sum, room) => sum + room.area, 0).toFixed(1) || '0';

  return (
    <AppLayout>
      {/* Load Three.js */}
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
        onLoad={() => {
          console.log('Three.js script loaded');
          // Check if THREE is available
          const checkThreeReady = () => {
            if (window.THREE) {
              setThreeReady(true);
              console.log('Three.js is ready');
            } else {
              setTimeout(checkThreeReady, 100);
            }
          };
          checkThreeReady();
        }}
        strategy="afterInteractive"
      />
      {/* Load OpenCV.js */}
      <Script
        src="https://docs.opencv.org/4.x/opencv.js"
        onLoad={() => {
          console.log('OpenCV.js script loaded');
          // OpenCV.js loads asynchronously and needs time to initialize
          const checkCvReady = () => {
            if (window.cv && window.cv.Mat) {
              setCvReady(true);
              console.log('OpenCV.js is ready');
            } else {
              setTimeout(checkCvReady, 100);
            }
          };
          checkCvReady();
        }}
        strategy="afterInteractive"
      />

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-white/95 z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-stone-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-semibold text-orange-600 mb-2">Processing Blueprint...</h2>
            <p className="text-stone-500 mb-4">{processingStatus}</p>
            <div className="w-64 h-2 bg-stone-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 3D Viewer */}
      {showViewer ? (
        <div className="fixed inset-0 bg-stone-900 z-40">
          <div ref={viewerContainerRef} className="w-full h-full" />

          {/* HUD */}
          <div className="fixed inset-0 pointer-events-none z-50">
            {/* Info Panel */}
            <div className="absolute top-4 left-4 bg-white rounded-xl p-4 shadow-lg pointer-events-auto">
              <h3 className="text-xs font-semibold text-orange-600 tracking-wider mb-3 pb-2 border-b">
                GENERATED MINE
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-stone-500">Detected Rooms:</span>
                  <span className="font-medium">{roomCount}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-stone-500">Total Area:</span>
                  <span className="font-medium">{totalArea} m²</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-stone-500">Wall Segments:</span>
                  <span className="font-medium">{wallCount}</span>
                </div>
              </div>
            </div>

            {/* Minimap */}
            <div className="absolute top-4 right-4 bg-black/50 rounded-xl p-2 shadow-lg">
              <div className="text-xs font-semibold text-white tracking-wider mb-2 flex items-center gap-2">
                <Map size={14} />
                MINIMAP
              </div>
              <canvas
                ref={minimapCanvasRef}
                width={180}
                height={180}
                className="rounded-lg"
              />
            </div>

            {/* Action buttons */}
            <div className="absolute bottom-4 left-4 flex gap-2 pointer-events-auto">
              <button
                onClick={backToUpload}
                className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-lg shadow-lg hover:bg-stone-50 transition-colors"
              >
                <ArrowLeft size={18} className="text-orange-500" />
                New Blueprint
              </button>
              <button
                onClick={() => document.documentElement.requestFullscreen()}
                className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-lg shadow-lg hover:bg-stone-50 transition-colors"
              >
                <Maximize2 size={18} className="text-orange-500" />
                Fullscreen
              </button>
              <button
                onClick={exportMineData}
                className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-lg shadow-lg hover:bg-stone-50 transition-colors"
              >
                <Download size={18} className="text-orange-500" />
                Export JSON
              </button>
            </div>

            {/* Controls help */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow-lg text-xs text-stone-500">
              WASD/Arrow Keys: Move | Mouse: Look | Shift: Run | F: Flashlight | Click to start
            </div>

            {/* Crosshair */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-orange-500 opacity-70">
              +
            </div>
          </div>
        </div>
      ) : (
        /* Upload Panel */
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
          <div className="max-w-4xl w-full">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-400 mb-4">
                <Map className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-orange-600 mb-2">Blueprint to 3D Mine Converter</h1>
              <p className="text-stone-500">Upload a 2D mine blueprint to generate a navigable 3D environment</p>
            </div>

            {/* Drop Zone */}
            {!showPreview && (
              <div
                ref={dropZoneRef}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className="border-2 border-dashed border-stone-300 rounded-2xl p-16 text-center bg-white cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 transition-all"
              >
                <Upload className="w-16 h-16 text-orange-400 mx-auto mb-4" />
                <p className="text-lg text-stone-700 mb-2">Drag & drop your blueprint image here</p>
                <span className="text-stone-400 text-sm">or</span>
                <div className="mt-4">
                  <span className="inline-block px-6 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-full font-medium hover:shadow-lg transition-all">
                    Browse Files
                  </span>
                </div>
                <p className="text-stone-400 text-sm mt-4">Supports: PNG, JPG, JPEG (max 10MB)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  className="hidden"
                />
              </div>
            )}

            {/* Preview Section */}
            {showPreview && (
              <div className="space-y-6">
                {/* Preview Header */}
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-orange-600">Blueprint Preview</h3>
                  <button
                    onClick={() => {
                      setShowPreview(false);
                      setUploadedImage(null);
                      setProcessedData(null);
                    }}
                    className="px-4 py-2 border border-stone-200 rounded-lg text-sm hover:bg-stone-50 transition-colors"
                  >
                    Change File
                  </button>
                </div>

                {/* Preview Grid */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white border border-stone-200 rounded-xl p-4">
                    <h4 className="text-xs uppercase tracking-wider text-stone-400 mb-3">Original</h4>
                    <canvas ref={originalCanvasRef} className="max-w-full rounded-lg bg-stone-50" />
                  </div>
                  <div className="bg-white border border-stone-200 rounded-xl p-4">
                    <h4 className="text-xs uppercase tracking-wider text-stone-400 mb-3">Detected Walls</h4>
                    <canvas ref={processedCanvasRef} className="max-w-full rounded-lg bg-stone-50" />
                  </div>
                </div>

                {/* Settings */}
                <div className="bg-white border border-stone-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-orange-600 uppercase tracking-wider mb-4 pb-3 border-b flex items-center gap-2">
                    <Settings2 size={16} />
                    Processing Settings
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <label className="w-48 text-sm font-medium text-stone-700">Wall Detection Threshold</label>
                      <input
                        type="range"
                        min="50"
                        max="200"
                        value={threshold}
                        onChange={(e) => setThreshold(Number(e.target.value))}
                        className="flex-1 accent-orange-500"
                      />
                      <span className="w-12 text-right text-orange-600 font-semibold">{threshold}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="w-48 text-sm font-medium text-stone-700">Wall Height (meters)</label>
                      <input
                        type="range"
                        min="2"
                        max="8"
                        step="0.5"
                        value={wallHeight}
                        onChange={(e) => setWallHeight(Number(e.target.value))}
                        className="flex-1 accent-orange-500"
                      />
                      <span className="w-12 text-right text-orange-600 font-semibold">{wallHeight}m</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="w-48 text-sm font-medium text-stone-700">Scale Factor</label>
                      <input
                        type="range"
                        min="0.5"
                        max="3"
                        step="0.1"
                        value={scale}
                        onChange={(e) => setScale(Number(e.target.value))}
                        className="flex-1 accent-orange-500"
                      />
                      <span className="w-12 text-right text-orange-600 font-semibold">{scale}x</span>
                    </div>
                    <div className="flex gap-6 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={addLights}
                          onChange={(e) => setAddLights(e.target.checked)}
                          className="w-4 h-4 accent-orange-500"
                        />
                        <span className="text-sm text-stone-700">Auto-generate lighting</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={addDust}
                          onChange={(e) => setAddDust(e.target.checked)}
                          className="w-4 h-4 accent-orange-500"
                        />
                        <span className="text-sm text-stone-700">Add dust particles</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-orange-600">{wallCount}</div>
                    <div className="text-xs text-orange-500 uppercase tracking-wider">Wall Segments</div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-amber-600">{roomCount}</div>
                    <div className="text-xs text-amber-500 uppercase tracking-wider">Rooms Detected</div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-600">{totalArea}</div>
                    <div className="text-xs text-yellow-600 uppercase tracking-wider">Total Area (m²)</div>
                  </div>
                </div>

                {/* Generate Button */}
                <button
                  onClick={generate3DEnvironment}
                  disabled={!processedData || !threeReady}
                  className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play size={20} />
                  {!threeReady ? 'Loading 3D Engine...' : !processedData ? 'Processing Blueprint...' : 'Generate 3D Environment'}
                  <ChevronRight size={20} />
                </button>

                {/* Loading status indicator */}
                {(!threeReady || !cvReady) && (
                  <p className="text-center text-sm text-stone-400 mt-2">
                    {!threeReady && !cvReady ? 'Loading Three.js and OpenCV...' :
                     !threeReady ? 'Loading Three.js...' :
                     !cvReady ? 'Loading OpenCV...' : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
