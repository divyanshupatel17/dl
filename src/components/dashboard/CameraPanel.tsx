import { useEffect, useRef, useState, useCallback } from "react";
import { Upload, Video } from "lucide-react";
import type { DetectedObject } from "@/lib/detection";

interface CameraPanelProps {
  isRunning: boolean;
  healingEnabled: boolean;
  detectedObjects: DetectedObject[];
  onVideoLoaded?: () => void;
}

const STATE_COLORS: Record<string, string> = {
  normal: "#3b82f6",
  occluded: "#ef4444",
  healed: "#22c55e",
};

const CameraPanel = ({ isRunning, healingEnabled, detectedObjects, onVideoLoaded }: CameraPanelProps) => {
  const canvasTopRef = useRef<HTMLCanvasElement>(null);
  const canvasBottomRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animRef = useRef<number>(0);
  const frameRef = useRef(0);
  const objectsRef = useRef<DetectedObject[]>([]);

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>("");

  // Keep a ref in sync for the render loop
  useEffect(() => {
    objectsRef.current = detectedObjects;
  }, [detectedObjects]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      alert("Please upload a video file.");
      return;
    }
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setVideoName(file.name);
    onVideoLoaded?.();
  }, [onVideoLoaded]);

  // Process video frames
  useEffect(() => {
    if (!isRunning || !videoSrc) return;
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {});

    const processFrame = () => {
      if (video.paused || video.ended) {
        if (video.ended) { video.currentTime = 0; video.play().catch(() => {}); }
        animRef.current = requestAnimationFrame(processFrame);
        return;
      }
      frameRef.current++;
      const f = frameRef.current;
      const objs = objectsRef.current;

      const ctxTop = canvasTopRef.current?.getContext("2d");
      if (ctxTop && canvasTopRef.current) {
        const w = canvasTopRef.current.width;
        const h = canvasTopRef.current.height;
        ctxTop.drawImage(video, 0, 0, w, h);
        applyOcclusion(ctxTop, w, h, f);
        drawAllBBoxes(ctxTop, w, h, objs, true);
      }

      const ctxBot = canvasBottomRef.current?.getContext("2d");
      if (ctxBot && canvasBottomRef.current) {
        const w = canvasBottomRef.current.width;
        const h = canvasBottomRef.current.height;
        ctxBot.drawImage(video, 0, 0, w, h);
        if (healingEnabled) applyHealing(ctxBot, w, h);
        drawAllBBoxes(ctxBot, w, h, objs, false);
      }

      animRef.current = requestAnimationFrame(processFrame);
    };
    animRef.current = requestAnimationFrame(processFrame);
    return () => { cancelAnimationFrame(animRef.current); video.pause(); };
  }, [isRunning, videoSrc, healingEnabled]);

  useEffect(() => {
    if (!isRunning && videoRef.current) videoRef.current.pause();
  }, [isRunning]);

  // Fallback simulated scene
  useEffect(() => {
    if (!isRunning || videoSrc) return;
    const drawFrame = () => {
      frameRef.current++;
      const f = frameRef.current;
      const objs = objectsRef.current;

      const ctxTop = canvasTopRef.current?.getContext("2d");
      if (ctxTop && canvasTopRef.current) {
        drawRoadScene(ctxTop, canvasTopRef.current.width, canvasTopRef.current.height, f, true);
        drawAllBBoxes(ctxTop, canvasTopRef.current.width, canvasTopRef.current.height, objs, true);
      }

      const ctxBot = canvasBottomRef.current?.getContext("2d");
      if (ctxBot && canvasBottomRef.current) {
        drawRoadScene(ctxBot, canvasBottomRef.current.width, canvasBottomRef.current.height, f, false);
        drawAllBBoxes(ctxBot, canvasBottomRef.current.width, canvasBottomRef.current.height, objs, false);
      }

      animRef.current = requestAnimationFrame(drawFrame);
    };
    animRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, videoSrc]);

  return (
    <div className="panel-glass h-full flex flex-col">
      <div className="panel-header flex items-center justify-between">
        <span>Camera + Detection</span>
        <label className="flex items-center gap-1.5 cursor-pointer text-primary hover:text-primary/80 transition-colors">
          <Upload className="w-3.5 h-3.5" />
          <span className="text-[10px] font-medium normal-case tracking-normal">Upload Video</span>
          <input type="file" accept="video/*" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>

      {videoSrc && (
        <video ref={videoRef} src={videoSrc} muted loop playsInline className="hidden" crossOrigin="anonymous" />
      )}

      {videoName && (
        <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-primary bg-primary/5 border-b border-border">
          <Video className="w-3 h-3" />
          <span className="truncate">{videoName}</span>
        </div>
      )}

      <div className="flex-1 flex flex-col gap-1 p-2">
        <div className="flex-1 relative">
          <div className="text-xs text-muted-foreground px-2 py-1">Front Camera Feed (Occluded)</div>
          <canvas ref={canvasTopRef} width={480} height={200} className="w-full h-full object-cover rounded-sm bg-muted/20" />
          {!videoSrc && !isRunning && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">Upload a video or click Start</p>
            </div>
          )}
        </div>

        <div className="flex-1 relative">
          <div className="text-xs text-muted-foreground px-2 py-1">Healed Vision Output</div>
          <canvas ref={canvasBottomRef} width={480} height={200} className="w-full h-full object-cover rounded-sm bg-muted/20" />
        </div>

        {/* Detection Legend */}
        {isRunning && (
          <div className="flex gap-3 px-2 py-1 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3b82f6]" />Normal</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]" />Occluded</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#22c55e]" />Healed</span>
          </div>
        )}
      </div>
    </div>
  );
};

