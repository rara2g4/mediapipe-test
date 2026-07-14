import { EFFECT_METADATA } from "./effectMetadata.js";
import { isHeadCategory, isPersonCategory, rowHasMask } from "../mediapipe/detectionSnapshot.js";
import { clamp, lerp } from "../core/math.js";

// ---------------------------------------------------------------------------
// エフェクト共通メタデータ組み立て
// 各エフェクトは id / 必要検出 / 実行関数だけを定義し、
// 表示名や説明は effectMetadata.js から合流させる。
// ---------------------------------------------------------------------------

function createEffect({ id, requiredDetections, run }) {
  return {
    id,
    requiredDetections,
    ...EFFECT_METADATA[id],
    run,
  };
}

// ---------------------------------------------------------------------------
// 顔に画像や図形を重ねる基本エフェクト群
// 顔ランドマークから基準点を作り、そこへ視覚素材を貼り込む。
// 新しい顔パーツ系エフェクトはまずこの並びに増える。
// ---------------------------------------------------------------------------

function faceStickerEffect(effectContext) {
  const stickerImage = effectContext.assets.faceSticker;
  const stickerScale = effectContext.params.stickerScale || 1.25;
  const stickerYOffset = effectContext.params.stickerYOffset || -0.04;
  const stickerOpacity = effectContext.params.stickerOpacity || 0.92;

  effectContext.detections.face.trackedFaces.forEach(({ bounds, anchors }) => {
    const eyeDistance = Math.hypot(
      anchors.rightEyeCenter.x - anchors.leftEyeCenter.x,
      anchors.rightEyeCenter.y - anchors.leftEyeCenter.y
    );
    const drawWidth = Math.max(bounds.faceW * stickerScale, eyeDistance * 2.6);
    const drawHeight = drawWidth * (stickerImage.height / stickerImage.width);
    const centerX = (anchors.leftEyeCenter.x + anchors.rightEyeCenter.x) / 2;
    const centerY = (anchors.leftEyeCenter.y + anchors.rightEyeCenter.y) / 2 + bounds.faceH * stickerYOffset;

    effectContext.ctx.save();
    effectContext.ctx.globalAlpha = stickerOpacity;
    effectContext.ctx.drawImage(
      stickerImage,
      centerX - drawWidth / 2,
      centerY - drawHeight / 2,
      drawWidth,
      drawHeight
    );
    effectContext.ctx.restore();
  });
}

// ---------------------------------------------------------------------------
// 口ビーム用の判定・再生状態
// 「横向き + 口開き」を 1 秒維持できたかをここで管理し、
// 発射中の向きや再生中フラグもエフェクト内部で完結させる。
// ---------------------------------------------------------------------------

const BEAM_DELAY_MS = 1000;
const BEAM_MOUTH_OPEN_THRESHOLD = 0.038;
const BEAM_SIDEWAYS_THRESHOLD = 0.14;
const BEAM_DRAW_HEIGHT_RATIO = 0.68;
const BEAM_DRAW_VERTICAL_OFFSET = 0.04;

const mouthBeamRuntime = {
  activeVideo: null,
  openStartedAt: 0,
  hasTriggeredCurrentOpen: false,
  isPlaying: false,
  playbackDirection: 1,
  lastVisibleDirection: 1,
};

function resetMouthBeamRuntime() {
  if (mouthBeamRuntime.activeVideo) {
    mouthBeamRuntime.activeVideo.pause();
    mouthBeamRuntime.activeVideo.currentTime = 0;
  }

  mouthBeamRuntime.activeVideo = null;
  mouthBeamRuntime.openStartedAt = 0;
  mouthBeamRuntime.hasTriggeredCurrentOpen = false;
  mouthBeamRuntime.isPlaying = false;
  mouthBeamRuntime.playbackDirection = 1;
  mouthBeamRuntime.lastVisibleDirection = 1;
}

export function resetAllEffectRuntime() {
  resetMouthBeamRuntime();
  resetEatCakeRuntime();
}

function normalizedMouthOpenAmount({ anchors, bounds }) {
  const mouthGap = Math.hypot(
    anchors.mouthLower.x - anchors.mouthUpper.x,
    anchors.mouthLower.y - anchors.mouthUpper.y,
  );
  return mouthGap / Math.max(bounds.faceH, 1);
}

