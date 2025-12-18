import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Sparkles, Stars, Image, Loader } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing';
import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// ==========================================
// 1. TYPES & CONSTANTS
// ==========================================

enum AppMode {
  TREE = 'TREE',       // Fist: Gather into a tree
  SCATTER = 'SCATTER', // Open Palm: Explode/float
  INSPECT = 'INSPECT'  // Pinch/Grab: Look at a photo
}

interface HandGestureState {
  isHandDetected: boolean;
  gesture: 'FIST' | 'OPEN' | 'PINCH' | 'NONE';
  handPosition: { x: number; y: number }; // Normalized 0-1
}

const TREE_HEIGHT = 18;      
const TREE_RADIUS = 7.5;     

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

// Helper to generate tree cone position
const getTreeData = (index: number, total: number) => {
  const y = (index / total) * TREE_HEIGHT - (TREE_HEIGHT / 2); 
  const yPercent = (y + TREE_HEIGHT/2) / TREE_HEIGHT;
  const radiusAtHeight = ((TREE_HEIGHT / 2) - y) * (TREE_RADIUS / TREE_HEIGHT); 
  
  // Dense cone
  const r = radiusAtHeight * Math.pow(Math.random(), 0.4);
  const angle = index * 2.39996; // Golden angle
  const x = Math.cos(angle) * r;
  const z = Math.sin(angle) * r;

  return { pos: new THREE.Vector3(x, y, z), angle, r, radiusAtHeight, yPercent };
};

const getScatterPos = (): [number, number, number] => {
  return [
    (Math.random() - 0.5) * 50, 
    (Math.random() - 0.5) * 40,
    (Math.random() - 0.5) * 30,
  ];
};

// ==========================================
// 3. COMPONENTS
// ==========================================

// --- PARTICLE SYSTEM ---

