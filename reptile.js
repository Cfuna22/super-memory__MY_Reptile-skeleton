/**
 * Procedural Reptile Interactive Cursor
 * Inverse Kinematics & Physics-driven Skeletal Simulation
 */

(function () {
  'use strict';

  // --- Audio Synth for subtle mechanical/organic footstep clicks ---
  class StepAudio {
    constructor() {
      this.enabled = false;
      this.ctx = null;
    }

    init() {
      if (!this.ctx && typeof AudioContext !== 'undefined') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    playStep(isHeavy = false) {
      if (!this.enabled || !this.ctx) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;
        
        osc.type = isHeavy ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(isHeavy ? 180 : 280, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.04);
        
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.04);
      } catch (e) {}
    }
  }

  const audio = new StepAudio();

  // --- Math Helpers ---
  function dist(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function angleDiff(a, b) {
    let diff = (a - b) % (Math.PI * 2);
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (diff > Math.PI) diff -= Math.PI * 2;
    return diff;
  }

  // --- 2-Bone Analytical IK Solver ---
  function solve2BoneIK(p0, p2, len1, len2, bendDirection) {
    const dx = p2.x - p0.x;
    const dy = p2.y - p0.y;
    const d = Math.hypot(dx, dy);
    const clampedD = Math.max(0.1, Math.min(d, len1 + len2 - 0.01));
    const baseAngle = Math.atan2(dy, dx);

    // Law of cosines: c^2 = a^2 + b^2 - 2ab * cos(C)
    const cosAngle0 = (len1 * len1 + clampedD * clampedD - len2 * len2) / (2 * len1 * clampedD);
    const clampedCos0 = Math.max(-1, Math.min(1, cosAngle0));
    const angle0 = Math.acos(clampedCos0);

    const kneeAngle = baseAngle + bendDirection * angle0;
    const knee = {
      x: p0.x + Math.cos(kneeAngle) * len1,
      y: p0.y + Math.sin(kneeAngle) * len1
    };

    return knee;
  }

  // --- Leg Representation ---
  class Leg {
    constructor(spineIndex, side, config = {}) {
      this.spineIndex = spineIndex; // Which vertebra the hip is attached to
      this.side = side;             // -1 for left, 1 for right
      this.upperLen = config.upperLen || 34;
      this.lowerLen = config.lowerLen || 36;
      this.reachDist = config.reachDist || 58;
      this.reachAngle = config.reachAngle || 0.35; // Angle forward/backward from normal
      this.stepDistThreshold = config.stepDistThreshold || 42;
      this.stepSpeed = config.stepSpeed || 0.16; // Interpolation speed per frame

      this.currentPos = { x: 0, y: 0 };
      this.targetPos = { x: 0, y: 0 };
      this.stepStartPos = { x: 0, y: 0 };
      this.isStepping = false;
      this.stepProgress = 1;
      this.oppositeLeg = null; // Reference to paired leg for alternating gait
    }

    init(x, y) {
      this.currentPos = { x, y };
      this.targetPos = { x, y };
      this.stepStartPos = { x, y };
      this.stepProgress = 1;
      this.isStepping = false;
    }

    update(hip, bodyDir, bodyNorm, moveSpeed) {
      // Ideal neutral landing spot for this foot relative to hip
      // side is -1 or 1, normal is perpendicular to spine
      const outward = {
        x: bodyNorm.x * this.side,
        y: bodyNorm.y * this.side
      };

      // Slight forward lead based on movement
      const forwardLead = Math.min(moveSpeed * 6, 32);
      const idealTarget = {
        x: hip.x + outward.x * this.reachDist + bodyDir.x * (this.reachAngle * this.reachDist + forwardLead),
        y: hip.y + outward.y * this.reachDist + bodyDir.y * (this.reachAngle * this.reachDist + forwardLead)
      };

      const d = dist(this.currentPos, idealTarget);
      const maxReach = (this.upperLen + this.lowerLen) * 0.96;
      const hipDist = dist(this.currentPos, hip);
      const isOverextended = hipDist > maxReach;

      // Stepping check: must exceed threshold AND partner must not be mid-step (or overextended)
      const partnerCanStep = !this.oppositeLeg || !this.oppositeLeg.isStepping;

      if (!this.isStepping && ((d > this.stepDistThreshold && partnerCanStep) || isOverextended)) {
        this.isStepping = true;
        this.stepProgress = 0;
        this.stepStartPos = { ...this.currentPos };
        // Step slightly ahead of ideal target to account for forward motion
        const stepLead = Math.min(moveSpeed * 3.5, 30);
        this.targetPos = {
          x: idealTarget.x + bodyDir.x * stepLead,
          y: idealTarget.y + bodyDir.y * stepLead
        };
      }

      if (this.isStepping) {
        const stepRate = Math.max(this.stepSpeed, Math.min(0.32, moveSpeed * 0.025));
        this.stepProgress += stepRate;
        if (this.stepProgress >= 1) {
          this.stepProgress = 1;
          this.isStepping = false;
          this.currentPos = { ...this.targetPos };
          audio.playStep(this.spineIndex > 20);
        } else {
          // Smooth step curve (ease out)
          const t = this.stepProgress;
          const ease = t * (2 - t);
          this.currentPos.x = lerp(this.stepStartPos.x, this.targetPos.x, ease);
          this.currentPos.y = lerp(this.stepStartPos.y, this.targetPos.y, ease);
        }
      }
    }

    draw(ctx, hip) {
      // Calculate knee using 2-bone IK
      // Knee bends backward relative to side
      const bendSign = this.side > 0 ? 1 : -1;
      const knee = solve2BoneIK(hip, this.currentPos, this.upperLen, this.lowerLen, bendSign);

      // Draw bones
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
      ctx.lineTo(knee.x, knee.y);
      ctx.lineTo(this.currentPos.x, this.currentPos.y);
      ctx.stroke();

      // Joint nodes
      ctx.beginPath();
      ctx.arc(hip.x, hip.y, 2, 0, Math.PI * 2);
      ctx.arc(knee.x, knee.y, 2.2, 0, Math.PI * 2);
      ctx.arc(this.currentPos.x, this.currentPos.y, 2, 0, Math.PI * 2);
      ctx.fill();

      // Foot digits (5 splayed claws/toes)
      const footDirX = this.currentPos.x - knee.x;
      const footDirY = this.currentPos.y - knee.y;
      const footAngle = Math.atan2(footDirY, footDirX);
      const toeCount = 5;
      const toeLen = 8;
      const toeSpread = 0.9; // radians

      ctx.beginPath();
      for (let i = 0; i < toeCount; i++) {
        const spreadAngle = footAngle - toeSpread / 2 + (i / (toeCount - 1)) * toeSpread;
        const tx = this.currentPos.x + Math.cos(spreadAngle) * toeLen;
        const ty = this.currentPos.y + Math.sin(spreadAngle) * toeLen;
        ctx.moveTo(this.currentPos.x, this.currentPos.y);
        ctx.lineTo(tx, ty);
        // tiny claw tip
        ctx.arc(tx, ty, 0.8, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
  }

  // --- Main Reptile Creature ---
  class ReptileCreature {
    constructor(preset = 'reptile') {
      this.preset = preset;
      this.segmentCount = 52;
      this.segmentLength = 11;
      this.maxBendAngle = 0.38; // Maximum angle deviation per segment (radians)

      this.spine = [];
      this.angles = [];
      this.headAngle = 0;
      this.headPos = { x: 400, y: 300 };

      // Movement dynamics
      this.speed = 0;
      this.baseSpeed = 7;
      this.sprintSpeed = 13;
      this.turnSpeed = 0.12;
      this.slitherFreq = 0.14;
      this.slitherAmp = 0.18;
      this.slitherTime = 0;

      // Legs setup
      this.legs = [];
      this.initSpine();
      this.setPreset(preset);
    }

    initSpine() {
      this.spine = [];
      this.angles = [];
      for (let i = 0; i < this.segmentCount; i++) {
        this.spine.push({
          x: this.headPos.x - i * this.segmentLength,
          y: this.headPos.y
        });
        this.angles.push(0);
      }
    }

    setPreset(name) {
      this.preset = name;
      this.legs = [];

      let legIndices = [];
      let upper = 34, lower = 36, reach = 60;

      if (name === 'reptile') {
        // 5 pairs of legs along torso (exact match to screenshot)
        legIndices = [8, 14, 20, 26, 32];
        upper = 34; lower = 36; reach = 60;
      } else if (name === 'lizard') {
        // Classic 2 pairs of legs (front shoulders and rear pelvis)
        legIndices = [8, 28];
        upper = 44; lower = 46; reach = 72;
      } else if (name === 'centipede') {
        // 8 pairs of legs along body
        legIndices = [6, 10, 14, 18, 22, 26, 30, 34];
        upper = 26; lower = 28; reach = 48;
      } else if (name === 'snake') {
        // Serpent mode - no legs
        legIndices = [];
      }

      // Instantiate paired legs
      for (const idx of legIndices) {
        const leftLeg = new Leg(idx, -1, {
          upperLen: upper,
          lowerLen: lower,
          reachDist: reach,
          stepDistThreshold: reach * 0.72
        });
        const rightLeg = new Leg(idx, 1, {
          upperLen: upper,
          lowerLen: lower,
          reachDist: reach,
          stepDistThreshold: reach * 0.72
        });

        // Link opposites for alternating gait
        leftLeg.oppositeLeg = rightLeg;
        rightLeg.oppositeLeg = leftLeg;

        // Position feet initially
        const p = this.spine[Math.min(idx, this.spine.length - 1)];
        leftLeg.init(p.x - reach, p.y);
        rightLeg.init(p.x + reach, p.y);

        this.legs.push(leftLeg, rightLeg);
      }
    }

    setSegmentCount(count) {
      count = Math.max(30, Math.min(85, count));
      if (count === this.segmentCount) return;

      const oldSpine = [...this.spine];
      this.segmentCount = count;
      this.spine = [];
      this.angles = [];

      for (let i = 0; i < this.segmentCount; i++) {
        if (i < oldSpine.length) {
          this.spine.push({ ...oldSpine[i] });
          this.angles.push(this.angles[i] || 0);
        } else {
          const last = this.spine[this.spine.length - 1];
          this.spine.push({ x: last.x - this.segmentLength, y: last.y });
          this.angles.push(0);
        }
      }
      this.setPreset(this.preset);
    }

    update(targetX, targetY, isSprint) {
      // 1. Head Steering & Physics
      const dx = targetX - this.headPos.x;
      const dy = targetY - this.headPos.y;
      const d = Math.hypot(dx, dy);

      const targetSpeed = isSprint ? this.sprintSpeed : this.baseSpeed;

      // Slow down when hovering directly on target
      let desiredSpeed = 0;
      if (d > 14) {
        desiredSpeed = Math.min(targetSpeed, d * 0.18);
      }
      this.speed = lerp(this.speed, desiredSpeed, 0.15);

      // Angle toward target
      const targetAngle = Math.atan2(dy, dx);
      const angleDiffToTarget = angleDiff(targetAngle, this.headAngle);

      // Smooth turn towards cursor
      this.headAngle += Math.sign(angleDiffToTarget) * Math.min(Math.abs(angleDiffToTarget), this.turnSpeed);

      // Slither oscillation while moving
      if (this.speed > 0.5) {
        this.slitherTime += this.slitherFreq * (this.speed / this.baseSpeed);
      }
      const sway = Math.sin(this.slitherTime) * this.slitherAmp * (this.speed / targetSpeed);
      const effectiveAngle = this.headAngle + sway;

      // Advance head position
      this.headPos.x += Math.cos(effectiveAngle) * this.speed;
      this.headPos.y += Math.sin(effectiveAngle) * this.speed;
      this.spine[0].x = this.headPos.x;
      this.spine[0].y = this.headPos.y;
      this.angles[0] = effectiveAngle;

      // 2. Spine Chain Resolution with Distance & Angular Constraints
      for (let i = 1; i < this.segmentCount; i++) {
        const prev = this.spine[i - 1];
        const curr = this.spine[i];

        const segDx = curr.x - prev.x;
        const segDy = curr.y - prev.y;
        let segAngle = Math.atan2(segDy, segDx);

        // Limit angle relative to previous segment to keep spine smooth
        const refAngle = i === 1 ? effectiveAngle + Math.PI : this.angles[i - 1];
        const diff = angleDiff(segAngle, refAngle);

        if (Math.abs(diff) > this.maxBendAngle) {
          segAngle = refAngle + Math.sign(diff) * this.maxBendAngle;
        }

        this.angles[i] = segAngle;

        // Enforce rigid segment distance
        curr.x = prev.x + Math.cos(segAngle) * this.segmentLength;
        curr.y = prev.y + Math.sin(segAngle) * this.segmentLength;
      }

      // 3. Update Legs
      for (const leg of this.legs) {
        const segIdx = Math.min(leg.spineIndex, this.segmentCount - 2);
        const p1 = this.spine[segIdx];
        const p0 = this.spine[Math.max(0, segIdx - 1)];

        // Compute local spine direction and normal
        const segDx = p0.x - p1.x;
        const segDy = p0.y - p1.y;
        const segLen = Math.hypot(segDx, segDy) || 1;
        const bodyDir = { x: segDx / segLen, y: segDy / segLen };
        const bodyNorm = { x: -bodyDir.y, y: bodyDir.x };

        // Hip attachment offset
        const bodyWidth = this.getBodyWidth(segIdx);
        const hip = {
          x: p1.x + bodyNorm.x * (leg.side * bodyWidth * 0.85),
          y: p1.y + bodyNorm.y * (leg.side * bodyWidth * 0.85)
        };

        leg.update(hip, bodyDir, bodyNorm, this.speed);
      }
    }

    getBodyWidth(i) {
      // Shape profile: narrow neck, swell at chest/belly, taper to tail
      const ribStart = 4;
      const ribEnd = Math.floor(this.segmentCount * 0.62);
      if (i < ribStart) {
        return lerp(10, 22, i / ribStart);
      } else if (i <= ribEnd) {
        const t = (i - ribStart) / (ribEnd - ribStart);
        return 22 + Math.sin(t * Math.PI) * 16; // Peak body width ~38px
      } else {
        const t = (i - ribEnd) / (this.segmentCount - ribEnd);
        return lerp(22, 2, t);
      }
    }

    draw(ctx, enableGlow = true) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (enableGlow) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.45)';
        ctx.shadowBlur = 6;
      } else {
        ctx.shadowBlur = 0;
      }

      // 1. Draw Legs first (so body overlays the hips)
      for (const leg of this.legs) {
        const segIdx = Math.min(leg.spineIndex, this.segmentCount - 2);
        const p1 = this.spine[segIdx];
        const p0 = this.spine[Math.max(0, segIdx - 1)];
        const segDx = p0.x - p1.x;
        const segDy = p0.y - p1.y;
        const segLen = Math.hypot(segDx, segDy) || 1;
        const bodyNorm = { x: -segDy / segLen, y: segDx / segLen };
        const bodyWidth = this.getBodyWidth(segIdx);

        const hip = {
          x: p1.x + bodyNorm.x * (leg.side * bodyWidth * 0.85),
          y: p1.y + bodyNorm.y * (leg.side * bodyWidth * 0.85)
        };

        leg.draw(ctx, hip);
      }

      // 2. Draw Longitudinal Flank Lines (connecting ribs along left and right flanks)
      const ribStart = 4;
      const ribEnd = Math.floor(this.segmentCount * 0.62);

      // Left & Right boundary curves
      for (const side of [-1, 1]) {
        ctx.beginPath();
        let started = false;
        for (let i = ribStart; i <= ribEnd; i++) {
          const p = this.spine[i];
          const prev = this.spine[i - 1];
          const next = this.spine[Math.min(i + 1, this.segmentCount - 1)];
          const dx = prev.x - next.x;
          const dy = prev.y - next.y;
          const len = Math.hypot(dx, dy) || 1;
          const norm = { x: -dy / len, y: dx / len };
          const w = this.getBodyWidth(i) * 0.52; // Mid-rib contour line

          const lx = p.x + norm.x * (side * w);
          const ly = p.y + norm.y * (side * w);

          if (!started) {
            ctx.moveTo(lx, ly);
            started = true;
          } else {
            ctx.lineTo(lx, ly);
          }
        }
        ctx.stroke();
      }

      // 3. Draw Ribs & Vertebrae
      for (let i = 0; i < this.segmentCount; i++) {
        const p = this.spine[i];
        const prev = this.spine[Math.max(0, i - 1)];
        const next = this.spine[Math.min(i + 1, this.segmentCount - 1)];

        const dx = prev.x - next.x;
        const dy = prev.y - next.y;
        const len = Math.hypot(dx, dy) || 1;
        const dir = { x: dx / len, y: dy / len };
        const norm = { x: -dir.y, y: dir.x };
        const w = this.getBodyWidth(i);

        if (i >= ribStart && i <= ribEnd) {
          // Curved crescent ribs in ribcage area (arching backwards towards the tail!)
          const sweepBack = w * 0.38;
          const leftTip = {
            x: p.x - norm.x * w - dir.x * sweepBack,
            y: p.y - norm.y * w - dir.y * sweepBack
          };
          const rightTip = {
            x: p.x + norm.x * w - dir.x * sweepBack,
            y: p.y + norm.y * w - dir.y * sweepBack
          };

          // Continuous curved arc through vertebra
          ctx.beginPath();
          ctx.moveTo(leftTip.x, leftTip.y);
          ctx.quadraticCurveTo(p.x + dir.x * (w * 0.1), p.y + dir.y * (w * 0.1), rightTip.x, rightTip.y);
          ctx.stroke();
        } else if (i > ribEnd) {
          // Chevron / herringbone spines along tail section (`>`)
          const tailProgress = (i - ribEnd) / (this.segmentCount - ribEnd);
          const tailSpan = lerp(16, 3, tailProgress);
          const sweepBack = tailSpan * 1.25;

          ctx.beginPath();
          // Left spine
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - norm.x * tailSpan - dir.x * sweepBack, p.y - norm.y * tailSpan - dir.y * sweepBack);
          // Right spine
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + norm.x * tailSpan - dir.x * sweepBack, p.y + norm.y * tailSpan - dir.y * sweepBack);
          ctx.stroke();
        }

        // Vertebra disc dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 0 ? 3 : 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Central Spine Line
      ctx.beginPath();
      ctx.moveTo(this.spine[0].x, this.spine[0].y);
      for (let i = 1; i < this.segmentCount; i++) {
        ctx.lineTo(this.spine[i].x, this.spine[i].y);
      }
      ctx.stroke();

      // 5. Detailed Skull/Head
      this.drawHead(ctx);

      ctx.restore();
    }

    drawHead(ctx) {
      const p0 = this.spine[0];
      const p1 = this.spine[1];
      const dx = p0.x - p1.x;
      const dy = p0.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const forward = { x: dx / len, y: dy / len };
      const right = { x: -forward.y, y: forward.x };

      const snoutLen = 22;
      const jawWidth = 14;
      const jawBack = 6;

      const snoutTip = {
        x: p0.x + forward.x * snoutLen,
        y: p0.y + forward.y * snoutLen
      };
      const jawL = {
        x: p0.x - right.x * jawWidth - forward.x * jawBack,
        y: p0.y - right.y * jawWidth - forward.y * jawBack
      };
      const jawR = {
        x: p0.x + right.x * jawWidth - forward.x * jawBack,
        y: p0.y + right.y * jawWidth - forward.y * jawBack
      };

      // Skull contour
      ctx.beginPath();
      ctx.moveTo(snoutTip.x, snoutTip.y);
      ctx.lineTo(jawL.x, jawL.y);
      ctx.lineTo(p0.x, p0.y);
      ctx.lineTo(jawR.x, jawR.y);
      ctx.closePath();
      ctx.stroke();

      // Snout tip circle
      ctx.beginPath();
      ctx.arc(snoutTip.x, snoutTip.y, 2.8, 0, Math.PI * 2);
      ctx.stroke();

      // Eye sockets
      const eyeForward = forward.x * 9;
      const eyeForwardY = forward.y * 9;
      const eyeSide = jawWidth * 0.55;

      const eyeL = {
        x: p0.x + eyeForward - right.x * eyeSide,
        y: p0.y + eyeForwardY - right.y * eyeSide
      };
      const eyeR = {
        x: p0.x + eyeForward + right.x * eyeSide,
        y: p0.y + eyeForwardY + right.y * eyeSide
      };

      ctx.beginPath();
      ctx.arc(eyeL.x, eyeL.y, 1.8, 0, Math.PI * 2);
      ctx.arc(eyeR.x, eyeR.y, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Whisker / mandibles feelers
      const feelerLen = 9;
      ctx.beginPath();
      ctx.moveTo(snoutTip.x, snoutTip.y);
      ctx.lineTo(snoutTip.x + forward.x * feelerLen - right.x * 5, snoutTip.y + forward.y * feelerLen - right.y * 5);
      ctx.moveTo(snoutTip.x, snoutTip.y);
      ctx.lineTo(snoutTip.x + forward.x * feelerLen + right.x * 5, snoutTip.y + forward.y * feelerLen + right.y * 5);
      ctx.stroke();
    }
  }

  // --- Food Bait Particle System ---
  class FoodBaitManager {
    constructor() {
      this.baits = [];
    }

    spawn(x, y) {
      this.baits.push({
        x,
        y,
        radius: 4,
        pulse: 0,
        energy: 1
      });
    }

    update(headPos, onEaten) {
      for (let i = this.baits.length - 1; i >= 0; i--) {
        const b = this.baits[i];
        b.pulse += 0.08;
        const d = dist(headPos, b);
        if (d < 18) {
          // Eaten!
          onEaten(b);
          this.baits.splice(i, 1);
        }
      }
    }

    draw(ctx) {
      for (const b of this.baits) {
        ctx.save();
        ctx.strokeStyle = '#34d399';
        ctx.fillStyle = '#34d399';
        ctx.shadowColor = '#34d399';
        ctx.shadowBlur = 10;

        const r = b.radius + Math.sin(b.pulse) * 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(b.x, b.y, 1.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }
  }

  // --- App Initialization & Canvas Driver ---
  window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('viewport') || document.getElementById('cursor-canvas');
    if (!canvas) return;

    const wrapper = document.getElementById('canvas-wrapper') || document.body;
    const isOverlayMode = canvas.id === 'cursor-canvas';
    const ctx = canvas.getContext('2d');

    const reptile = new ReptileCreature('reptile');
    const baitManager = new FoodBaitManager();

    let mousePos = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
    let isMouseDown = false;
    let enableGlow = true;

    // Handle high-DPI displays
    function resize() {
      const w = isOverlayMode ? window.innerWidth : wrapper.clientWidth;
      const h = isOverlayMode ? window.innerHeight : wrapper.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform before scaling
      ctx.scale(dpr, dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      // Keep creature in view on start
      if (reptile.headPos.x === 400 && reptile.headPos.y === 300) {
        mousePos.x = w * 0.6;
        mousePos.y = h * 0.5;
        reptile.headPos.x = w * 0.35;
        reptile.headPos.y = h * 0.5;
        reptile.initSpine();
        reptile.setPreset(reptile.preset);
      }
    }

    window.addEventListener('resize', resize);
    resize();

    // Mouse Tracking
    const mouseTarget = isOverlayMode ? window : wrapper;
    mouseTarget.addEventListener('mousemove', (e) => {
      if (isOverlayMode) {
        mousePos.x = e.clientX;
        mousePos.y = e.clientY;
      } else {
        const rect = wrapper.getBoundingClientRect();
        mousePos.x = e.clientX - rect.left;
        mousePos.y = e.clientY - rect.top;
      }
    });

    mouseTarget.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        isMouseDown = true;
        audio.init();
      }
    });

    window.addEventListener('mouseup', () => {
      isMouseDown = false;
    });

    // Touch Support for mobile/tablets
    mouseTarget.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        if (isOverlayMode) {
          mousePos.x = e.touches[0].clientX;
          mousePos.y = e.touches[0].clientY;
        } else {
          const rect = wrapper.getBoundingClientRect();
          mousePos.x = e.touches[0].clientX - rect.left;
          mousePos.y = e.touches[0].clientY - rect.top;
        }
      }
    }, { passive: true });

    // Spawn bait with Spacebar
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        baitManager.spawn(mousePos.x, mousePos.y);
      }
    });

    // UI Controls (if present)
    const presetButtons = document.querySelectorAll('[data-preset]');
    presetButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        presetButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        reptile.setPreset(e.target.dataset.preset);
      });
    });

    const speedSlider = document.getElementById('speedSlider');
    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        reptile.baseSpeed = val;
        reptile.sprintSpeed = val * 1.8;
      });
    }

    const lengthSlider = document.getElementById('lengthSlider');
    if (lengthSlider) {
      lengthSlider.addEventListener('input', (e) => {
        reptile.setSegmentCount(parseInt(e.target.value, 10));
      });
    }

    const toggleGlowBtn = document.getElementById('toggleGlow');
    if (toggleGlowBtn) {
      toggleGlowBtn.addEventListener('click', () => {
        enableGlow = !enableGlow;
        toggleGlowBtn.textContent = `Glow: ${enableGlow ? 'ON' : 'OFF'}`;
      });
    }

    const toggleSoundBtn = document.getElementById('toggleSound');
    if (toggleSoundBtn) {
      toggleSoundBtn.addEventListener('click', () => {
        audio.init();
        audio.enabled = !audio.enabled;
        toggleSoundBtn.textContent = `Audio: ${audio.enabled ? 'ON' : 'OFF'}`;
      });
    }

    // Main Animation Loop
    function loop() {
      const w = isOverlayMode ? window.innerWidth : wrapper.clientWidth;
      const h = isOverlayMode ? window.innerHeight : wrapper.clientHeight;

      // Clear Canvas
      ctx.clearRect(0, 0, w, h);

      // Determine target (bait if nearby, otherwise mouse)
      let targetX = mousePos.x;
      let targetY = mousePos.y;

      if (baitManager.baits.length > 0) {
        let closest = null;
        let minDist = Infinity;
        for (const b of baitManager.baits) {
          const d = dist(reptile.headPos, b);
          if (d < minDist) {
            minDist = d;
            closest = b;
          }
        }
        if (closest) {
          targetX = closest.x;
          targetY = closest.y;
        }
      }

      // Update Reptile
      reptile.update(targetX, targetY, isMouseDown);

      // Update Bait
      baitManager.update(reptile.headPos, (b) => {
        audio.playStep(true);
      });

      // Render
      baitManager.draw(ctx);
      reptile.draw(ctx, enableGlow);

      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
  });
})();