function horizontalTurnScore({ anchors }) {
  const eyeMidX = (anchors.leftEyeCenter.x + anchors.rightEyeCenter.x) / 2;
  const eyeDistance = Math.hypot(
    anchors.rightEyeCenter.x - anchors.leftEyeCenter.x,
    anchors.rightEyeCenter.y - anchors.leftEyeCenter.y,
  );

  if (eyeDistance < 1) {
    return 0;
  }

  return (anchors.noseTip.x - eyeMidX) / eyeDistance;
}

function playbackFinished(video) {
  if (!video) {
    return true;
  }

  if (video.ended) {
    return true;
  }

  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.currentTime >= Math.max(0, video.duration - 1 / 60);
  }

  return false;
}

function startMouthBeamPlayback(video, direction) {
  mouthBeamRuntime.activeVideo = video;
  mouthBeamRuntime.openStartedAt = 0;
  mouthBeamRuntime.hasTriggeredCurrentOpen = true;
  mouthBeamRuntime.isPlaying = true;
  mouthBeamRuntime.playbackDirection = direction;
  mouthBeamRuntime.lastVisibleDirection = direction;

  video.pause();
  video.currentTime = 0;

  const playPromise = video.play();
  if (typeof playPromise?.catch === "function") {
    playPromise.catch(() => {
      mouthBeamRuntime.isPlaying = false;
      video.pause();
      video.currentTime = 0;
    });
  }
}

function stopMouthBeamPlayback(video, { resetChargeState = false } = {}) {
  mouthBeamRuntime.isPlaying = false;

  if (resetChargeState) {
    mouthBeamRuntime.openStartedAt = 0;
    mouthBeamRuntime.hasTriggeredCurrentOpen = false;
  }

  if (!video) {
    return;
  }

  video.pause();
  video.currentTime = 0;
}

function syncMouthBeamPlayback(trackedFace, beamVideo, nowMs) {
  const mouthOpenAmount = normalizedMouthOpenAmount(trackedFace);
  const turnScore = horizontalTurnScore(trackedFace);
  const isSideways = Math.abs(turnScore) >= BEAM_SIDEWAYS_THRESHOLD;
  const isMouthOpen = mouthOpenAmount >= BEAM_MOUTH_OPEN_THRESHOLD;
  const isChargingPose = isSideways && isMouthOpen;
  const visibleDirection = turnScore < 0 ? -1 : 1;

  mouthBeamRuntime.activeVideo = beamVideo;
  mouthBeamRuntime.lastVisibleDirection = visibleDirection;

  if (mouthBeamRuntime.isPlaying) {
    if (!isMouthOpen) {
      stopMouthBeamPlayback(beamVideo, { resetChargeState: true });
      return {
        direction: visibleDirection,
        requestContinue: false,
      };
    }

    if (playbackFinished(beamVideo)) {
      stopMouthBeamPlayback(beamVideo);
    }

    return {
      direction: mouthBeamRuntime.playbackDirection,
      requestContinue: mouthBeamRuntime.isPlaying,
    };
  }

  if (!isChargingPose) {
    mouthBeamRuntime.openStartedAt = 0;
    mouthBeamRuntime.hasTriggeredCurrentOpen = false;
    return {
      direction: visibleDirection,
      requestContinue: false,
    };
  }

  if (!mouthBeamRuntime.openStartedAt) {
    mouthBeamRuntime.openStartedAt = nowMs;
  }

  if (!mouthBeamRuntime.hasTriggeredCurrentOpen && nowMs - mouthBeamRuntime.openStartedAt >= BEAM_DELAY_MS) {
    startMouthBeamPlayback(beamVideo, visibleDirection);
  }

  return {
    direction: mouthBeamRuntime.isPlaying ? mouthBeamRuntime.playbackDirection : visibleDirection,
    requestContinue: !mouthBeamRuntime.hasTriggeredCurrentOpen || mouthBeamRuntime.isPlaying,
  };
}

function drawMouthBeamVideo(effectContext, trackedFace, beamVideo, direction) {
  const { mouthCenter } = trackedFace.anchors;
  const beamHeight = Math.max(trackedFace.bounds.faceH * BEAM_DRAW_HEIGHT_RATIO, 28);
  const distanceToEdge =
    direction > 0
      ? Math.max(1, effectContext.frameBufferCanvas.width - mouthCenter.x)
      : Math.max(1, mouthCenter.x);
  const drawY = mouthCenter.y - beamHeight / 2 - trackedFace.bounds.faceH * BEAM_DRAW_VERTICAL_OFFSET;

  effectContext.ctx.save();
  effectContext.ctx.translate(mouthCenter.x, drawY);
  if (direction < 0) {
    effectContext.ctx.scale(-1, 1);
  }
  effectContext.ctx.drawImage(beamVideo, 0, 0, distanceToEdge, beamHeight);
  effectContext.ctx.restore();
}