const TreeFoliage: React.FC<{ mode: AppMode; count: number }> = ({ mode, count }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    
    // Base Colors
    const C_DARK_GREEN = new THREE.Color("#0a4f1c"); 
    const C_MID_GREEN = new THREE.Color("#2ec255"); 
    const C_LITE_GREEN = new THREE.Color("#66ff99"); 

    const GLOW_INTENSITY = 4.0;

    const particles = useMemo(() => {
        const data = [];
        for (let i = 0; i < count; i++) {
            const { pos } = getTreeData(i, count);
            
            const baseColor = new THREE.Color().lerpColors(C_DARK_GREEN, C_LITE_GREEN, Math.random());
            if (Math.random() > 0.8) baseColor.lerp(C_MID_GREEN, 0.5);
            
            const hdrColor = baseColor.clone().multiplyScalar(GLOW_INTENSITY);

            data.push({
                initialPos: new THREE.Vector3(...getScatterPos()),
                treePos: pos,
                currentPos: pos.clone(),
                scale: 0.08 + Math.random() * 0.06,
                color: hdrColor,
                phase: Math.random() * Math.PI * 2
            });
        }
        return data;
    }, [count]);

    const dummy = useMemo(() => new THREE.Object3D(), []);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        const time = state.clock.getElapsedTime();

        particles.forEach((p, i) => {
            const target = new THREE.Vector3();
            if (mode === AppMode.TREE) {
                target.copy(p.treePos);
                target.x += Math.sin(time * 0.5 + p.treePos.y) * 0.05;
            } else if (mode === AppMode.SCATTER) {
                target.copy(p.initialPos);
                target.y += Math.sin(time * 0.5 + p.phase) * 0.5;
            } else {
                target.copy(p.initialPos).multiplyScalar(2);
            }

            p.currentPos.lerp(target, delta * 3);
            dummy.position.copy(p.currentPos);
            dummy.scale.setScalar(p.scale);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    useEffect(() => {
        if(meshRef.current) {
            particles.forEach((p, i) => meshRef.current!.setColorAt(i, p.color));
            meshRef.current.instanceColor!.needsUpdate = true;
        }
    }, [particles]);

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
    )
}

const TreeRibbons: React.FC<{ mode: AppMode; count: number }> = ({ mode, count }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    const GOLD_INTENSITY = 30.0;
    const RED_INTENSITY = 25.0;

    const C_GOLD_BASE = new THREE.Color("#ffaa00");
    const C_RED_BASE = new THREE.Color("#ff0000");

    const particles = useMemo(() => {
        const data = [];
        for (let i = 0; i < count; i++) {
            const t = i / count;
            const y = t * TREE_HEIGHT - (TREE_HEIGHT / 2);
            const radiusAtHeight = ((TREE_HEIGHT / 2) - y) * (TREE_RADIUS / TREE_HEIGHT) + 0.6;
            
            const isRed = i % 2 === 0;
            const spiralFreq = 6.0;
            const angleOffset = isRed ? 0 : Math.PI;
            const angle = (y / TREE_HEIGHT) * Math.PI * 2 * spiralFreq + angleOffset;

            const spread = (Math.random() - 0.5) * 1.5;
            const finalAngle = angle + spread * 0.1;

            const x = Math.cos(finalAngle) * radiusAtHeight;
            const z = Math.sin(finalAngle) * radiusAtHeight;

            const color = isRed 
                ? C_RED_BASE.clone().multiplyScalar(RED_INTENSITY) 
                : C_GOLD_BASE.clone().multiplyScalar(GOLD_INTENSITY);

            const trailLength = 0.5 + Math.random() * 0.5; 

            data.push({
                initialPos: new THREE.Vector3(...getScatterPos()),
                treePos: new THREE.Vector3(x, y, z),
                currentPos: new THREE.Vector3(x, y, z),
                color: color,
                phase: Math.random() * Math.PI * 2,
                angle: finalAngle,
                radius: radiusAtHeight,
                y: y,
                trailLength
            });
        }
        return data;
    }, [count]);

    const dummy = useMemo(() => new THREE.Object3D(), []);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        const time = state.clock.getElapsedTime();

        particles.forEach((p, i) => {
            const target = new THREE.Vector3();
            
            if (mode === AppMode.TREE) {
                const flowSpeed = 1.0;
                const activeAngle = p.angle - time * flowSpeed; 
                
                target.set(
                    Math.cos(activeAngle) * p.radius,
                    p.y,
                    Math.sin(activeAngle) * p.radius
                );

                const tangent = new THREE.Vector3(
                    -Math.sin(activeAngle), 
                    0, 
                    Math.cos(activeAngle)
                ).normalize();

                dummy.position.copy(p.currentPos);
                const nextPos = dummy.position.clone().add(tangent);
                dummy.lookAt(nextPos);
                dummy.scale.set(0.1, 0.1, p.trailLength); 

            } else {
                 target.copy(p.initialPos);
                 target.y += Math.sin(time + p.phase);
                 dummy.position.copy(p.currentPos);
                 dummy.rotation.set(time * 0.5, time * 0.3, 0);
                 dummy.scale.set(0.1, 0.1, 0.1);
            }

            p.currentPos.lerp(target, delta * 5);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    useEffect(() => {
        if(meshRef.current) {
            particles.forEach((p, i) => meshRef.current!.setColorAt(i, p.color));
            meshRef.current.instanceColor!.needsUpdate = true;
        }
    }, [particles]);

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
    )
}

const SinglePhoto: React.FC<{ id: number; url: string; treePos: number[]; initialPos: number[]; mode: AppMode; isActive: boolean }> = ({ 
    id, url, treePos, initialPos, mode, isActive 
}) => {
    const ref = useRef<THREE.Group>(null);
    const targetPos = useRef(new THREE.Vector3());
    const currentPos = useRef(new THREE.Vector3(...treePos as [number, number, number]));
    
    useFrame((state, delta) => {
        if (!ref.current) return;
        const time = state.clock.getElapsedTime();

        if (mode === AppMode.TREE) {
            targetPos.current.set(treePos[0], treePos[1], treePos[2]);
            const angle = time * 0.2 + id;
            const r = Math.sqrt(treePos[0]**2 + treePos[2]**2);
            targetPos.current.x = Math.cos(angle) * r;
            targetPos.current.z = Math.sin(angle) * r;
        } else if (mode === AppMode.SCATTER) {
            targetPos.current.set(initialPos[0], initialPos[1], initialPos[2]);
            targetPos.current.x += Math.sin(time * 0.5 + id) * 0.5;
            targetPos.current.y += Math.cos(time * 0.3 + id) * 0.5;
        } else if (mode === AppMode.INSPECT) {
            if (isActive) {
                targetPos.current.set(0, 0, 15);
            } else {
                targetPos.current.set(initialPos[0], initialPos[1], initialPos[2]).multiplyScalar(2.0);
            }
        }

        currentPos.current.lerp(targetPos.current, delta * 3);
        ref.current.position.copy(currentPos.current);

        if (isActive && mode === AppMode.INSPECT) {
            ref.current.rotation.set(0, 0, 0);
            ref.current.scale.lerp(new THREE.Vector3(6, 6, 1), delta * 3);
        } else {
             ref.current.lookAt(0, currentPos.current.y, 0); 
             ref.current.scale.lerp(new THREE.Vector3(2, 2, 1), delta * 3);
        }
    });

    return (
        <Image 
            ref={ref as any}
            url={url}
            transparent
            position={treePos as any}
            toneMapped={false} 
        >
             <mesh position={[0,0,-0.05]} scale={[1.05, 1.05, 1]}>
                <planeGeometry />
                <meshStandardMaterial color="#D4AF37" metalness={1} roughness={0.2} emissive="#D4AF37" emissiveIntensity={0.2} />
             </mesh>
        </Image>
    )
}

const PhotoCollection: React.FC<{ mode: AppMode; photos: string[] }> = ({ mode, photos }) => {
    const [activeId, setActiveId] = useState<number | null>(null);
    const totalCount = 1000 + photos.length; 

    useEffect(() => {
        if (mode === AppMode.INSPECT && photos.length > 0) {
            const randomIdx = Math.floor(Math.random() * photos.length);
            setActiveId(randomIdx);
        } else {
            setActiveId(null);
        }
    }, [mode, photos]);

    return (
        <group>
            {photos.map((url, i) => {
                const { pos } = getTreeData(i * 10, totalCount); 
                pos.multiplyScalar(1.3); 
                
                return (
                    <SinglePhoto 
                        key={i}
                        id={i}
                        url={url}
                        treePos={pos.toArray()} 
                        initialPos={getScatterPos()}
                        mode={mode}
                        isActive={i === activeId}
                    />
                )
            })}
        </group>
    )
}

const ParticleSystem: React.FC<{ mode: AppMode; photos: string[] }> = ({ mode, photos }) => {
  return (
    <group>
      <TreeFoliage mode={mode} count={6000} />
      <TreeRibbons mode={mode} count={2000} />
      <PhotoCollection mode={mode} photos={photos} />
    </group>
  );
};

// --- EXPERIENCE (3D SCENE) ---

const StarShape = () => {
    return (
        <group scale={1.2}>
            <mesh>
                <octahedronGeometry args={[1, 0]} />
                <meshBasicMaterial color={[100, 100, 100]} toneMapped={false} />
            </mesh>
            <mesh rotation={[0, Math.PI/4, 0]} scale={1.4}>
                 <octahedronGeometry args={[0.8, 0]} />
                 <meshBasicMaterial color={[50, 35, 0]} toneMapped={false} />
            </mesh>
            <pointLight distance={25} intensity={100} color="#ffeedd" decay={2} />
        </group>
    )
}

const Experience: React.FC<{ mode: AppMode; photos: string[]; handPos: { x: number; y: number } }> = ({ mode, photos, handPos }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (groupRef.current && mode === AppMode.SCATTER) {
        const targetRotX = (handPos.y - 0.5) * 1.0;
        const targetRotY = (handPos.x - 0.5) * 1.0;
        
        groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotX, delta * 2);
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotY, delta * 2);
    } else if (groupRef.current && mode === AppMode.TREE) {
        groupRef.current.rotation.y += delta * 0.1;
        groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, delta * 2);
    }
  });

  return (
    <>
      <color attach="background" args={['#000200']} /> 
      
      <ambientLight intensity={1.0} color="#ffffff" /> 
      <spotLight position={[10, 20, 20]} angle={0.5} penumbra={1} intensity={500} color="#ffecd1" />
      <pointLight position={[-10, 5, -10]} intensity={200} color="#ff5555" />

      <Environment preset="night" background={false} />
      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />
      <Sparkles count={600} scale={45} size={8} speed={0.1} opacity={0.5} color="#fffbac" />

      <group ref={groupRef}>
        <ParticleSystem mode={mode} photos={photos} />
        <group position={[0, 9.2, 0]}>
           <StarShape />
        </group>
      </group>

      <EffectComposer disableNormalPass multisampling={4}>
        <Bloom luminanceThreshold={1.1} mipmapBlur intensity={2.5} radius={0.6} />
        <ToneMapping mode={THREE.ACESFilmicToneMapping} />
        <Vignette eskil={false} offset={0.1} darkness={0.6} />
      </EffectComposer>
    </>
  );
};

