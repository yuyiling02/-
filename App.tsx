import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
import { HandType, EarthControlState, PanelState, HolographicEarthProps, HUDOverlayProps } from './types';

// --- 1. Helper Components & Constants ---

const EARTH_TEXTURE_URL = "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";

// Utility to get region from rotation longitude
const getRegionFromRotation = (yRotation: number): string => {
  // Normalize rotation to 0 - 2PI
  let normalized = yRotation % (Math.PI * 2);
  if (normalized < 0) normalized += Math.PI * 2;

  // Approximate mapping based on texture offset (Greenwich center usually)
  const deg = (normalized * 180) / Math.PI;
  
  if (deg > 330 || deg < 30) return "非洲 / 欧洲";
  if (deg >= 30 && deg < 120) return "美洲 (东部)";
  if (deg >= 120 && deg < 210) return "太平洋";
  if (deg >= 210 && deg < 300) return "亚洲 / 澳洲";
  return "大西洋";
};

// --- 2. 3D Components (Three.js) ---

const HolographicEarth: React.FC<HolographicEarthProps> = ({ controlRef, setContinent }) => {
  const groupRef = useRef<THREE.Group>(null);
  const earthRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const ringsRef = useRef<THREE.Group>(null);
  
  const earthMap = useLoader(THREE.TextureLoader, EARTH_TEXTURE_URL);

  useFrame((state, delta) => {
    if (!earthRef.current || !cloudsRef.current || !ringsRef.current || !groupRef.current) return;

    // Smooth interpolation for controls
    const targetScale = controlRef.current.scale;
    const targetRotY = controlRef.current.rotation.y;
    const targetRotX = controlRef.current.rotation.x;
    const targetPos = controlRef.current.position;

    // Lerp Position (Drag)
    groupRef.current.position.lerp(new THREE.Vector3(targetPos.x, targetPos.y, 0), 0.2);

    // Lerp Scale
    earthRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    cloudsRef.current.scale.lerp(new THREE.Vector3(targetScale * 1.02, targetScale * 1.02, targetScale * 1.02), 0.1);
    ringsRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);

    // Lerp Rotation
    earthRef.current.rotation.y = THREE.MathUtils.lerp(earthRef.current.rotation.y, targetRotY, 0.1);
    earthRef.current.rotation.x = THREE.MathUtils.lerp(earthRef.current.rotation.x, targetRotX, 0.1);
    
    // Sync clouds and rings slightly slower/faster for depth
    cloudsRef.current.rotation.y = earthRef.current.rotation.y * 1.1 + state.clock.getElapsedTime() * 0.05;
    cloudsRef.current.rotation.x = earthRef.current.rotation.x;
    
    ringsRef.current.rotation.y += 0.005;
    ringsRef.current.rotation.z = Math.sin(state.clock.getElapsedTime() * 0.2) * 0.1;

    // Calculate Region
    const currentRegion = getRegionFromRotation(earthRef.current.rotation.y);
    setContinent(currentRegion);
  });

  return (
    <group ref={groupRef} position={[-2.5, 0, 0]}> 
      {/* Ambient Light for base visibility */}
      <ambientLight intensity={0.5} color="#00ffff" />
      <pointLight position={[10, 10, 10]} intensity={2.0} color="#00ffff" />
      
      {/* Core Earth */}
      <mesh ref={earthRef}>
        <sphereGeometry args={[1.8, 64, 64]} />
        <meshStandardMaterial 
          map={earthMap} 
          color="#00ffff"
          emissive="#004444"
          emissiveIntensity={0.8}
          transparent
          opacity={0.9}
          wireframe={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Wireframe Cage / Clouds */}
      <mesh ref={cloudsRef}>
        <sphereGeometry args={[1.82, 32, 32]} />
        <meshBasicMaterial 
          color="#00ffff" 
          wireframe 
          transparent 
          opacity={0.15} 
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Decorative Rings */}
      <group ref={ringsRef} rotation={[Math.PI / 3, 0, 0]}>
         <mesh>
            <torusGeometry args={[2.6, 0.02, 16, 100]} />
            <meshBasicMaterial color="#00ffff" transparent opacity={0.6} blending={THREE.AdditiveBlending}/>
         </mesh>
         <mesh rotation={[Math.PI/2, 0, 0]}>
            <torusGeometry args={[3.2, 0.01, 16, 100]} />
            <meshBasicMaterial color="#00ffff" transparent opacity={0.3} blending={THREE.AdditiveBlending}/>
         </mesh>
      </group>
    </group>
  );
};