function mouthBeamEffect(effectContext) {
  const beamVideo = effectContext.assets.mouthBeamVideo;
  const trackedFace = effectContext.detections.face.trackedFaces[0];

  if (!beamVideo || !trackedFace) {
    resetMouthBeamRuntime();
    return { requestContinue: false };
  }

  const playbackState = syncMouthBeamPlayback(trackedFace, beamVideo, performance.now());
  if (mouthBeamRuntime.isPlaying) {
    drawMouthBeamVideo(effectContext, trackedFace, beamVideo, playbackState.direction);
  }

  return {
    requestContinue: playbackState.requestContinue,
  };
}

// ---------------------------------------------------------------------------
// ケーキを食べるエフェクト: 定数と実行状態
//
// このエフェクトは一枚の画像を貼るだけではなく、時間によって動作が変わる。
// phase が現在の動作を表し、各フレームで次の状態へ進むかを判定する。
//
// idle       : 口が開くのを待つ
// approaching: 画面下から0.5秒で口元へ移動する
// waiting    : 口元に追従し、口が閉じるまで待つ
// returning  : 到達前に口が閉じたため、画面下へ戻って消える
// eating     : ケーキを縮小しながら三角形の破片を飛ばす
// ---------------------------------------------------------------------------

const CAKE_PHASE = Object.freeze({
  IDLE: "idle",
  APPROACHING: "approaching",
  WAITING: "waiting",
  RETURNING: "returning",
  EATING: "eating",
});

const CAKE_APPROACH_DURATION_MS = 500;
const CAKE_RETURN_DURATION_MS = 500;
const CAKE_SHRINK_DURATION_MS = 180;
const CAKE_PARTICLE_DURATION_MS = 650;
const CAKE_MOUTH_OPEN_THRESHOLD = 0.038;
const CAKE_MOUTH_CLOSED_THRESHOLD = 0.024;
const CAKE_WIDTH_FACE_RATIO = 1.2;
const CAKE_TARGET_Y_FACE_OFFSET = 0.24;
const CAKE_PARTICLE_COUNT = 26;
const CAKE_PARTICLE_COLORS = ["#f44d3e", "#ff7b6e", "#f7b2ad", "#b18462", "#8d623d"];

const eatCakeRuntime = {
  phase: CAKE_PHASE.IDLE,
  phaseStartedAt: 0,
  armed: true,
  position: { x: 0, y: 0 },
  returnStartPosition: { x: 0, y: 0 },
  eatPosition: { x: 0, y: 0 },
  particles: [],
};

// ケーキ用の状態を初期値へ戻す。
// エフェクト切り替え、カメラ停止、顔の検出消失時に前回の動作を残さないために使う。
function resetEatCakeRuntime() {
  eatCakeRuntime.phase = CAKE_PHASE.IDLE;
  eatCakeRuntime.phaseStartedAt = 0;
  eatCakeRuntime.armed = true;
  eatCakeRuntime.position = { x: 0, y: 0 };
  eatCakeRuntime.returnStartPosition = { x: 0, y: 0 };
  eatCakeRuntime.eatPosition = { x: 0, y: 0 };
  eatCakeRuntime.particles = [];
}