// --- HAND MANAGER ---

function detectGesture(landmarks: any[]): 'FIST' | 'OPEN' | 'PINCH' | 'NONE' {
    const isFingerExtended = (tipIdx: number, mcpIdx: number) => {
        const distTip = Math.hypot(landmarks[tipIdx].x - landmarks[0].x, landmarks[tipIdx].y - landmarks[0].y);
        const distMcp = Math.hypot(landmarks[mcpIdx].x - landmarks[0].x, landmarks[mcpIdx].y - landmarks[0].y);
        return distTip > distMcp * 1.5; 
    };

    const thumbExtended = isFingerExtended(4, 2); 
    const indexExtended = isFingerExtended(8, 5);
    const middleExtended = isFingerExtended(12, 9);
    const ringExtended = isFingerExtended(16, 13);
    const pinkyExtended = isFingerExtended(20, 17);

    const extendedCount = [thumbExtended, indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;

    const pinchDist = Math.hypot(landmarks[8].x - landmarks[4].x, landmarks[8].y - landmarks[4].y);
    
    if (pinchDist < 0.05) return 'PINCH'; 
    if (extendedCount === 5) return 'OPEN';
    if (extendedCount === 0) return 'FIST';
    
    return 'NONE';
}

const HandManager: React.FC<{ onGestureUpdate: (state: HandGestureState) => void; stream: MediaStream | null }> = ({ onGestureUpdate, stream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const [modelError, setModelError] = useState<boolean>(false);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  
  // 1. Load Model (Async, Independent of Stream)
  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
        );
        
        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        setModelLoaded(true);
        console.log("MediaPipe Model Loaded");
      } catch (e) {
        console.error("Error initializing MediaPipe:", e);
        setModelError(true);
      }
    };

    initMediaPipe();

    return () => {
       if (handLandmarkerRef.current) handLandmarkerRef.current.close();
    };
  }, []);

  // 2. Handle Stream & Prediction
  useEffect(() => {
    if (!stream || !videoRef.current || !modelLoaded || !handLandmarkerRef.current) return;

    // Set video source
    videoRef.current.srcObject = stream;
    
    // Start prediction loop only when video data is actually loaded
    const onLoadedData = () => {
       predictWebcam();
    };
    
    videoRef.current.addEventListener('loadeddata', onLoadedData);

    let lastVideoTime = -1;
    const predictWebcam = () => {
        if (!handLandmarkerRef.current || !videoRef.current) return;

        const startTimeMs = performance.now();
        if (videoRef.current.currentTime !== lastVideoTime) {
            lastVideoTime = videoRef.current.currentTime;
            try {
                const result = handLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);

                if (result.landmarks && result.landmarks.length > 0) {
                    const landmarks = result.landmarks[0]; 
                    const x = (landmarks[0].x + landmarks[9].x) / 2;
                    const y = (landmarks[0].y + landmarks[9].y) / 2;
                    
                    const gesture = detectGesture(landmarks);

                    onGestureUpdate({
                        isHandDetected: true,
                        gesture: gesture,
                        handPosition: { x: 1 - x, y } 
                    });
                } else {
                    onGestureUpdate({
                        isHandDetected: false,
                        gesture: 'NONE',
                        handPosition: { x: 0.5, y: 0.5 }
                    });
                }
            } catch (e) {
                console.warn("Prediction error", e);
            }
        }
        requestRef.current = requestAnimationFrame(predictWebcam);
    };

    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        if (videoRef.current) {
             videoRef.current.removeEventListener('loadeddata', onLoadedData);
        }
    }
  }, [stream, modelLoaded]);


  return (
    <>
        {/* Hidden Video Element for processing */}
        <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            webkit-playsinline="true" // Crucial for WeChat
            muted 
            className="fixed bottom-0 right-0 w-32 h-24 object-cover opacity-50 z-50 pointer-events-none"
            style={{ transform: 'scaleX(-1)' }}
        />
        
        {modelError && (
            <div className="fixed bottom-20 right-4 z-[60] bg-red-500/90 text-white p-4 rounded-lg shadow-lg max-w-[240px] text-sm backdrop-blur-md">
                <p className="font-bold">⚠️ AI 模型加载失败</p>
                <p>请检查网络连接 (需要访问 Google 服务)</p>
            </div>
        )}
    </>
  );
};