function drawAllBBoxes(ctx: CanvasRenderingContext2D, w: number, h: number, objects: DetectedObject[], isOccludedView: boolean) {
  for (const obj of objects) {
    const displayState = isOccludedView
      ? (obj.state === "healed" ? "occluded" : obj.state)
      : obj.state;

    const color = STATE_COLORS[displayState] || "#3b82f6";
    const bx = obj.bbox.x * w;
    const by = obj.bbox.y * h;
    const bw = obj.bbox.w * w;
    const bh = obj.bbox.h * h;

    // Box
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    // Corners
    const cl = 8;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx, by + cl); ctx.lineTo(bx, by); ctx.lineTo(bx + cl, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + bw - cl, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + cl); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, by + bh - cl); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + cl, by + bh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + bw - cl, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - cl); ctx.stroke();

    // Label
    const labelText = `${obj.label.toUpperCase()} ${displayState === "occluded" ? "OCCLUDED" : displayState === "healed" ? `HEALED ${obj.confidence}%` : `${obj.confidence}%`}`;
    ctx.font = "bold 9px monospace";
    const tm = ctx.measureText(labelText);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(bx, by - 12, tm.width + 6, 12);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillText(labelText, bx + 3, by - 3);
  }
}

function applyOcclusion(ctx: CanvasRenderingContext2D, w: number, h: number, frame: number) {
  ctx.fillStyle = "rgba(200, 205, 215, 0.35)";
  ctx.fillRect(0, 0, w, h);
  const patchX = (Math.sin(frame * 0.02) * 0.3 + 0.5) * w;
  const patchY = h * 0.3;
  const grad = ctx.createRadialGradient(patchX, patchY, 10, patchX, patchY, w * 0.4);
  grad.addColorStop(0, "rgba(210, 215, 220, 0.5)");
  grad.addColorStop(1, "rgba(210, 215, 220, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(190, 195, 200, ${Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 6 + 1, Math.random() * 6 + 1);
  }
}

function applyHealing(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, (data[i] - 128) * 1.3 + 138));
    data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * 1.3 + 138));
    data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * 1.3 + 138));
  }
  ctx.putImageData(imageData, 0, 0);
}

function drawRoadScene(ctx: CanvasRenderingContext2D, w: number, h: number, frame: number, isOccluded: boolean) {
  ctx.fillStyle = `rgba(180, 185, 195, ${isOccluded ? 0.7 : 0.3})`;
  ctx.fillRect(0, 0, w, h);
  const horizon = h * 0.45;
  ctx.fillStyle = "#4a4a50";
  ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(w, horizon); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
  const offset = (frame * 3) % 40;
  for (let y = horizon; y < h; y += 40) {
    const progress = (y - horizon) / (h - horizon);
    const cx = w / 2;
    const spread = progress * w * 0.3;
    const dashY = y + offset * progress;
    if (dashY < h) {
      ctx.beginPath(); ctx.moveTo(cx - spread, dashY); ctx.lineTo(cx - spread, Math.min(dashY + 15, h)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + spread, dashY); ctx.lineTo(cx + spread, Math.min(dashY + 15, h)); ctx.stroke();
    }
  }
  if (isOccluded) {
    ctx.fillStyle = "rgba(200, 205, 210, 0.4)";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 150; i++) {
      ctx.fillStyle = `rgba(190, 195, 200, ${Math.random() * 0.3})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 8 + 2, Math.random() * 8 + 2);
    }
  }
}

export default CameraPanel;