// 0～1の直線的な進行値を、最初と最後が滑らかな移動へ変換する。
// ケーキが突然発進・停止して見えることを防ぐ。
function easeInOutCubic(progress) {
  const t = clamp(progress, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// 現在の顔サイズからケーキの表示寸法を決める。
// 元画像の縦横比を維持するため、顔が近づいても画像が縦横に潰れない。
function cakeDrawSize(cakeImage, trackedFace) {
  const width = Math.max(72, trackedFace.bounds.faceW * CAKE_WIDTH_FACE_RATIO);
  return {
    width,
    height: width * (cakeImage.height / Math.max(1, cakeImage.width)),
  };
}

// ケーキが待機する口元の座標を返す。
// 画像の中心を口そのものに置くと顔全体を隠すため、顔の高さに比例して少し下へずらす。
function cakeMouthTarget(trackedFace) {
  return {
    x: trackedFace.anchors.mouthCenter.x,
    y: trackedFace.anchors.mouthCenter.y + trackedFace.bounds.faceH * CAKE_TARGET_Y_FACE_OFFSET,
  };
}

// 画面下の見えない位置を出発点・帰還先として使う。
// X座標は口の位置に合わせ、真下から上がってくる動きにする。
function cakeOffscreenPosition(effectContext, trackedFace, drawSize) {
  return {
    x: trackedFace.anchors.mouthCenter.x,
    y: effectContext.frameBufferCanvas.height + drawSize.height / 2,
  };
}

// ケーキ画像を中心座標基準で描画する。
// alpha はフェード、scale は食べた瞬間の縮小に利用する。
function drawCakeImage(effectContext, cakeImage, position, drawSize, alpha = 1, scale = 1) {
  const width = drawSize.width * scale;
  const height = drawSize.height * scale;

  effectContext.ctx.save();
  effectContext.ctx.globalAlpha = clamp(alpha, 0, 1);
  effectContext.ctx.drawImage(
    cakeImage,
    position.x - width / 2,
    position.y - height / 2,
    width,
    height,
  );
  effectContext.ctx.restore();
}

// 食べた瞬間に一度だけ三角形の情報を生成する。
// 生成結果を保存しておくことで、フレームごとに飛ぶ方向が変化するのを防ぐ。
function createCakeParticles(origin, faceWidth) {
  const baseSpeed = Math.max(90, faceWidth * 1.25);

  return Array.from({ length: CAKE_PARTICLE_COUNT }, (_, index) => {
    const spread = (index / CAKE_PARTICLE_COUNT) * Math.PI * 2;
    const angle = spread + (Math.random() - 0.5) * 0.38;
    const speed = baseSpeed * (0.58 + Math.random() * 0.7);

    return {
      originX: origin.x,
      originY: origin.y,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed - baseSpeed * 0.28,
      gravity: baseSpeed * (1.25 + Math.random() * 0.45),
      size: Math.max(4, faceWidth * (0.025 + Math.random() * 0.028)),
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 10,
      color: CAKE_PARTICLE_COLORS[index % CAKE_PARTICLE_COLORS.length],
    };
  });
}

// 保存した速度・重力から、現在時刻における三角形の位置を計算して描く。
// Canvas上で直接作るため、破片用の画像ファイルは必要ない。
function drawCakeParticles(effectContext, nowMs) {
  const elapsedSeconds = Math.max(0, nowMs - eatCakeRuntime.phaseStartedAt) / 1000;
  const progress = clamp(
    (nowMs - eatCakeRuntime.phaseStartedAt) / CAKE_PARTICLE_DURATION_MS,
    0,
    1,
  );

  eatCakeRuntime.particles.forEach((particle) => {
    const x = particle.originX + particle.velocityX * elapsedSeconds;
    const y =
      particle.originY +
      particle.velocityY * elapsedSeconds +
      0.5 * particle.gravity * elapsedSeconds * elapsedSeconds;
    const size = particle.size * (1 - progress * 0.55);

    effectContext.ctx.save();
    effectContext.ctx.globalAlpha = 1 - progress;
    effectContext.ctx.translate(x, y);
    effectContext.ctx.rotate(particle.rotation + particle.rotationSpeed * elapsedSeconds);
    effectContext.ctx.fillStyle = particle.color;
    effectContext.ctx.beginPath();
    effectContext.ctx.moveTo(0, -size);
    effectContext.ctx.lineTo(size * 0.9, size * 0.75);
    effectContext.ctx.lineTo(-size * 0.9, size * 0.75);
    effectContext.ctx.closePath();
    effectContext.ctx.fill();
    effectContext.ctx.restore();
  });
}

// 食べる状態へ切り替え、ケーキの最終位置と破片情報を固定する。
function startEatingCake(nowMs, trackedFace) {
  eatCakeRuntime.phase = CAKE_PHASE.EATING;
  eatCakeRuntime.phaseStartedAt = nowMs;
  eatCakeRuntime.eatPosition = { ...eatCakeRuntime.position };
  eatCakeRuntime.particles = createCakeParticles(eatCakeRuntime.eatPosition, trackedFace.bounds.faceW);
}

// ケーキエフェクトの根幹となる状態更新と描画。
// return の requestContinue が true の間、静止画像でも main.js が次フレームを再描画する。
function eatCakeEffect(effectContext) {
  const cakeImage = effectContext.assets.cakeImage;
  const trackedFace = effectContext.detections.face.trackedFaces[0];

  if (!cakeImage || !trackedFace) {
    resetEatCakeRuntime();
    return { requestContinue: false };
  }

  const nowMs = performance.now();
  const mouthOpenAmount = normalizedMouthOpenAmount(trackedFace);
  const isMouthOpen = mouthOpenAmount >= CAKE_MOUTH_OPEN_THRESHOLD;
  const isMouthClosed = mouthOpenAmount <= CAKE_MOUTH_CLOSED_THRESHOLD;
  const drawSize = cakeDrawSize(cakeImage, trackedFace);
  const mouthTarget = cakeMouthTarget(trackedFace);
  const offscreenTarget = cakeOffscreenPosition(effectContext, trackedFace, drawSize);

  if (eatCakeRuntime.phase === CAKE_PHASE.IDLE) {
    if (isMouthClosed) {
      eatCakeRuntime.armed = true;
    }

    if (!eatCakeRuntime.armed || !isMouthOpen) {
      return { requestContinue: false };
    }

    eatCakeRuntime.armed = false;
    eatCakeRuntime.phase = CAKE_PHASE.APPROACHING;
    eatCakeRuntime.phaseStartedAt = nowMs;
    eatCakeRuntime.position = { ...offscreenTarget };
  }

  if (eatCakeRuntime.phase === CAKE_PHASE.APPROACHING) {
    if (isMouthClosed) {
      eatCakeRuntime.phase = CAKE_PHASE.RETURNING;
      eatCakeRuntime.phaseStartedAt = nowMs;
      eatCakeRuntime.returnStartPosition = { ...eatCakeRuntime.position };
    } else {
      const progress = clamp(
        (nowMs - eatCakeRuntime.phaseStartedAt) / CAKE_APPROACH_DURATION_MS,
        0,
        1,
      );
      const easedProgress = easeInOutCubic(progress);
      eatCakeRuntime.position = {
        x: lerp(offscreenTarget.x, mouthTarget.x, easedProgress),
        y: lerp(offscreenTarget.y, mouthTarget.y, easedProgress),
      };
      drawCakeImage(effectContext, cakeImage, eatCakeRuntime.position, drawSize, easedProgress);

      if (progress >= 1) {
        eatCakeRuntime.phase = CAKE_PHASE.WAITING;
        eatCakeRuntime.phaseStartedAt = nowMs;
      }

      return { requestContinue: true };
    }
  }

  if (eatCakeRuntime.phase === CAKE_PHASE.WAITING) {
    eatCakeRuntime.position = { ...mouthTarget };

    if (isMouthClosed) {
      startEatingCake(nowMs, trackedFace);
    } else {
      drawCakeImage(effectContext, cakeImage, eatCakeRuntime.position, drawSize);
      return { requestContinue: true };
    }
  }

  if (eatCakeRuntime.phase === CAKE_PHASE.RETURNING) {
    const progress = clamp(
      (nowMs - eatCakeRuntime.phaseStartedAt) / CAKE_RETURN_DURATION_MS,
      0,
      1,
    );
    const easedProgress = easeInOutCubic(progress);
    eatCakeRuntime.position = {
      x: lerp(eatCakeRuntime.returnStartPosition.x, offscreenTarget.x, easedProgress),
      y: lerp(eatCakeRuntime.returnStartPosition.y, offscreenTarget.y, easedProgress),
    };
    drawCakeImage(effectContext, cakeImage, eatCakeRuntime.position, drawSize, 1 - easedProgress);

    if (progress >= 1) {
      eatCakeRuntime.phase = CAKE_PHASE.IDLE;
      eatCakeRuntime.phaseStartedAt = 0;
      return { requestContinue: false };
    }

    return { requestContinue: true };
  }

  if (eatCakeRuntime.phase === CAKE_PHASE.EATING) {
    const shrinkProgress = clamp(
      (nowMs - eatCakeRuntime.phaseStartedAt) / CAKE_SHRINK_DURATION_MS,
      0,
      1,
    );

    if (shrinkProgress < 1) {
      drawCakeImage(
        effectContext,
        cakeImage,
        eatCakeRuntime.eatPosition,
        drawSize,
        1 - shrinkProgress,
        1 - easeInOutCubic(shrinkProgress),
      );
    }
    drawCakeParticles(effectContext, nowMs);

    if (nowMs - eatCakeRuntime.phaseStartedAt >= CAKE_PARTICLE_DURATION_MS) {
      eatCakeRuntime.phase = CAKE_PHASE.IDLE;
      eatCakeRuntime.phaseStartedAt = 0;
      eatCakeRuntime.particles = [];
      return { requestContinue: false };
    }

    return { requestContinue: true };
  }

  return { requestContinue: false };
}

function clownNoseEffect(effectContext) {
  const noseScale = effectContext.params.clownNoseScale || 1;
  const noseOpacity = effectContext.params.clownNoseOpacity || 0.96;

  effectContext.detections.face.trackedFaces.forEach(({ bounds, anchors }) => {
    const radius = clamp(bounds.faceW * 0.11 * noseScale, 8, Math.max(18, bounds.faceW * 0.18));
    const centerX = anchors.noseTip.x;
    const centerY = anchors.noseTip.y + bounds.faceH * 0.015;
    const highlightRadius = Math.max(2, radius * 0.22);

    effectContext.ctx.save();
    effectContext.ctx.globalAlpha = noseOpacity;
    effectContext.ctx.shadowColor = "rgba(80, 0, 0, 0.35)";
    effectContext.ctx.shadowBlur = radius * 0.45;
    effectContext.ctx.shadowOffsetY = radius * 0.16;

    const noseGradient = effectContext.ctx.createRadialGradient(
      centerX - radius * 0.35,
      centerY - radius * 0.38,
      radius * 0.1,
      centerX,
      centerY,
      radius
    );
    noseGradient.addColorStop(0, "#ff8c92");
    noseGradient.addColorStop(0.45, "#ef233c");
    noseGradient.addColorStop(1, "#9f1239");

    effectContext.ctx.fillStyle = noseGradient;
    effectContext.ctx.beginPath();
    effectContext.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    effectContext.ctx.fill();

    effectContext.ctx.shadowColor = "transparent";
    effectContext.ctx.fillStyle = "rgba(255, 255, 255, 0.68)";
    effectContext.ctx.beginPath();
    effectContext.ctx.ellipse(
      centerX - radius * 0.34,
      centerY - radius * 0.38,
      highlightRadius * 1.25,
      highlightRadius,
      -0.45,
      0,
      Math.PI * 2
    );
    effectContext.ctx.fill();
    effectContext.ctx.restore();
  });
}

function fallbackSquareHeadEffect(effectContext) {
  effectContext.detections.face.trackedFaces.forEach(({ squareRoi, sourceRect }) => {
    effectContext.ctx.drawImage(
      effectContext.frameBufferCanvas,
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      squareRoi.squareX,
      squareRoi.squareY,
      squareRoi.squareSize,
      squareRoi.squareSize
    );
  });
}

function copyPixel(sourceData, targetData, sourceIndex, targetIndex) {
  targetData[targetIndex] = sourceData[sourceIndex];
  targetData[targetIndex + 1] = sourceData[sourceIndex + 1];
  targetData[targetIndex + 2] = sourceData[sourceIndex + 2];
  targetData[targetIndex + 3] = sourceData[sourceIndex + 3];
}

function copyNearestPixel(sourceData, targetData, frameWidth, frameHeight, sourceX, sourceY, targetIndex) {
  const clampedX = clamp(Math.round(sourceX), 0, frameWidth - 1);
  const clampedY = clamp(Math.round(sourceY), 0, frameHeight - 1);
  const sourceIndex = (clampedY * frameWidth + clampedX) * 4;
  copyPixel(sourceData, targetData, sourceIndex, targetIndex);
}

function targetHeadHalfWidth(headMask, rowBounds, rowIndex, params) {
  const centerX = headMask.center.x;
  const originalHalfWidth = Math.max(centerX - rowBounds.minX[rowIndex], rowBounds.maxX[rowIndex] - centerX, 1);
  const intensity = clamp((params.intensity || 0.8) / 1.3, 0, 1);
  const squareScale = clamp((params.squareScale || 1.8) * 0.66, 0.7, 1.6);
  const stretchX = clamp((params.stretchX || 1.25) / 1.25, 0.65, 1.6);
  const squareHalfWidth = Math.max(
    headMask.height * 0.5 * squareScale * stretchX,
    headMask.representativeHalfWidth
  );
  return Math.max(originalHalfWidth, lerp(originalHalfWidth, squareHalfWidth, intensity));
}

function targetTriangleHeadHalfWidth(headMask, rowBounds, rowIndex, params) {
  const centerX = headMask.center.x;
  const originalHalfWidth = Math.max(centerX - rowBounds.minX[rowIndex], rowBounds.maxX[rowIndex] - centerX, 1);
  const intensity = clamp((params.intensity || 0.8) / 1.3, 0, 1);
  const stretchX = clamp((params.stretchX || 1.25) / 1.25, 0.65, 1.6);
  const verticalT = clamp(
    (rowIndex - headMask.bounds.minY) / Math.max(1, headMask.bounds.maxY - headMask.bounds.minY),
    0,
    1
  );
  const topHalfWidth = Math.max(headMask.height * 0.52 * stretchX, headMask.representativeHalfWidth);
  const bottomHalfWidth = Math.max(headMask.representativeHalfWidth * 0.16, headMask.height * 0.08);
  const triangleHalfWidth = lerp(topHalfWidth, bottomHalfWidth, verticalT);
  return Math.max(1, lerp(originalHalfWidth, triangleHalfWidth, intensity));
}

function backgroundColorAroundHead(sourceData, frameWidth, frameHeight, segmentation) {
  const { headMask, frameCategories } = segmentation;
  const padding = Math.max(12, Math.round(headMask.height * 0.16));
  const minX = clamp(headMask.bounds.minX - padding, 0, frameWidth - 1);
  const maxX = clamp(headMask.bounds.maxX + padding, 0, frameWidth - 1);
  const minY = clamp(headMask.bounds.minY - padding, 0, frameHeight - 1);
  const maxY = clamp(headMask.bounds.maxY + padding, 0, frameHeight - 1);
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const category = frameCategories[y * frameWidth + x];
      if (isPersonCategory(category)) {
        continue;
      }

      const pixelIndex = (y * frameWidth + x) * 4;
      totalR += sourceData[pixelIndex];
      totalG += sourceData[pixelIndex + 1];
      totalB += sourceData[pixelIndex + 2];
      count += 1;
    }
  }

  if (!count) {
    return "rgba(20, 26, 24, 1)";
  }

  return `rgb(${Math.round(totalR / count)}, ${Math.round(totalG / count)}, ${Math.round(totalB / count)})`;
}

