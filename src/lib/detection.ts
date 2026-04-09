export type ObjectLabel = "car" | "truck" | "bus" | "person" | "bike" | "motorcycle";
export type ObjectState = "normal" | "occluded" | "healed";

export interface DetectedObject {
  id: string;
  label: ObjectLabel;
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number;
  state: ObjectState;
  depth: number;
  color: string;
  pos3d: { x: number; y: number; z: number };
}

export interface PipelineDetection {
  id: string;
  label: ObjectLabel;
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number;
  state: ObjectState;
}

export interface PipelineFrameMessage {
  type: "frame_result";
  frame_id: number;
  raw_frame: string;
  occluded_frame: string;
  healed_frame: string;
  detections: PipelineDetection[];
  metrics: {
    fps: number;
    latency: number;
    slamAccuracy: number;
    avgConfidence: number;
    healingRatio: number;
    counts: Partial<Record<ObjectLabel, number>>;
  };
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
  truck: "#f97316",
  bus: "#f59e0b",
  person: "#facc15",
  bike: "#06b6d4",
  motorcycle: "#14b8a6",
};

const LABEL_3D_COLORS: Record<ObjectLabel, [number, number, number]> = {
  car: [0.9, 0.92, 0.95],
  truck: [0.98, 0.45, 0.09],
  bus: [0.97, 0.62, 0.08],
  person: [0.98, 0.8, 0.08],
  bike: [0.02, 0.71, 0.83],
  motorcycle: [0.08, 0.78, 0.7],
};

const OBJECT_3D_SIZE: Record<ObjectLabel, [number, number, number]> = {
  car: [2.0, 1.3, 1.1],
  truck: [2.8, 2.1, 1.6],
  bus: [3.0, 2.3, 1.7],
  person: [0.6, 1.8, 0.5],
  bike: [1.0, 1.1, 1.5],
  motorcycle: [1.2, 1.2, 1.7],
};

const POINTS_PER_OBJECT: Record<ObjectState, number> = {
  normal: 700,
  occluded: 320,
  healed: 1100,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hashToUnit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function gaussian(seedA: number, seedB: number): number {
  const u = Math.max(1e-6, seedA);
  const v = Math.max(1e-6, seedB);
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function detectionToObject(d: PipelineDetection): DetectedObject {
  const cx = d.bbox.x + d.bbox.w * 0.5;
  const cy = d.bbox.y + d.bbox.h * 0.5;
  const area = clamp01(d.bbox.w * d.bbox.h);
  const depth = clamp01(1 - area * 4.0);

  return {
    id: d.id,
    label: d.label,
    bbox: {
      x: clamp01(d.bbox.x),
      y: clamp01(d.bbox.y),
      w: clamp01(d.bbox.w),
      h: clamp01(d.bbox.h),
    },
    confidence: Math.round(d.confidence),
    state: d.state,
    depth,
    color: LABEL_COLORS[d.label],
    pos3d: {
      x: (cx - 0.5) * 24,
      y: 0.6 + (1 - cy) * 2.1,
      z: -5 - depth * 20,
    },
  };
}

function buildGaussianCloud(objects: DetectedObject[], frameId: number) {
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
    const spread = obj.state === "occluded" ? 1.7 : obj.state === "healed" ? 0.7 : 1.1;

    for (let i = 0; i < nPts; i++) {
      const idx = (offset + i) * 3;
      const seedBase = `${obj.id}:${frameId}:${i}`;
      const r1 = hashToUnit(`${seedBase}:1`);
      const r2 = hashToUnit(`${seedBase}:2`);
      const r3 = hashToUnit(`${seedBase}:3`);

      gaussianPoints[idx] = obj.pos3d.x + gaussian(r1, r2) * size3d[0] * 0.35 * spread;
      gaussianPoints[idx + 1] = obj.pos3d.y + Math.abs(gaussian(r2, r3)) * size3d[1] * 0.3;
      gaussianPoints[idx + 2] = obj.pos3d.z + gaussian(r3, r1) * size3d[2] * 0.35 * spread;

      const brightness = obj.state === "occluded" ? 0.45 : obj.state === "healed" ? 1.1 : 0.85;
      gaussianColors[idx] = Math.min(1, Math.max(0, baseColor[0] * brightness));
      gaussianColors[idx + 1] = Math.min(1, Math.max(0, baseColor[1] * brightness));
      gaussianColors[idx + 2] = Math.min(1, Math.max(0, baseColor[2] * brightness));
      gaussianSizes[offset + i] = obj.state === "occluded" ? 0.08 : obj.state === "healed" ? 0.04 : 0.05;
    }
    offset += nPts;
  }

  return {
    gaussianPoints,
    gaussianColors,
    gaussianSizes,
    pointCount: totalPoints,
  };
}

export function buildFrameDataFromPipeline(message: PipelineFrameMessage): FrameData {
  const objects = message.detections.map(detectionToObject);
  const counts: Record<ObjectLabel, number> = {
    car: 0,
    truck: 0,
    bus: 0,
    person: 0,
    bike: 0,
    motorcycle: 0,
  };

  for (const label of Object.keys(counts) as ObjectLabel[]) {
    counts[label] = message.metrics.counts[label] ?? 0;
  }

  const cloud = buildGaussianCloud(objects, message.frame_id);
  return {
    objects,
    ...cloud,
    metrics: {
      fps: Math.round(message.metrics.fps),
      latency: Math.round(message.metrics.latency),
      slamAccuracy: Number(message.metrics.slamAccuracy.toFixed(1)),
      avgConfidence: Math.round(message.metrics.avgConfidence),
      healingRatio: Math.round(message.metrics.healingRatio),
      counts,
    },
  };
}
