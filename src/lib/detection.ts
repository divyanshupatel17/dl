// Simulated real-time object detection engine with tracking

export type ObjectLabel = "car" | "person" | "bike" | "truck" | "obstacle";
export type ObjectState = "normal" | "occluded" | "healed";

export interface DetectedObject {
  id: string;
  label: ObjectLabel;
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number;
  state: ObjectState;
  depth: number; // estimated depth 0-1 (0=close, 1=far)
  color: string;
  // 3D position derived from bbox
  pos3d: { x: number; y: number; z: number };
}

export interface GaussianPoint {
  x: number;
  y: number;
  z: number;
  density: number;
  objectId: string;
  label: ObjectLabel;
}

export interface FrameData {
  objects: DetectedObject[];
  gaussianPoints: Float32Array;
  gaussianColors: Float32Array;
  gaussianSizes: Float32Array;
  pointCount: number;
  metrics: {
    fps: number;
    latency: number;
    slamAccuracy: number;
    avgConfidence: number;
    healingRatio: number;
    counts: Record<ObjectLabel, number>;
  };
}

const LABEL_COLORS: Record<ObjectLabel, string> = {
  car: "#ffffff",
  person: "#facc15",
  bike: "#06b6d4",
  truck: "#f97316",
  obstacle: "#a855f7",
};

const LABEL_3D_COLORS: Record<ObjectLabel, [number, number, number]> = {
  car: [0.9, 0.92, 0.95],
  person: [0.98, 0.8, 0.08],
  bike: [0.02, 0.71, 0.83],
  truck: [0.98, 0.45, 0.09],
  obstacle: [0.66, 0.33, 0.97],
};

// Object templates - positions normalized 0-1
interface ObjectTemplate {
  label: ObjectLabel;
  baseX: number;
  baseY: number;
  baseW: number;
  baseH: number;
  depth: number;
  motionAmplitude: number;
  motionFreq: number;
}

const SCENE_OBJECTS: ObjectTemplate[] = [
  { label: "car", baseX: 0.15, baseY: 0.35, baseW: 0.12, baseH: 0.18, depth: 0.6, motionAmplitude: 0.02, motionFreq: 0.008 },
  { label: "car", baseX: 0.55, baseY: 0.30, baseW: 0.10, baseH: 0.15, depth: 0.7, motionAmplitude: 0.015, motionFreq: 0.012 },
  { label: "truck", baseX: 0.35, baseY: 0.25, baseW: 0.18, baseH: 0.22, depth: 0.8, motionAmplitude: 0.01, motionFreq: 0.006 },
  { label: "person", baseX: 0.75, baseY: 0.45, baseW: 0.04, baseH: 0.14, depth: 0.4, motionAmplitude: 0.025, motionFreq: 0.015 },
  { label: "person", baseX: 0.82, baseY: 0.42, baseW: 0.035, baseH: 0.12, depth: 0.45, motionAmplitude: 0.02, motionFreq: 0.018 },
  { label: "bike", baseX: 0.65, baseY: 0.40, baseW: 0.06, baseH: 0.10, depth: 0.5, motionAmplitude: 0.03, motionFreq: 0.02 },
  { label: "car", baseX: 0.25, baseY: 0.50, baseW: 0.14, baseH: 0.20, depth: 0.3, motionAmplitude: 0.02, motionFreq: 0.01 },
  { label: "obstacle", baseX: 0.45, baseY: 0.55, baseW: 0.05, baseH: 0.05, depth: 0.25, motionAmplitude: 0.005, motionFreq: 0.005 },
];

const POINTS_PER_OBJECT: Record<ObjectState, number> = {
  normal: 800,
  occluded: 300,
  healed: 1200,
};