function coverOriginalHeadArea(ctx, segmentation, frameWidth, frameHeight, fillStyle) {
  const { headMask } = segmentation;
  ctx.save();
  ctx.fillStyle = fillStyle;

  for (let y = headMask.bounds.minY; y <= headMask.bounds.maxY; y += 1) {
    if (!rowHasMask(headMask.rowBounds, y)) {
      continue;
    }

    const width = headMask.rowBounds.maxX[y] - headMask.rowBounds.minX[y] + 1;
    ctx.fillRect(clamp(headMask.rowBounds.minX[y], 0, frameWidth - 1), clamp(y, 0, frameHeight - 1), width, 1);
  }

  ctx.restore();
}

function createPersonLayerWithoutHead(sourceData, frameWidth, frameHeight, segmentation) {
  const personImage = new ImageData(frameWidth, frameHeight);
  const personData = personImage.data;
  const { frameCategories, headMask, personMask } = segmentation;

  for (let y = 0; y < frameHeight; y += 1) {
    if (!rowHasMask(personMask.rowBounds, y)) {
      continue;
    }

    for (let x = personMask.rowBounds.minX[y]; x <= personMask.rowBounds.maxX[y]; x += 1) {
      const category = frameCategories[y * frameWidth + x];
      if (!isPersonCategory(category) || isHeadCategory(category)) {
        continue;
      }

      const pixelIndex = (y * frameWidth + x) * 4;
      copyPixel(sourceData, personData, pixelIndex, pixelIndex);
    }
  }

  return {
    personImage,
    personData,
    headMask,
  };
}

