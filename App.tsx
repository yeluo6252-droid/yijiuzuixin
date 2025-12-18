import React, { useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { AppMode, HandGestureState } from './types.ts';
import { Experience } from './components/Experience.tsx';
import { UIOverlay } from './components/UIOverlay.tsx';
import { HandManager } from './components/HandManager.tsx';
import { Loader } from '@react-three/drei';

export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.TREE);
  const [photos, setPhotos] = useState<string[]>([]);
  // We track hand position for camera parallax
  const [handPos, setHandPos] = useState<{x: number, y: number}>({ x: 0.5, y: 0.5 });
  const [debugGesture, setDebugGesture] = useState<string>('NONE');

  const handleGestureUpdate = useCallback((state: HandGestureState) => {
    setHandPos(state.handPosition);
    setDebugGesture(state.gesture);

    // State Machine based on gestures
    if (state.gesture === 'FIST') {
      setMode(AppMode.TREE);
    } else if (state.gesture === 'OPEN') {
      // Only switch to scatter if we aren't currently inspecting (or force it)
      // For smoother UX, OPEN always forces SCATTER
      setMode(AppMode.SCATTER);
    } else if (state.gesture === 'PINCH') {
       // Only enter inspect mode if we have photos and aren't already inspecting
       setMode((prev) => (prev !== AppMode.INSPECT && photos.length > 0 ? AppMode.INSPECT : prev));
    }
  }, [photos.length]);

  const handlePhotoUpload = (newPhotos: string[]) => {
    setPhotos(prev => [...prev, ...newPhotos]);
  };

  return (
    <div className="relative w-full h-screen bg-black">
      {/* 3D Scene */}
      <div className="absolute inset-0 z-0">
        <Canvas
          shadows
          // Moved camera back (z: 38) and slightly up (y: 2) to fit the whole 18-unit tree
          camera={{ position: [0, 2, 38], fov: 45 }}
          // Slightly higher exposure to let the glow breathe
          gl={{ antialias: false, toneMappingExposure: 1.5 }}
          dpr={[1, 2]} // Optimize for pixel ratio
        >
          <Experience 
            mode={mode} 
            photos={photos} 
            handPos={handPos}
          />
        </Canvas>
        <Loader />
      </div>

      {/* Logic Layer: MediaPipe */}
      <HandManager onGestureUpdate={handleGestureUpdate} />

      {/* UI Layer */}
      <UIOverlay 
        mode={mode} 
        onPhotoUpload={handlePhotoUpload} 
        photoCount={photos.length}
        currentGesture={debugGesture}
      />
    </div>
  );
}