// --- LANDING SCREEN (NEW) ---
const LandingScreen: React.FC<{ onStart: () => void; error?: string }> = ({ onStart, error }) => {
    return (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="text-center space-y-8 animate-fade-in-up">
                 <h1 className="text-5xl md:text-7xl font-bold rainbow-text font-['Zcool_KuaiLe',_cursive] drop-shadow-[0_0_20px_rgba(255,0,0,0.5)]">
                    粥粥的圣诞礼物
                 </h1>
                 
                 <div className="bg-black/40 p-6 rounded-2xl border border-white/10 backdrop-blur-md max-w-md mx-auto">
                    <p className="text-white/90 text-lg mb-4">
                        这是一个基于手势互动的 3D 魔法体验。
                        <br/>
                        请允许使用摄像头来捕捉你的魔法手势。
                    </p>
                    <p className="text-white/50 text-sm mb-6">
                        👋 数据仅在本地处理，不会上传任何影像
                    </p>
                    
                    <button 
                        onClick={onStart}
                        className="group relative inline-flex items-center justify-center px-8 py-4 text-2xl font-bold text-white transition-all duration-200 bg-gradient-to-r from-red-600 to-red-800 rounded-full hover:from-red-500 hover:to-red-700 focus:outline-none focus:ring-4 focus:ring-red-500/50 shadow-[0_0_30px_rgba(220,38,38,0.5)] hover:shadow-[0_0_50px_rgba(220,38,38,0.8)] hover:scale-105 active:scale-95"
                    >
                        <span className="mr-2">🎄</span>
                         开启魔法
                        <span className="ml-2">✨</span>
                    </button>
                 </div>

                 {error && (
                     <div className="text-red-400 bg-red-900/30 px-4 py-2 rounded-lg border border-red-500/30">
                         {error}
                     </div>
                 )}
            </div>
        </div>
    )
}