function drawWarpedHeadRows(sourceData, personData, frameWidth, frameHeight, headMask, params, targetHalfWidthForRow) {
  for (let y = headMask.bounds.minY; y <= headMask.bounds.maxY; y += 1) {
    if (!rowHasMask(headMask.rowBounds, y)) {
      continue;
    }

    const targetHalfWidth = targetHalfWidthForRow(headMask, headMask.rowBounds, y, params);
    const targetMinX = clamp(Math.floor(headMask.center.x - targetHalfWidth), 0, frameWidth - 1);
    const targetMaxX = clamp(Math.ceil(headMask.center.x + targetHalfWidth), 0, frameWidth - 1);
    const sourceHalfWidth = Math.max(
      headMask.center.x - headMask.rowBounds.minX[y],
      headMask.rowBounds.maxX[y] - headMask.center.x,
      1
    );

    for (let x = targetMinX; x <= targetMaxX; x += 1) {
      const normalizedX = (x - headMask.center.x) / Math.max(1, targetHalfWidth);
      const sampleX = headMask.center.x + normalizedX * sourceHalfWidth;
      const targetIndex = (y * frameWidth + x) * 4;
      copyNearestPixel(sourceData, personData, frameWidth, frameHeight, sampleX, y, targetIndex);
    }
  }
}

