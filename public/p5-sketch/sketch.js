// colmap pose estimator
// David Chatting - davidchatting.com

p5.disableFriendlyErrors = true;

const API_BASE = 'https://labs.davidchatting.com/colmap';

let droppedImages  = [];
let status         = 'DROP 2+ IMAGES THEN PRESS SPACE';
let poses          = null;
let camPositions   = [];  // world-space camera centres
let camForwards    = [];  // world-space look directions
let submitPoseJob  = null;

// 3D view
let pg3d;
let orbitX   = -0.4;
let orbitY   = 0.3;
let dragging = false;
let lastMX, lastMY;

const THUMB_RATIO = 0.32;  // fraction of canvas height used by thumbnails
const STATUS_H    = 32;

import(API_BASE + '/client.js')
  .then(mod => { submitPoseJob = mod.submitPoseJob })
  .catch(err => { status = 'API client failed to load: ' + err.message });

// ── p5 lifecycle ──────────────────────────────────────────────────────────────

function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  textFont('monospace');
  canvas.drop(onFileDropped);
  buildGraphicsBuffer();
}

function draw() {
  background(18);

  const thumbH  = height * THUMB_RATIO;
  const view3DY = thumbH + STATUS_H;
  const view3DH = height - view3DY;

  drawThumbnails(thumbH);
  drawStatus(thumbH);

  if (camPositions.length > 0) {
    render3D(view3DH);
    image(pg3d, 0, view3DY);
    drawOrbitHint(view3DY);
  } else if (poses) {
    // poses received but reconstruction was empty
    fill(180, 80, 80);
    textSize(12);
    textAlign(CENTER, CENTER);
    text('No camera positions recovered', width / 2, view3DY + view3DH / 2);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildGraphicsBuffer();
}

// ── File drop ─────────────────────────────────────────────────────────────────

function onFileDropped(file) {
  if (!file.type.startsWith('image')) return;

  const p5img = loadImage(file.data);
  const el    = createImg(file.data, '');
  el.style('visibility', 'hidden');

  droppedImages.push({ p5img, el });
  poses        = null;
  camPositions = [];
  status = `${droppedImages.length} image(s) — press SPACE to run COLMAP`;
}

// ── Key handler ───────────────────────────────────────────────────────────────

function keyPressed() {
  if (key === ' ' && droppedImages.length >= 2) runColmap();
}

// ── COLMAP job ────────────────────────────────────────────────────────────────

async function runColmap() {
  if (!submitPoseJob) { status = 'API client not loaded yet'; return; }

  status       = 'Starting…';
  poses        = null;
  camPositions = [];
  camForwards  = [];

  try {
    const domImgs = droppedImages.map(d => d.el.elt);
    const result  = await submitPoseJob(domImgs, {
      apiBase:    API_BASE,
      onProgress: ({ stage }) => { status = stage || status },
    });

    poses = result.poses;
    camPositions = poses.map(poseToWorldPos);
    camForwards  = poses.map(poseToWorldForward);
    status = `Done — ${poses.length} pose(s) estimated`;
  } catch (err) {
    status = 'Error: ' + err.message;
  }
}

// ── Mouse orbit ───────────────────────────────────────────────────────────────

function mousePressed() {
  if (mouseY > height * THUMB_RATIO + STATUS_H && camPositions.length > 0) {
    dragging = true;
    lastMX   = mouseX;
    lastMY   = mouseY;
  }
}

function mouseDragged() {
  if (!dragging) return;
  orbitY += (mouseX - lastMX) * 0.008;
  orbitX += (mouseY - lastMY) * 0.008;
  lastMX  = mouseX;
  lastMY  = mouseY;
}

function mouseReleased() { dragging = false; }

// ── Drawing ───────────────────────────────────────────────────────────────────

function drawThumbnails(thumbH) {
  if (droppedImages.length === 0) {
    fill(70);
    noStroke();
    textSize(14);
    textAlign(CENTER, CENTER);
    text('DROP IMAGES HERE', width / 2, thumbH / 2);
    return;
  }

  const thumbW = width / droppedImages.length;
  for (let i = 0; i < droppedImages.length; i++) {
    const img = droppedImages[i].p5img;
    if (!img || img.width === 0) continue;
    const s = min(thumbW / img.width, thumbH / img.height);
    const x = i * thumbW + (thumbW - img.width * s) / 2;
    const y = (thumbH - img.height * s) / 2;
    push();
      translate(x, y);
      image(img, 0, 0, img.width * s, img.height * s);
    pop();
  }
}

function drawStatus(thumbH) {
  fill(130);
  noStroke();
  textSize(12);
  textAlign(LEFT, CENTER);
  text(status, 16, thumbH + STATUS_H / 2);
}

function drawOrbitHint(view3DY) {
  fill(50);
  noStroke();
  textSize(10);
  textAlign(RIGHT, BOTTOM);
  text('drag to orbit', width - 10, height - 6);
}

function buildGraphicsBuffer() {
  if (pg3d) pg3d.remove();
  const thumbH  = height * THUMB_RATIO;
  const view3DH = max(100, height - thumbH - STATUS_H);
  pg3d = createGraphics(width, view3DH, WEBGL);
}

function render3D(view3DH) {
  pg3d.background(24);
  pg3d.ambientLight(60);
  pg3d.directionalLight(255, 255, 255, 0.3, 0.5, -1);

  // Fixed camera looking along -Z
  const fov = PI / 3;
  pg3d.perspective(fov, width / view3DH, 0.1, 10000);
  pg3d.camera(0, 0, 400, 0, 0, 0, 0, 1, 0);

  pg3d.rotateX(orbitX);
  pg3d.rotateY(orbitY);

  // Centre the point cloud
  const cx = average(camPositions.map(p => p.x));
  const cy = average(camPositions.map(p => p.y));
  const cz = average(camPositions.map(p => p.z));
  pg3d.translate(-cx, -cy, -cz);

  // Scale so the spread fits comfortably
  const spread = maxSpread(camPositions, cx, cy, cz) || 1;
  const s = 120 / spread;
  pg3d.scale(s, s, s);

  // World origin axes
  drawAxes(12 / s);

  // Connecting lines
  pg3d.stroke(50, 80, 200);
  pg3d.strokeWeight(1.5 / s);
  pg3d.noFill();
  for (let i = 0; i < camPositions.length - 1; i++) {
    const a = camPositions[i], b = camPositions[i + 1];
    pg3d.line(a.x, a.y, a.z, b.x, b.y, b.z);
  }

  // Camera frustum pyramids
  for (let i = 0; i < camPositions.length; i++) {
    drawCamera(camPositions[i], camForwards[i], 6 / s, i);
  }
}

function drawCamera(pos, fwd, size) {
  pg3d.push();
  pg3d.translate(pos.x, pos.y, pos.z);

  // Rotate so cone's default +Y axis aligns with the forward direction
  // axis = [0,1,0] × fwd = [fwd.z, 0, -fwd.x]
  const axisLen = Math.sqrt(fwd.z * fwd.z + fwd.x * fwd.x);
  const angle   = Math.acos(Math.max(-1, Math.min(1, fwd.y)));

  if (axisLen > 0.001) {
    pg3d.rotate(angle, [fwd.z / axisLen, 0, -fwd.x / axisLen]);
  } else if (fwd.y < 0) {
    pg3d.rotateX(Math.PI); // pointing straight back — flip 180°
  }

  // Shift along the (now-rotated) Y axis so cone tip sits at camera position
  pg3d.translate(0, size * 0.5, 0);

  pg3d.noStroke();
  pg3d.fill(220, 130, 50);
  pg3d.cone(size * 0.45, size);

  pg3d.pop();
}

function drawAxes(size) {
  pg3d.strokeWeight(1.5);
  pg3d.stroke(220, 60, 60);  pg3d.line(0,0,0, size,0,0);  // X red
  pg3d.stroke(60, 220, 60);  pg3d.line(0,0,0, 0,size,0);  // Y green
  pg3d.stroke(60, 60, 220);  pg3d.line(0,0,0, 0,0,size);  // Z blue
}

// ── Pose math ─────────────────────────────────────────────────────────────────

// COLMAP stores world-to-camera transform: p_cam = R * p_world + t
// Camera centre in world = -R^T * t

function poseToWorldPos(pose) {
  const R  = quatToRotMatrix(pose.rotation);
  const t  = pose.translation;
  // Camera position = -R^T * t  (R^T = transpose of R)
  return {
    x: -(R[0]*t.tx + R[3]*t.ty + R[6]*t.tz),
    y: -(R[1]*t.tx + R[4]*t.ty + R[7]*t.tz),
    z: -(R[2]*t.tx + R[5]*t.ty + R[8]*t.tz),
  };
}

function poseToWorldForward(pose) {
  // Camera looks along local +Z; in world space that is the third column of R^T
  // = third row of R = R[6], R[7], R[8]  (row-major, row=2)
  const R = quatToRotMatrix(pose.rotation);
  return { x: R[6], y: R[7], z: R[8] };
}

// Returns flat row-major 3x3 rotation matrix from unit quaternion
function quatToRotMatrix({ qw, qx, qy, qz }) {
  return [
    1-2*(qy*qy+qz*qz),  2*(qx*qy-qw*qz),    2*(qx*qz+qw*qy),
    2*(qx*qy+qw*qz),    1-2*(qx*qx+qz*qz),  2*(qy*qz-qw*qx),
    2*(qx*qz-qw*qy),    2*(qy*qz+qw*qx),    1-2*(qx*qx+qy*qy),
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function average(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }

function maxSpread(pts, cx, cy, cz) {
  return pts.reduce((m, p) => {
    return Math.max(m, Math.sqrt((p.x-cx)**2 + (p.y-cy)**2 + (p.z-cz)**2));
  }, 0);
}

function fmt(n) { return n.toFixed(3); }