// --- UI OVERLAY ---

const UIOverlay: React.FC<{ mode: AppMode; onPhotoUpload: (urls: string[]) => void; photoCount: number; currentGesture: string; visible: boolean }> = ({ mode, onPhotoUpload, photoCount, currentGesture, visible }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!visible) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newUrls: string[] = [];
      Array.from(e.target.files).forEach(file => {
        newUrls.push(URL.createObjectURL(file as Blob));
      });
      onPhotoUpload(newUrls);
    }
  };

  const gestureLabel = {
      'FIST': '✊ 聚合模式 (圣诞树)',
      'OPEN': '✋ 散开模式 (漫天星光)',
      'PINCH': '🤏 查看照片 (捏合)',
      'NONE': '正在寻找手势...'
  }[currentGesture] || '';

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-40">
      
      <div className="flex flex-col items-center">
        <h1 className="text-6xl md:text-8xl font-bold rainbow-text font-['Zcool_KuaiLe',_cursive] tracking-widest text-center drop-shadow-[0_0_15px_rgba(255,215,0,0.8)]">
          粥粥圣诞节快乐！
        </h1>
        <p className="text-amber-200 mt-2 font-['Zcool_KuaiLe',_cursive] text-xl tracking-wider opacity-80">
           挥动双手，点亮魔法
        </p>
      </div>

      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <div className="text-2xl text-white/50 font-mono bg-black/30 px-4 py-2 rounded-lg backdrop-blur-sm whitespace-nowrap">
             当前状态: {gestureLabel}
          </div>
          {mode === AppMode.INSPECT && (
              <div className="text-gold mt-2 animate-pulse text-yellow-400 font-bold tracking-widest">
                  正在回味美好瞬间...
              </div>
          )}
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between w-full pointer-events-auto bg-gradient-to-t from-black/80 to-transparent pb-4 pt-10 px-4 rounded-b-xl">
        <div className="text-white/80 text-sm md:text-base font-sans max-w-md space-y-1">
           <p><span className="text-green-400 font-bold">✊ 握拳:</span> 召唤圣诞树</p>
           <p><span className="text-yellow-400 font-bold">✋ 张开:</span> 散落漫天星光</p>
           <p><span className="text-red-400 font-bold">🤏 捏合:</span> 抓取美好回忆</p>
           <p><span className="text-blue-400 font-bold">👋 移动:</span> 旋转观察视角</p>
        </div>

        <div className="mt-4 md:mt-0 flex flex-col items-end">
          <input 
            type="file" 
            multiple 
            accept="image/*" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileChange}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-gradient-to-r from-red-800 to-red-600 hover:from-red-600 hover:to-red-400 text-white font-bold py-3 px-8 rounded-full shadow-[0_0_20px_rgba(196,30,58,0.6)] border border-yellow-500/30 transition-all transform hover:scale-105"
          >
            上传回忆 ({photoCount})
          </button>
          <p className="text-xs text-white/40 mt-1 mr-2">支持 JPG, PNG 格式</p>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 4. MAIN APP