function squareHeadEffect(effectContext) {
  const { detections, params } = effectContext;
  const { segmentation } = detections;

  if (!segmentation.enabled || !segmentation.headMask.valid || !segmentation.personMask.valid) {
    fallbackSquareHeadEffect(effectContext);
    return;
  }

  const frameWidth = effectContext.frameBufferCanvas.width;
  const frameHeight = effectContext.frameBufferCanvas.height;
  const sourceImage = effectContext.frameBufferContext.getImageData(0, 0, frameWidth, frameHeight);
  const sourceData = sourceImage.data;
  const { personImage, personData, headMask } = createPersonLayerWithoutHead(
    sourceData,
    frameWidth,
    frameHeight,
    segmentation
  );

  drawWarpedHeadRows(sourceData, personData, frameWidth, frameHeight, headMask, params, targetHeadHalfWidth);

  effectContext.personLayerContext.clearRect(0, 0, frameWidth, frameHeight);
  effectContext.personLayerContext.putImageData(personImage, 0, 0);
  effectContext.ctx.drawImage(effectContext.personLayerCanvas, 0, 0);
}

function triangleHeadEffect(effectContext) {
  const { detections, params } = effectContext;
  const { segmentation } = detections;

  if (!segmentation.enabled || !segmentation.headMask.valid || !segmentation.personMask.valid) {
    fallbackSquareHeadEffect(effectContext);
    return;
  }

  const frameWidth = effectContext.frameBufferCanvas.width;
  const frameHeight = effectContext.frameBufferCanvas.height;
  const sourceImage = effectContext.frameBufferContext.getImageData(0, 0, frameWidth, frameHeight);
  const sourceData = sourceImage.data;
  const backgroundFill = backgroundColorAroundHead(sourceData, frameWidth, frameHeight, segmentation);
  const { personImage, personData, headMask } = createPersonLayerWithoutHead(
    sourceData,
    frameWidth,
    frameHeight,
    segmentation
  );

  coverOriginalHeadArea(effectContext.ctx, segmentation, frameWidth, frameHeight, backgroundFill);
  drawWarpedHeadRows(sourceData, personData, frameWidth, frameHeight, headMask, params, targetTriangleHeadHalfWidth);

  effectContext.personLayerContext.clearRect(0, 0, frameWidth, frameHeight);
  effectContext.personLayerContext.putImageData(personImage, 0, 0);
  effectContext.ctx.drawImage(effectContext.personLayerCanvas, 0, 0);
}

export const effects = [
  createEffect({
    id: "faceSticker",
    requiredDetections: ["face"],
    run: faceStickerEffect,
  }),
  createEffect({
    id: "clownNose",
    requiredDetections: ["face"],
    run: clownNoseEffect,
  }),
  createEffect({
    id: "mouthBeam",
    requiredDetections: ["face"],
    run: mouthBeamEffect,
  }),
  createEffect({
    id: "eatCake",
    requiredDetections: ["face"],
    run: eatCakeEffect,
  }),
  createEffect({
    id: "squareHead",
    requiredDetections: ["face", "segmentation"],
    run: squareHeadEffect,
  }),
  createEffect({
    id: "triangleHead",
    requiredDetections: ["face", "segmentation"],
    run: triangleHeadEffect,
  }),
];

const effectMap = new Map(effects.map((effect) => [effect.id, effect]));

export function getEffectById(effectId) {
  return effectMap.get(effectId) || effects[0];
}