// --- 3. UI Components ---

const HexStream = () => {
  const [hex, setHex] = useState<string[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newCode = Math.random().toString(16).substring(2, 10).toUpperCase();
      setHex(prev => [newCode, ...prev.slice(0, 8)]);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="font-mono-tech text-[10px] text-cyan-700 leading-3 opacity-70">
      {hex.map((h, i) => (
        <div key={i}>{`0x${h} :: MEM_ADDR_${9000 - i * 16}`}</div>
      ))}
    </div>
  );
};

const HUDOverlay: React.FC<HUDOverlayProps> = ({ 
  handDetected, 
  activeRegion, 
  fps, 
  panelRef, 
  panelState,
  gestureStatus
}) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 text-cyan-400 font-sans">
      {/* Scanline Effect */}
      <div className="scanline"></div>
      
      {/* Vignette & Grid Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_50%,_rgba(0,20,20,0.8)_100%)]"></div>
      <div className="absolute inset-0 opacity-10" 
           style={{backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 255, 255, .3) 25%, rgba(0, 255, 255, .3) 26%, transparent 27%, transparent 74%, rgba(0, 255, 255, .3) 75%, rgba(0, 255, 255, .3) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 255, 255, .3) 25%, rgba(0, 255, 255, .3) 26%, transparent 27%, transparent 74%, rgba(0, 255, 255, .3) 75%, rgba(0, 255, 255, .3) 76%, transparent 77%, transparent)', backgroundSize: '50px 50px'}}>
      </div>

      {/* Top Left: System Status */}
      <div className="absolute top-8 left-8 p-4 border-l-2 border-t-2 border-cyan-500 bg-black/40 backdrop-blur-sm rounded-tl-lg">
        <div className="text-xs font-bold tracking-widest mb-2">系统诊断程序</div>
        <div className="flex gap-4 items-center mb-2">
           <div className="w-3 h-3 bg-cyan-500 animate-pulse rounded-full"></div>
           <span className="font-mono-tech text-sm">在线</span>
        </div>
        <div className="font-mono-tech text-xs text-cyan-300">帧率: {fps}</div>
        <div className="h-[1px] w-full bg-cyan-800 my-2"></div>
        <HexStream />
      </div>

      {/* Top Right: Title & Time */}
      <div className="absolute top-8 right-8 text-right">
         <h1 className="text-6xl font-bold tracking-tighter glow-text" style={{ fontFamily: 'Rajdhani' }}>
           贾维斯 (J.A.R.V.I.S)
         </h1>
         <div className="text-2xl font-mono-tech mt-1 tracking-widest">
           {time.toLocaleTimeString()}
         </div>
         <div className="mt-2 flex justify-end gap-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="w-8 h-2 bg-cyan-900/50 overflow-hidden">
                 <div className="h-full bg-cyan-400 animate-pulse" style={{ width: `${Math.random() * 100}%`, animationDuration: `${0.5 + i * 0.2}s`}}></div>
              </div>
            ))}
         </div>
      </div>

      {/* Bottom Left: Hand Status */}
      <div className="absolute bottom-8 left-8 w-80">
        <div className="flex items-center justify-between border-b border-cyan-600 pb-2 mb-2">
          <span className="text-sm font-bold">生物特征追踪</span>
          <span className={`text-xs font-mono-tech px-2 py-0.5 rounded ${handDetected ? 'bg-cyan-500/20 text-cyan-300' : 'bg-red-900/20 text-red-400'}`}>
            {handDetected ? '已锁定' : '搜索中...'}
          </span>
        </div>
        <div className="flex gap-2">
            <div className="flex-1 bg-black/50 p-2 border border-cyan-900 rounded text-xs">
              <div className="text-cyan-600 mb-1">左手 (LH)</div>
              <div className="font-mono-tech text-cyan-200">
                {gestureStatus.includes("左手") ? gestureStatus.split(":")[1] : "待命"}
              </div>
            </div>
            <div className="flex-1 bg-black/50 p-2 border border-cyan-900 rounded text-xs">
              <div className="text-cyan-600 mb-1">右手 (RH)</div>
              <div className="font-mono-tech text-cyan-200">
                 {gestureStatus.includes("右手") ? gestureStatus.split(":")[1] : "待命"}
              </div>
            </div>
        </div>
      </div>

      {/* Floating Panel - Geodata (Bottom Right Compact) */}
      <div 
        ref={panelRef}
        className="absolute bottom-8 right-8 w-64 bg-black/60 border border-cyan-500/50 backdrop-blur-md p-3 rounded-lg transition-colors duration-200 pointer-events-auto"
      >
        <div className="flex justify-between items-center mb-2 border-b border-cyan-800 pb-1">
          <h3 className="text-base font-bold text-cyan-100">地理情报分析</h3>
          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping"></div>
        </div>
        
        <div className="space-y-3">
          <div>
             <div className="text-[10px] text-cyan-500 mb-0.5">目标区域</div>
             <div className="text-lg font-mono-tech glow-text truncate">{activeRegion}</div>
          </div>
          
          <div>
             <div className="text-[10px] text-cyan-500 mb-0.5">大气层扫描</div>
             <div className="flex items-end gap-0.5 h-8">
               {[40, 70, 30, 90, 50, 60, 20, 80].map((h, i) => (
                 <div key={i} className="flex-1 bg-cyan-900/40 flex items-end">
                   <div 
                      className="w-full bg-cyan-400/60 transition-all duration-500"
                      style={{ height: `${h}%` }}
                   ></div>
                 </div>
               ))}
             </div>
          </div>

          <div className="p-2 bg-cyan-900/20 rounded border border-cyan-900/50 text-[10px] font-mono-tech leading-tight">
            数据包 ID: {Math.floor(Date.now() / 1000)}<br/>
            加密协议: AES-256-GCM<br/>
            状态: 已同步
          </div>
        </div>

        {/* Decorative corners */}
        <div className="absolute -top-1 -left-1 w-1.5 h-1.5 border-t border-l border-cyan-400"></div>
        <div className="absolute -top-1 -right-1 w-1.5 h-1.5 border-t border-r border-cyan-400"></div>
        <div className="absolute -bottom-1 -left-1 w-1.5 h-1.5 border-b border-l border-cyan-400"></div>
        <div className="absolute -bottom-1 -right-1 w-1.5 h-1.5 border-b border-r border-cyan-400"></div>
      </div>
    </div>
  );
};

