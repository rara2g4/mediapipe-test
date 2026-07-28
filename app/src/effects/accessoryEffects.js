import { clamp } from "../core/math.js";

function eyeGeometry({ bounds, anchors }) {
  const leftEye = anchors.leftEyeCenter;
  const rightEye = anchors.rightEyeCenter;
  const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  let angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);

  // Mirroring swaps the eyes' horizontal order. Keep overlays upright while
  // preserving the smaller head-tilt angle.
  if (angle > Math.PI / 2) {
    angle -= Math.PI;
  } else if (angle < -Math.PI / 2) {
    angle += Math.PI;
  }

  return {
    leftEye,
    rightEye,
    eyeDistance,
    centerX: (leftEye.x + rightEye.x) / 2,
    centerY: (leftEye.y + rightEye.y) / 2,
    angle,
    faceWidth: bounds.faceW,
    faceHeight: bounds.faceH,
  };
}

function drawLens(ctx, centerX, radius, frameWidth) {
  const lensGradient = ctx.createLinearGradient(centerX - radius, -radius, centerX + radius, radius);
  lensGradient.addColorStop(0, "rgba(219, 247, 255, 0.28)");
  lensGradient.addColorStop(0.55, "rgba(107, 199, 224, 0.1)");
  lensGradient.addColorStop(1, "rgba(255, 255, 255, 0.22)");

  ctx.fillStyle = lensGradient;
  ctx.strokeStyle = "#2f3542";
  ctx.lineWidth = frameWidth;
  ctx.beginPath();
  ctx.arc(centerX, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = Math.max(1, frameWidth * 0.34);
  ctx.beginPath();
  ctx.arc(centerX - radius * 0.12, -radius * 0.08, radius * 0.68, Math.PI * 1.08, Math.PI * 1.58);
  ctx.stroke();
}

export function roundGlassesEffect(effectContext) {
  effectContext.detections.face.trackedFaces.forEach((face) => {
    const geometry = eyeGeometry(face);
    const { bounds } = face;
    const radius = clamp(geometry.eyeDistance * 0.34, 11, bounds.faceW * 0.24);
    const frameWidth = clamp(radius * 0.14, 2, 7);
    const leftX = -geometry.eyeDistance / 2;
    const rightX = geometry.eyeDistance / 2;

    effectContext.ctx.save();
    effectContext.ctx.translate(geometry.centerX, geometry.centerY + bounds.faceH * 0.012);
    effectContext.ctx.rotate(geometry.angle);
    effectContext.ctx.lineCap = "round";
    effectContext.ctx.lineJoin = "round";
    effectContext.ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    effectContext.ctx.shadowBlur = radius * 0.15;
    effectContext.ctx.shadowOffsetY = radius * 0.08;

    drawLens(effectContext.ctx, leftX, radius, frameWidth);
    drawLens(effectContext.ctx, rightX, radius, frameWidth);

    effectContext.ctx.shadowColor = "transparent";
    effectContext.ctx.strokeStyle = "#2f3542";
    effectContext.ctx.lineWidth = frameWidth;
    effectContext.ctx.beginPath();
    effectContext.ctx.moveTo(leftX + radius, 0);
    effectContext.ctx.quadraticCurveTo(0, -radius * 0.3, rightX - radius, 0);
    effectContext.ctx.moveTo(leftX - radius, -radius * 0.05);
    effectContext.ctx.lineTo(-bounds.faceW * 0.53, -radius * 0.18);
    effectContext.ctx.moveTo(rightX + radius, -radius * 0.05);
    effectContext.ctx.lineTo(bounds.faceW * 0.53, -radius * 0.18);
    effectContext.ctx.stroke();
    effectContext.ctx.restore();
  });
}

function drawCrownGem(ctx, x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = Math.max(1, radius * 0.2);
  ctx.stroke();
}

export function crownEffect(effectContext) {
  effectContext.detections.face.trackedFaces.forEach((face) => {
    const geometry = eyeGeometry(face);
    const { bounds } = face;
    const width = clamp(bounds.faceW * 0.88, 64, bounds.faceW * 1.05);
    const height = width * 0.48;
    const baseHeight = height * 0.23;
    const anchorY = bounds.faceMinY + bounds.faceH * 0.04;

    effectContext.ctx.save();
    effectContext.ctx.translate(geometry.centerX, anchorY);
    effectContext.ctx.rotate(geometry.angle);
    effectContext.ctx.lineJoin = "round";
    effectContext.ctx.shadowColor = "rgba(68, 45, 0, 0.36)";
    effectContext.ctx.shadowBlur = height * 0.12;
    effectContext.ctx.shadowOffsetY = height * 0.06;

    const crownGradient = effectContext.ctx.createLinearGradient(0, -height, 0, baseHeight);
    crownGradient.addColorStop(0, "#fff4a8");
    crownGradient.addColorStop(0.42, "#facc15");
    crownGradient.addColorStop(1, "#ca8a04");
    effectContext.ctx.fillStyle = crownGradient;
    effectContext.ctx.strokeStyle = "#8a5a00";
    effectContext.ctx.lineWidth = Math.max(2, width * 0.022);
    effectContext.ctx.beginPath();
    effectContext.ctx.moveTo(-width * 0.5, 0);
    effectContext.ctx.lineTo(-width * 0.48, -height * 0.58);
    effectContext.ctx.lineTo(-width * 0.27, -height * 0.3);
    effectContext.ctx.lineTo(-width * 0.17, -height);
    effectContext.ctx.lineTo(0, -height * 0.48);
    effectContext.ctx.lineTo(width * 0.17, -height);
    effectContext.ctx.lineTo(width * 0.27, -height * 0.3);
    effectContext.ctx.lineTo(width * 0.48, -height * 0.58);
    effectContext.ctx.lineTo(width * 0.5, 0);
    effectContext.ctx.closePath();
    effectContext.ctx.fill();
    effectContext.ctx.stroke();

    effectContext.ctx.shadowColor = "transparent";
    effectContext.ctx.fillStyle = "#f6c514";
    effectContext.ctx.fillRect(-width * 0.5, -baseHeight * 0.45, width, baseHeight);
    effectContext.ctx.strokeRect(-width * 0.5, -baseHeight * 0.45, width, baseHeight);

    const gemRadius = Math.max(3, width * 0.04);
    drawCrownGem(effectContext.ctx, -width * 0.26, baseHeight * 0.05, gemRadius, "#ef4444");
    drawCrownGem(effectContext.ctx, 0, baseHeight * 0.05, gemRadius * 1.08, "#22c55e");
    drawCrownGem(effectContext.ctx, width * 0.26, baseHeight * 0.05, gemRadius, "#3b82f6");
    effectContext.ctx.restore();
  });
}

export function partyHatEffect(effectContext) {
  effectContext.detections.face.trackedFaces.forEach((face) => {
    const geometry = eyeGeometry(face);
    const { bounds } = face;
    const width = clamp(bounds.faceW * 0.68, 52, bounds.faceW * 0.84);
    const height = width * 1.16;
    const anchorY = bounds.faceMinY + bounds.faceH * 0.05;
    const ctx = effectContext.ctx;

    ctx.save();
    ctx.translate(geometry.centerX, anchorY);
    ctx.rotate(geometry.angle - 0.08);

    ctx.strokeStyle = "rgba(65, 48, 79, 0.68)";
    ctx.lineWidth = Math.max(1.5, width * 0.018);
    ctx.beginPath();
    ctx.moveTo(-width * 0.46, -height * 0.03);
    ctx.quadraticCurveTo(-width * 0.52, bounds.faceH * 0.28, -width * 0.39, bounds.faceH * 0.5);
    ctx.moveTo(width * 0.46, -height * 0.03);
    ctx.quadraticCurveTo(width * 0.52, bounds.faceH * 0.28, width * 0.39, bounds.faceH * 0.5);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, -height);
    ctx.lineTo(-width * 0.5, 0);
    ctx.lineTo(width * 0.5, 0);
    ctx.closePath();
    ctx.clip();

    const hatGradient = ctx.createLinearGradient(-width * 0.5, -height, width * 0.5, 0);
    hatGradient.addColorStop(0, "#7c3aed");
    hatGradient.addColorStop(0.52, "#db2777");
    hatGradient.addColorStop(1, "#f97316");
    ctx.fillStyle = hatGradient;
    ctx.fillRect(-width * 0.55, -height, width * 1.1, height);

    ctx.strokeStyle = "rgba(255, 244, 190, 0.9)";
    ctx.lineWidth = Math.max(5, width * 0.1);
    for (let stripeX = -width; stripeX < width; stripeX += width * 0.38) {
      ctx.beginPath();
      ctx.moveTo(stripeX, 0);
      ctx.lineTo(stripeX + width * 0.85, -height);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "#5b214e";
    ctx.lineWidth = Math.max(2, width * 0.025);
    ctx.beginPath();
    ctx.moveTo(0, -height);
    ctx.lineTo(-width * 0.5, 0);
    ctx.lineTo(width * 0.5, 0);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "#fff7c2";
    ctx.shadowColor = "rgba(80, 20, 70, 0.35)";
    ctx.shadowBlur = width * 0.08;
    ctx.beginPath();
    ctx.arc(0, -height, width * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

export function mustacheEffect(effectContext) {
  effectContext.detections.face.trackedFaces.forEach((face) => {
    const geometry = eyeGeometry(face);
    const { anchors, bounds } = face;
    const width = clamp(bounds.faceW * 0.46, 38, bounds.faceW * 0.58);
    const height = width * 0.24;
    const centerX = anchors.noseTip.x * 0.45 + anchors.mouthCenter.x * 0.55;
    const centerY = anchors.noseTip.y + (anchors.mouthCenter.y - anchors.noseTip.y) * 0.62;
    const ctx = effectContext.ctx;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(geometry.angle);
    ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
    ctx.shadowBlur = height * 0.25;
    ctx.shadowOffsetY = height * 0.12;

    const hairGradient = ctx.createLinearGradient(0, -height, 0, height);
    hairGradient.addColorStop(0, "#4b3027");
    hairGradient.addColorStop(0.55, "#241814");
    hairGradient.addColorStop(1, "#0f0908");
    ctx.fillStyle = hairGradient;
    ctx.beginPath();
    ctx.moveTo(0, -height * 0.08);
    ctx.bezierCurveTo(-width * 0.12, -height * 0.58, -width * 0.39, -height * 0.6, -width * 0.5, 0);
    ctx.bezierCurveTo(-width * 0.36, height * 0.64, -width * 0.12, height * 0.38, 0, height * 0.08);
    ctx.bezierCurveTo(width * 0.12, height * 0.38, width * 0.36, height * 0.64, width * 0.5, 0);
    ctx.bezierCurveTo(width * 0.39, -height * 0.6, width * 0.12, -height * 0.58, 0, -height * 0.08);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = Math.max(1, height * 0.07);
    ctx.beginPath();
    ctx.moveTo(-width * 0.42, -height * 0.04);
    ctx.quadraticCurveTo(-width * 0.22, -height * 0.3, -width * 0.05, 0);
    ctx.moveTo(width * 0.42, -height * 0.04);
    ctx.quadraticCurveTo(width * 0.22, -height * 0.3, width * 0.05, 0);
    ctx.stroke();
    ctx.restore();
  });
}

function drawLaserBeam(ctx, start, end, width, pulse) {
  const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.98)");
  gradient.addColorStop(0.08, "rgba(255, 69, 58, 0.98)");
  gradient.addColorStop(1, "rgba(185, 0, 28, 0.62)");

  ctx.strokeStyle = "rgba(255, 30, 52, 0.34)";
  ctx.lineWidth = width * 2.6 * pulse;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.strokeStyle = gradient;
  ctx.lineWidth = width * pulse;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = Math.max(1.5, width * 0.2);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

function drawLaserEmitter(ctx, point, radius) {
  const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
  glow.addColorStop(0, "rgba(255, 255, 255, 1)");
  glow.addColorStop(0.22, "rgba(255, 67, 67, 0.95)");
  glow.addColorStop(1, "rgba(255, 0, 32, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function laserEyesEffect(effectContext) {
  const canvasWidth = effectContext.ctx.canvas.width;
  const canvasHeight = effectContext.ctx.canvas.height;
  const pulse = 0.9 + Math.sin(performance.now() * 0.014) * 0.1;

  effectContext.detections.face.trackedFaces.forEach((face) => {
    const { anchors, bounds } = face;
    const beamWidth = clamp(bounds.faceW * 0.035, 4, 18);
    const spread = clamp(bounds.faceW * 0.9, 70, canvasWidth * 0.34);
    const targetY = canvasHeight * 1.08;
    const leftTarget = { x: anchors.leftEyeCenter.x - spread, y: targetY };
    const rightTarget = { x: anchors.rightEyeCenter.x + spread, y: targetY };

    effectContext.ctx.save();
    effectContext.ctx.globalCompositeOperation = "screen";
    effectContext.ctx.lineCap = "round";
    effectContext.ctx.shadowColor = "rgba(255, 0, 38, 0.9)";
    effectContext.ctx.shadowBlur = beamWidth * 1.8;
    drawLaserBeam(effectContext.ctx, anchors.leftEyeCenter, leftTarget, beamWidth, pulse);
    drawLaserBeam(effectContext.ctx, anchors.rightEyeCenter, rightTarget, beamWidth, pulse);
    drawLaserEmitter(effectContext.ctx, anchors.leftEyeCenter, beamWidth * 1.55);
    drawLaserEmitter(effectContext.ctx, anchors.rightEyeCenter, beamWidth * 1.55);
    effectContext.ctx.restore();
  });
}
