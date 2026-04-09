import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import type { FrameData, DetectedObject } from "@/lib/detection";

interface GaussianSceneProps {
  isRunning: boolean;
  healingEnabled: boolean;
  frameData: FrameData | null;
}

const GaussianScene = ({ isRunning, healingEnabled, frameData }: GaussianSceneProps) => {
  return (
    <div className="panel-glass h-full flex flex-col">
      <div className="panel-header">Main Feature – Live 3D Gaussian Digital Twin</div>
      <div className="px-4 py-1.5 text-xs text-muted-foreground flex items-center justify-between">
        <span>Real-time Gaussian Splatting · Object-aware point clouds</span>
        {frameData && isRunning && (
          <span className="text-primary font-mono text-[10px]">
            {frameData.pointCount.toLocaleString()} pts · {frameData.objects.length} objects
          </span>
        )}
      </div>
      <div className="flex-1 relative">
        <Canvas camera={{ position: [0, 10, 18], fov: 50 }} gl={{ antialias: true }}>
          <ambientLight intensity={0.3} />
          <directionalLight position={[10, 15, 10]} intensity={0.6} />
          <Scene isRunning={isRunning} healingEnabled={healingEnabled} frameData={frameData} />
          <OrbitControls enableDamping dampingFactor={0.1} maxPolarAngle={Math.PI / 2.2} />
        </Canvas>

        {/* Object legend */}
        <div className="absolute bottom-3 left-3 flex gap-2 text-[10px]">
          {[
            { label: "Car", color: "#e8eaf0" },
            { label: "Person", color: "#facc15" },
            { label: "Bike", color: "#06b6d4" },
            { label: "Truck", color: "#f97316" },
            { label: "Obstacle", color: "#a855f7" },
          ].map((item) => (
            <span key={item.label} className="flex items-center gap-1 bg-background/70 px-1.5 py-0.5 rounded">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>

        {/* State legend */}
        <div className="absolute top-2 right-3 flex gap-2 text-[10px]">
          <span className="bg-background/70 px-1.5 py-0.5 rounded text-muted-foreground">
            Sparse = Occluded · Dense = Healed
          </span>
        </div>
      </div>
    </div>
  );
};

function Scene({ isRunning, healingEnabled, frameData }: { isRunning: boolean; healingEnabled: boolean; frameData: FrameData | null }) {
  return (
    <>
      <RoadGrid />
      <EgoPath />
      {frameData && <LivePointCloud frameData={frameData} isRunning={isRunning} />}
      {frameData && frameData.objects.map((obj) => (
        <ObjectLabel key={obj.id} obj={obj} />
      ))}
      <HeadlightBeam />
    </>
  );
}

function LivePointCloud({ frameData, isRunning }: { frameData: FrameData; isRunning: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const prevPositions = useRef<Float32Array | null>(null);
  const currentPositions = useRef<Float32Array | null>(null);
  const targetPositions = useRef<Float32Array | null>(null);
  const lerpFactor = useRef(1);

  useEffect(() => {
    if (!frameData) return;
    // Store previous as current, set new target
    if (currentPositions.current && currentPositions.current.length === frameData.gaussianPoints.length) {
      prevPositions.current = new Float32Array(currentPositions.current);
    } else {
      prevPositions.current = new Float32Array(frameData.gaussianPoints);
    }
    targetPositions.current = new Float32Array(frameData.gaussianPoints);
    lerpFactor.current = 0;
  }, [frameData]);

  useFrame((_, delta) => {
    if (!pointsRef.current || !isRunning) return;
    const geom = pointsRef.current.geometry;

    // Interpolate positions for smooth transitions
    if (prevPositions.current && targetPositions.current && lerpFactor.current < 1) {
      lerpFactor.current = Math.min(1, lerpFactor.current + delta * 5);
      const t = lerpFactor.current;
      const len = Math.min(prevPositions.current.length, targetPositions.current.length);
      if (!currentPositions.current || currentPositions.current.length !== len) {
        currentPositions.current = new Float32Array(len);
      }
      for (let i = 0; i < len; i++) {
        currentPositions.current[i] = prevPositions.current[i] + (targetPositions.current[i] - prevPositions.current[i]) * t;
      }
      const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
      if (posAttr && posAttr.array.length === len) {
        (posAttr.array as Float32Array).set(currentPositions.current);
        posAttr.needsUpdate = true;
      }
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[frameData.gaussianPoints, 3]} />
        <bufferAttribute attach="attributes-color" args={[frameData.gaussianColors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function ObjectLabel({ obj }: { obj: DetectedObject }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      // Slight glow for healed objects
      if (obj.state === "healed") {
        meshRef.current.scale.setScalar(1 + Math.sin(Date.now() * 0.005) * 0.1);
      }
    }
  });

  const color = obj.state === "healed" ? "#22c55e" : obj.state === "occluded" ? "#ef4444" : "#3b82f6";

  return (
    <mesh ref={meshRef} position={[obj.pos3d.x, obj.pos3d.y + 2.5, obj.pos3d.z]}>
      <sphereGeometry args={[0.12, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.7} />
    </mesh>
  );
}

function RoadGrid() {
  const gridLines = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = -20; i <= 20; i += 2) {
      points.push(new THREE.Vector3(i, 0, -25));
      points.push(new THREE.Vector3(i, 0, 20));
      points.push(new THREE.Vector3(-20, 0, i));
      points.push(new THREE.Vector3(20, 0, i));
    }
    return points;
  }, []);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[new Float32Array(gridLines.flatMap((v) => [v.x, v.y, v.z])), 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#1a2030" transparent opacity={0.5} />
    </lineSegments>
  );
}

function EgoPath() {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let z = -25; z <= 10; z += 0.5) {
      pts.push(new THREE.Vector3(Math.sin(z * 0.1) * 2, 0.05, z));
    }
    return pts;
  }, []);
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);

  return <primitive object={new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#3b82f6" }))} />;
}

function HeadlightBeam() {
  const geometry = useMemo(() => {
    const shape = new THREE.BufferGeometry();
    shape.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
      -0.5, 0.3, 8, 0.5, 0.3, 8, -4, 0.01, -20, 4, 0.01, -20,
      -0.5, 0.3, 8, -4, 0.01, -20, 0.5, 0.3, 8, 4, 0.01, -20,
    ]), 3));
    return shape;
  }, []);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color="#4499ff" transparent opacity={0.06} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default GaussianScene;