// Object size in 3D space by label
const OBJECT_3D_SIZE: Record<ObjectLabel, [number, number, number]> = {
  car: [2, 1.2, 1],
  person: [0.5, 1.8, 0.4],
  bike: [0.8, 1.2, 1.5],
  truck: [2.5, 2, 1.5],
  obstacle: [0.8, 0.5, 0.8],
};

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function processFrame(
  frame: number,
  healingEnabled: boolean,
  detectionLevel: number
): FrameData {
  const objects: DetectedObject[] = [];
  const counts: Record<ObjectLabel, number> = { car: 0, person: 0, bike: 0, truck: 0, obstacle: 0 };

  // Determine which objects are visible this frame based on detection level
  const visibleCount = Math.max(2, Math.floor(SCENE_OBJECTS.length * (detectionLevel / 100)));

  for (let i = 0; i < visibleCount; i++) {
    const tmpl = SCENE_OBJECTS[i];
    const motionX = Math.sin(frame * tmpl.motionFreq) * tmpl.motionAmplitude;
    const motionY = Math.cos(frame * tmpl.motionFreq * 0.7) * tmpl.motionAmplitude * 0.5;

    // Determine state: some objects are occluded, healing fixes them
    const isOccluded = i % 3 === 0 || (i % 2 === 0 && frame % 120 < 40);
    const state: ObjectState = isOccluded
      ? (healingEnabled ? "healed" : "occluded")
      : "normal";

    const confidence = state === "occluded"
      ? 35 + Math.random() * 20
      : state === "healed"
        ? 88 + Math.random() * 10
        : 75 + Math.random() * 20;

    // Convert 2D bbox position to 3D world coordinates
    const x3d = (tmpl.baseX - 0.5) * 20 + motionX * 100;
    const z3d = -tmpl.depth * 25 + 5;
    const y3d = tmpl.label === "person" ? 0.9 : tmpl.label === "bike" ? 0.6 : 0.6;

    objects.push({
      id: `obj_${i}`,
      label: tmpl.label,
      bbox: {
        x: tmpl.baseX + motionX,
        y: tmpl.baseY + motionY,
        w: tmpl.baseW,
        h: tmpl.baseH,
      },
      confidence: Math.round(confidence),
      state,
      depth: tmpl.depth,
      color: LABEL_COLORS[tmpl.label],
      pos3d: { x: x3d, y: y3d, z: z3d },
    });

    counts[tmpl.label]++;
  }

  // Generate Gaussian point clouds for all objects
  let totalPoints = 0;
  for (const obj of objects) {
    totalPoints += POINTS_PER_OBJECT[obj.state];
  }

  const gaussianPoints = new Float32Array(totalPoints * 3);
  const gaussianColors = new Float32Array(totalPoints * 3);
  const gaussianSizes = new Float32Array(totalPoints);
  let offset = 0;

  for (const obj of objects) {
    const nPts = POINTS_PER_OBJECT[obj.state];
    const size3d = OBJECT_3D_SIZE[obj.label];
    const baseColor = LABEL_3D_COLORS[obj.label];
    const spread = obj.state === "occluded" ? 1.8 : obj.state === "healed" ? 0.6 : 1.0;

    for (let p = 0; p < nPts; p++) {
      const idx = (offset + p) * 3;
      gaussianPoints[idx] = obj.pos3d.x + gaussianRandom() * size3d[0] * 0.5 * spread;
      gaussianPoints[idx + 1] = obj.pos3d.y + Math.abs(gaussianRandom()) * size3d[1] * 0.5;
      gaussianPoints[idx + 2] = obj.pos3d.z + gaussianRandom() * size3d[2] * 0.5 * spread;

      const brightness = obj.state === "occluded" ? 0.4 : obj.state === "healed" ? 1.1 : 0.85;
      gaussianColors[idx] = Math.min(1, baseColor[0] * brightness + (Math.random() - 0.5) * 0.1);
      gaussianColors[idx + 1] = Math.min(1, baseColor[1] * brightness + (Math.random() - 0.5) * 0.1);
      gaussianColors[idx + 2] = Math.min(1, baseColor[2] * brightness + (Math.random() - 0.5) * 0.1);

      gaussianSizes[offset + p] = obj.state === "occluded" ? 0.08 : obj.state === "healed" ? 0.04 : 0.05;
    }
    offset += nPts;
  }

  const healedCount = objects.filter((o) => o.state === "healed").length;

  return {
    objects,
    gaussianPoints,
    gaussianColors,
    gaussianSizes,
    pointCount: totalPoints,
    metrics: {
      fps: 56 + Math.round(Math.random() * 6),
      latency: 14 + Math.round(Math.random() * 10),
      slamAccuracy: parseFloat((98.2 + Math.random() * 1.5).toFixed(1)),
      avgConfidence: Math.round(objects.reduce((s, o) => s + o.confidence, 0) / (objects.length || 1)),
      healingRatio: objects.length > 0 ? Math.round((healedCount / objects.length) * 100) : 0,
      counts,
    },
  };
}