// ==========================================

export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.TREE);
  const [photos, setPhotos] = useState<string[]>([]);
  const [handPos, setHandPos] = useState<{x: number, y: number}>({ x: 0.5, y: 0.5 });
  const [debugGesture, setDebugGesture] = useState<string>('NONE');
  
  // Game State
  const [gameStarted, setGameStarted] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [startError, setStartError] = useState<string>('');

  const handleStart = async () => {
      try {
          console.log("Requesting camera...");
          const stream = await navigator.mediaDevices.getUserMedia({
              video: {
                  width: { ideal: 640 },
                  height: { ideal: 480 },
                  facingMode: 'user' // Use front camera
              }
          });
          console.log("Camera access granted");
          setCameraStream(stream);
          setGameStarted(true);
      } catch (err: any) {
          console.error("Camera access denied:", err);
          if (err.name === 'NotAllowedError') {
              setStartError("请在设置中允许访问摄像头，然后刷新页面重试。");
          } else if (err.name === 'NotFoundError') {
              setStartError("未找到摄像头设备。");
          } else {
              setStartError("无法启动摄像头，请换个浏览器试试。");
          }
      }
  };

  const handleGestureUpdate = useCallback((state: HandGestureState) => {
    setHandPos(state.handPosition);
    setDebugGesture(state.gesture);

    if (state.gesture === 'FIST') {
      setMode(AppMode.TREE);
    } else if (state.gesture === 'OPEN') {
      setMode(AppMode.SCATTER);
    } else if (state.gesture === 'PINCH') {
       setMode((prev) => (prev !== AppMode.INSPECT && photos.length > 0 ? AppMode.INSPECT : prev));
    }
  }, [photos.length]);

  const handlePhotoUpload = (newPhotos: string[]) => {
    setPhotos(prev => [...prev, ...newPhotos]);
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* 3D Scene - Always rendered in background */}
      <div className="absolute inset-0 z-0">
        <Canvas
          shadows
          camera={{ position: [0, 2, 38], fov: 45 }}
          gl={{ antialias: false, toneMappingExposure: 1.5 }}
          dpr={[1, 2]} 
        >
          <Experience 
            mode={mode} 
            photos={photos} 
            handPos={handPos}
          />
        </Canvas>
        <Loader />
      </div>

      {/* Landing / Start Screen */}
      {!gameStarted && (
          <LandingScreen onStart={handleStart} error={startError} />
      )}

      {/* Logic Layer: MediaPipe - Only active after start */}
      <HandManager 
         stream={cameraStream} 
         onGestureUpdate={handleGestureUpdate} 
      />

      {/* UI Layer */}
      <UIOverlay 
        visible={gameStarted}
        mode={mode} 
        onPhotoUpload={handlePhotoUpload} 
        photoCount={photos.length}
        currentGesture={debugGesture}
      />
    </div>
  );
}

// ==========================================
// 5. ENTRY POINT
// ==========================================

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);