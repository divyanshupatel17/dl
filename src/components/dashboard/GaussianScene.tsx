import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { DetectedObject, FrameData } from "@/lib/detection";

interface GaussianSceneProps {
  isRunning: boolean;
  healingEnabled: boolean;
  frameData: FrameData | null;
}

const LABEL_COLORS: Record<string, string> = {
  car: "#dbe7ff",
  truck: "#f59e0b",
  bus: "#fbbf24",
  person: "#facc15",
  bike: "#22d3ee",
  motorcycle: "#2dd4bf",
};

const GaussianScene = ({ isRunning, frameData }: GaussianSceneProps) => {
  return (
    <div className="panel-glass h-full flex flex-col">
      <div className="panel-header">Main Feature - True 3D Gaussian Digital Twin</div>
      <div className="px-4 py-1.5 text-xs text-muted-foreground flex items-center justify-between">
        <span>Live camera frustum, road geometry, and object point-cloud reconstruction</span>
        {frameData && isRunning && (
          <span className="text-primary font-mono text-[10px]">
            {frameData.pointCount.toLocaleString()} pts · {frameData.objects.length} objects
          </span>
        )}
      </div>

      <div className="flex-1 relative">
        <Canvas camera={{ position: [0, 8.5, 22], fov: 42 }} gl={{ antialias: true }}>
          <color attach="background" args={["#0b1220"]} />
          <fog attach="fog" args={["#0b1220", 40, 90]} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[8, 14, 10]} intensity={0.8} />
          <pointLight position={[0, 3, 18]} intensity={0.35} color="#60a5fa" />

          <MovingRoadWorld frameData={frameData} isRunning={isRunning} />
          <CameraRig />
          <CameraFrustum />
          {frameData && <GaussianPointCloud frameData={frameData} isRunning={isRunning} />}
          {frameData && frameData.objects.map((obj) => <ObjectHalo key={obj.id} obj={obj} />)}

          <OrbitControls enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.08} minDistance={9} maxDistance={44} />
        </Canvas>

        <div className="absolute top-2 right-3 flex gap-2 text-[10px]">
          <span className="bg-background/70 px-1.5 py-0.5 rounded text-muted-foreground">Camera FOV + live Gaussian points</span>
        </div>

        <div className="absolute bottom-3 left-3 flex gap-2 text-[10px]">
          {Object.entries(LABEL_COLORS).map(([label, color]) => (
            <span key={label} className="flex items-center gap-1 bg-background/70 px-1.5 py-0.5 rounded">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {label[0].toUpperCase() + label.slice(1)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

function MovingRoadWorld({ frameData, isRunning }: { frameData: FrameData | null; isRunning: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const laneRef = useRef<THREE.Group>(null);

  const speedRef = useRef(0);
  const yawRef = useRef(0);
  const lateralRef = useRef(0);
  const targetSpeedRef = useRef(0);
  const targetYawRef = useRef(0);
  const targetLateralRef = useRef(0);
  const laneScrollRef = useRef(0);

  useEffect(() => {
    if (!frameData) return;
    const motion = frameData.metrics.egoMotion;
    const q = Math.max(0.3, Math.min(1, motion.quality));
    targetSpeedRef.current = motion.forward * 38 * q;
    targetYawRef.current = motion.yaw * 2.8 * q;
    targetLateralRef.current = motion.lateral * 22 * q;
  }, [frameData]);

  useFrame((_, delta) => {
    if (!isRunning) return;
    const g = groupRef.current;
    if (!g) return;

    speedRef.current += (targetSpeedRef.current - speedRef.current) * 0.08;
    yawRef.current += (targetYawRef.current - yawRef.current) * 0.08;
    lateralRef.current += (targetLateralRef.current - lateralRef.current) * 0.1;
    laneScrollRef.current += speedRef.current * delta;

    g.position.x = -lateralRef.current;
    g.rotation.y = -yawRef.current;
    const period = 14;
    g.position.z = ((laneScrollRef.current % period) + period) % period;

    if (laneRef.current) {
      laneRef.current.position.z = -(((laneScrollRef.current * 1.7) % 4) + 4) % 4;
    }
  });

  return (
    <group ref={groupRef}>
      <RoadSurface />
      <group ref={laneRef}>
        <LaneMarkers />
      </group>
      <EgoPath />
    </group>
  );
}

function RoadSurface() {
  return (
    <mesh position={[0, 0, -12]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[24, 72]} />
      <meshStandardMaterial color="#1c2231" roughness={0.9} metalness={0.08} />
    </mesh>
  );
}

function LaneMarkers() {
  const laneLines = useMemo(() => {
    const pts: number[] = [];
    const xValues = [-4.5, -1.5, 1.5, 4.5];
    for (const x of xValues) {
      for (let z = 18; z >= -46; z -= 2.8) {
        pts.push(x, 0.03, z, x, 0.03, z - 1.4);
      }
    }
    return new Float32Array(pts);
  }, []);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[laneLines, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#cbd5e1" transparent opacity={0.8} />
    </lineSegments>
  );
}

function CameraRig() {
  return (
    <group position={[0, 0.45, 17.5]}>
      <mesh>
        <boxGeometry args={[1.5, 0.45, 2.5]} />
        <meshStandardMaterial color="#89a7d8" roughness={0.5} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.28, 1.3]}>
        <boxGeometry args={[0.34, 0.22, 0.35]} />
        <meshStandardMaterial color="#c2d8ff" />
      </mesh>
    </group>
  );
}

function CameraFrustum() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const verts = new Float32Array([
      0, 0.7, 17.9, -6.5, 0.01, -44,
      0, 0.7, 17.9, 6.5, 0.01, -44,
      -6.5, 0.01, -44, 6.5, 0.01, -44,
    ]);
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    return g;
  }, []);

  return (
    <>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color="#60a5fa" transparent opacity={0.6} />
      </lineSegments>
      <mesh position={[0, 0, -13]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[6.6, 62, 48, 1, true]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.05} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

function EgoPath() {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let z = 18; z >= -40; z -= 0.45) {
      const drift = Math.sin((z + 40) * 0.08) * 0.9;
      pts.push(new THREE.Vector3(drift, 0.04, z));
    }
    return pts;
  }, []);
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);

  return <primitive object={new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#60a5fa" }))} />;
}