// --- 4. Main App Logic ---

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  
  // Shared State
  const [loading, setLoading] = useState(true);
  const [fps, setFps] = useState(0);
  const [handDetected, setHandDetected] = useState(false);
  const [activeRegion, setActiveRegion] = useState("初始化中...");
  const [gestureStatus, setGestureStatus] = useState("等待输入...");
  
  // Refs for high-frequency updates (avoid react re-renders)
  const earthControl = useRef<EarthControlState>({
    rotation: { x: 0, y: 0 },
    scale: 1,
    position: { x: -2.5, y: 0 },
    activeRegion: "ATLANTIC",
  });
  
  // Panel state is technically unused now for positioning, but kept for interface compatibility
  const [panelState] = useState<PanelState>({
    x: 0,
    y: 0,
    isDragging: false
  });

  // Animation Loop Ref
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  const startWebcam = useCallback(async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 1280,
          height: 720,
          facingMode: "user"
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener("loadeddata", predictWebcam);
      }
    }
  }, []);

  const predictWebcam = useCallback(async () => {
    // Initialize MediaPipe
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    
    const handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2
    });

    setLoading(false);

    const renderLoop = (time: number) => {
      // FPS Calc
      const delta = time - lastTimeRef.current;
      if (delta >= 1000) {
         setFps(Math.round(1000 / (delta / (time % 1000 || 1)))); // Approx
         lastTimeRef.current = time;
      }

      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Resize canvas to match video
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      // Detect Hands
      const startTimeMs = performance.now();
      const result = handLandmarker.detectForVideo(video, startTimeMs);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const drawingUtils = new DrawingUtils(ctx);

      let isHandPresent = false;
      let statusString = "";
      
      // Calculate 3D Viewport Width for Drag mapping
      // Visible height at z=0 with fov 45, dist 5: 2 * tan(22.5) * 5 ~= 4.14
      const vHeight = 4.14;
      const vWidth = vHeight * (window.innerWidth / window.innerHeight);

      if (result.landmarks && result.landmarks.length > 0) {
        isHandPresent = true;

        // Iterate through all hands
        for (let i = 0; i < result.landmarks.length; i++) {
          const landmarks = result.landmarks[i];
          const handedness = result.handedness[i][0].categoryName; // "Left" or "Right"
          
          // Draw cyberpunk skeleton
          drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
            color: handedness === "Left" ? "#00ffff" : "#ff00ff", // Different color for LH/RH
            lineWidth: 2,
          });
          drawingUtils.drawLandmarks(landmarks, {
            color: "#ffffff",
            lineWidth: 1,
            radius: 3
          });

          const palmCenter = landmarks[9];
          const thumbTip = landmarks[4];
          const indexTip = landmarks[8];
          
          // Calculate Screen Coordinates for this hand (Mirrored X)
          const visualX = 1 - palmCenter.x;
          const visualY = palmCenter.y;
          
          // Calculate Pinch Distance (Thumb to Index)
          const pinchDist = Math.sqrt(
             Math.pow(thumbTip.x - indexTip.x, 2) + 
             Math.pow(thumbTip.y - indexTip.y, 2)
          );
          
          // --- LOGIC SPLIT BASED ON HANDEDNESS ---
          
          // NOTE: MediaPipe "Left" usually means the person's physical Left hand.
          // In Mirrored Selfie view, the Physical Left Hand appears on the Left side of the screen.
          // The Physical Right Hand appears on the Right side of the screen.
          
          // Requirement: "Left hand pinch status... Earth follows left hand"
          // Requirement: "Right hand palm X/Y ... Rotate", "Right hand thumb/index ... Scale"

          if (handedness === "Left") {
            // --- LEFT HAND: DRAG ---
            if (pinchDist < 0.05) { // Threshold for "Pinch"
               statusString = "左手: 拖拽中";
               // Map screen position to World Position
               // Center (0.5, 0.5) -> (0, 0)
               const worldX = (visualX - 0.5) * vWidth;
               const worldY = -(visualY - 0.5) * vHeight; // Invert Y
               earthControl.current.position = { x: worldX, y: worldY };
            } else {
               statusString = "左手: 待命 (捏合以拖拽)";
            }
          } 
          else if (handedness === "Right") {
            // --- RIGHT HAND: ROTATE & SCALE ---
            statusString = "右手: 旋转/缩放";
            
            // 1. ROTATE (Follow Hand Position)
            // Map 0..1 to -3..3 radians approx
            earthControl.current.rotation.y = (visualX - 0.5) * 6;
            earthControl.current.rotation.x = (visualY - 0.5) * 4;

            // 2. SCALE (Finger Distance)
            // pinchDist range approx: 0.01 (closed) to 0.25 (wide open)
            // Map to scale 0.5 to 3.5
            // Formula: scale = base + (dist * factor)
            const newScale = Math.max(0.5, Math.min(3.5, 0.5 + (pinchDist * 10)));
            earthControl.current.scale = newScale;
          }
        }
      } else {
         statusString = "等待信号...";
      }
      
      setHandDetected(isHandPresent);
      setGestureStatus(statusString);
      
      requestRef.current = requestAnimationFrame(() => renderLoop(performance.now()));
    };

    renderLoop(performance.now());
  }, []);

  useEffect(() => {
    startWebcam();
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">
      
      {/* Layer 0: Webcam Video (Hidden/Processed) */}
      <video
        ref={videoRef}
        className="absolute top-0 left-0 w-full h-full object-cover opacity-40 filter contrast-125 brightness-75 grayscale-[50%]"
        style={{ transform: 'scaleX(-1)' }} // Mirror effect
        autoPlay
        playsInline
        muted
      />
      
      {/* Layer 1: 2D Canvas for Skeleton Drawing */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full object-cover pointer-events-none"
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* Layer 2: 3D Holographic Scene */}
      <div className="absolute inset-0 z-10">
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }} gl={{ alpha: true, antialias: true }}>
             {!loading && (
               <HolographicEarth 
                  controlRef={earthControl} 
                  setContinent={setActiveRegion} 
               />
             )}
        </Canvas>
      </div>

      {/* Layer 3: HUD UI */}
      <HUDOverlay 
        handDetected={handDetected}
        activeRegion={activeRegion}
        fps={fps}
        panelRef={panelRef}
        panelState={panelState}
        gestureStatus={gestureStatus}
      />

      {/* Loading Screen */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black text-cyan-500">
           <div className="text-center">
             <div className="text-4xl font-bold animate-pulse mb-4">正在初始化 J.A.R.V.I.S.</div>
             <div className="text-sm font-mono-tech">加载神经网络...</div>
             <div className="w-64 h-1 bg-cyan-900 mt-4 overflow-hidden">
               <div className="h-full bg-cyan-400 animate-[width_2s_ease-in-out_infinite] w-1/2"></div>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;