function GaussianPointCloud({ frameData, isRunning }: { frameData: FrameData; isRunning: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const previous = useRef<Float32Array | null>(null);
  const current = useRef<Float32Array | null>(null);
  const target = useRef<Float32Array | null>(null);
  const tRef = useRef(1);

  useEffect(() => {
    if (current.current && current.current.length === frameData.gaussianPoints.length) {
      previous.current = new Float32Array(current.current);
    } else {
      previous.current = new Float32Array(frameData.gaussianPoints);
    }
    target.current = new Float32Array(frameData.gaussianPoints);
    tRef.current = 0;
  }, [frameData]);

  useFrame((_, delta) => {
    if (!pointsRef.current || !isRunning) return;
    if (!previous.current || !target.current) return;

    tRef.current = Math.min(1, tRef.current + delta * 4.2);
    const t = tRef.current;
    const len = Math.min(previous.current.length, target.current.length);

    if (!current.current || current.current.length !== len) {
      current.current = new Float32Array(len);
    }

    for (let i = 0; i < len; i++) {
      current.current[i] = previous.current[i] + (target.current[i] - previous.current[i]) * t;
    }

    const geom = pointsRef.current.geometry;
    const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
    if (posAttr && posAttr.array.length === len) {
      (posAttr.array as Float32Array).set(current.current);
      posAttr.needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[frameData.gaussianPoints, 3]} />
        <bufferAttribute attach="attributes-color" args={[frameData.gaussianColors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.065}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.88}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function ObjectHalo({ obj }: { obj: DetectedObject }) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 3.1 + Number(obj.id)) * 0.06;
    ringRef.current.scale.set(pulse, pulse, pulse);
  });

  const color = LABEL_COLORS[obj.label] ?? "#9ca3af";
  return (
    <group position={[obj.pos3d.x, 0.07, obj.pos3d.z]}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.55, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <sphereGeometry args={[0.08, 10, 10]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

export default GaussianScene;
