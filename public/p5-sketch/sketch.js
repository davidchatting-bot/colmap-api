// colmap pose estimator
// David Chatting - davidchatting.com

p5.disableFriendlyErrors = true;

const API_BASE = 'https://labs.davidchatting.com/colmap';

let droppedImages  = [];
let status         = 'DROP 2+ IMAGES THEN PRESS SPACE';
let poses          = null;
let cameras        = null;  // intrinsics keyed by cameraId
let camPositions   = [];
let submitPoseJob  = null;

// 3D view
let pg3d;
let orbitX   = -0.4;
let orbitY   = 0.3;
let dragging = false;
let lastMX, lastMY;

const THUMB_RATIO = 0.32;
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
    fill(50); noStroke(); textSize(10); textAlign(RIGHT, BOTTOM);
    text('drag to orbit', width - 10, height - 6);
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
  poses = null; cameras = null; camPositions = [];
  status = `${droppedImages.length} image(s) — press SPACE to run COLMAP`;
}

function keyPressed() {
  if (key === ' ' && droppedImages.length >= 2) runColmap();
}

// ── COLMAP job ────────────────────────────────────────────────────────────────

async function runColmap() {
  if (!submitPoseJob) { status = 'API client not loaded yet'; return; }
  status = 'Starting…'; poses = null; cameras = null; camPositions = [];

  try {
    const domImgs = droppedImages.map(d => d.el.elt);
    const result  = await submitPoseJob(domImgs, {
      apiBase:    API_BASE,
      onProgress: ({ stage }) => { status = stage || status },
    });
    poses        = result.poses;
    cameras      = result.cameras;
    camPositions = poses.map(poseToWorldPos);
    status = `Done — ${poses.length} pose(s) estimated`;
  } catch (err) {
    status = 'Error: ' + err.message;
  }
}

// ── Mouse orbit ───────────────────────────────────────────────────────────────

function mousePressed() {
  if (mouseY > height * THUMB_RATIO + STATUS_H && camPositions.length > 0) {
    dragging = true; lastMX = mouseX; lastMY = mouseY;
  }
}
function mouseDragged() {
  if (!dragging) return;
  orbitY += (mouseX - lastMX) * 0.008;
  orbitX += (mouseY - lastMY) * 0.008;
  lastMX = mouseX; lastMY = mouseY;
}
function mouseReleased() { dragging = false; }

// ── Drawing ───────────────────────────────────────────────────────────────────

function drawThumbnails(thumbH) {
  if (droppedImages.length === 0) {
    fill(70); noStroke(); textSize(14); textAlign(CENTER, CENTER);
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
    push(); translate(x, y); image(img, 0, 0, img.width * s, img.height * s); pop();
  }
}

function drawStatus(thumbH) {
  fill(130); noStroke(); textSize(12); textAlign(LEFT, CENTER);
  text(status, 16, thumbH + STATUS_H / 2);
}

function buildGraphicsBuffer() {
  if (pg3d) pg3d.remove();
  const view3DH = max(100, height - height * THUMB_RATIO - STATUS_H);
  pg3d = createGraphics(width, view3DH, WEBGL);
}

// ── 3D rendering ──────────────────────────────────────────────────────────────

function render3D(view3DH) {
  pg3d.background(24);
  pg3d.ambientLight(80);
  pg3d.directionalLight(255, 255, 255, 0.3, 0.5, -1);

  pg3d.perspective(PI / 3, width / view3DH, 0.1, 10000);
  pg3d.camera(0, 0, 400, 0, 0, 0, 0, 1, 0);

  pg3d.rotateX(orbitX);
  pg3d.rotateY(orbitY);

  // Centre and scale the scene
  const cx = average(camPositions.map(p => p.x));
  const cy = average(camPositions.map(p => p.y));
  const cz = average(camPositions.map(p => p.z));
  const spread = maxSpread(camPositions, cx, cy, cz) || 1;
  const s = 120 / spread;

  pg3d.translate(-cx * s, -cy * s, -cz * s);
  pg3d.scale(s);

  drawAxes(12 / s);

  // Connecting lines between camera centres
  pg3d.stroke(50, 70, 180);
  pg3d.strokeWeight(0.8 / s);
  pg3d.noFill();
  for (let i = 0; i < camPositions.length - 1; i++) {
    const a = camPositions[i], b = camPositions[i + 1];
    pg3d.line(a.x, a.y, a.z, b.x, b.y, b.z);
  }

  // Camera frustums
  const nearD = spread * 0.04;
  const farD  = spread * 0.22;

  for (let i = 0; i < poses.length; i++) {
    const cam = cameras[poses[i].cameraId];
    if (!cam) continue;
    const corners = frustumCorners(poses[i], cam, nearD, farD);
    drawFrustum(camPositions[i], corners);
  }
}

// Draw a wireframe camera frustum
// corners: { near: [tl,tr,br,bl], far: [tl,tr,br,bl] } in world space
function drawFrustum(apex, corners) {
  const n = corners.near;
  const f = corners.far;

  // Semi-transparent near plane face
  pg3d.noStroke();
  pg3d.fill(180, 180, 255, 40);
  pg3d.beginShape();
  pg3d.vertex(n[0].x, n[0].y, n[0].z);
  pg3d.vertex(n[1].x, n[1].y, n[1].z);
  pg3d.vertex(n[2].x, n[2].y, n[2].z);
  pg3d.vertex(n[3].x, n[3].y, n[3].z);
  pg3d.endShape(CLOSE);

  // Wireframe
  pg3d.noFill();
  pg3d.stroke(180, 200, 255);
  pg3d.strokeWeight(0.5);

  // Near rect
  drawRect(n);
  // Far rect
  drawRect(f);
  // Apex to far corners (the frustum edges)
  for (let i = 0; i < 4; i++) {
    pg3d.line(apex.x, apex.y, apex.z, f[i].x, f[i].y, f[i].z);
  }
}

function drawRect(pts) {
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    pg3d.line(a.x, a.y, a.z, b.x, b.y, b.z);
  }
}

function drawAxes(size) {
  pg3d.strokeWeight(1.5);
  pg3d.stroke(220, 60, 60);  pg3d.line(0,0,0, size,0,0);
  pg3d.stroke(60, 220, 60);  pg3d.line(0,0,0, 0,size,0);
  pg3d.stroke(60, 60, 220);  pg3d.line(0,0,0, 0,0,size);
}

// ── Frustum math ──────────────────────────────────────────────────────────────

// Returns { near: [tl,tr,br,bl], far: [tl,tr,br,bl] } in world space
function frustumCorners(pose, cam, nearD, farD) {
  const R   = quatToRotMatrix(pose.rotation);
  const pos = poseToWorldPos(pose);

  // Extract focal length and principal point from camera params
  // SIMPLE_PINHOLE: [f, cx, cy]   PINHOLE: [fx, fy, cx, cy]
  let fx, fy, cx, cy;
  if (cam.model === 'SIMPLE_PINHOLE') {
    [fx, cx, cy] = cam.params; fy = fx;
  } else {
    [fx, fy, cx, cy] = cam.params;
  }

  const W = cam.width, H = cam.height;

  // Image corners in camera space at given depth d:
  // direction = ((pixel - principal_point) / focal) * d
  function corners(d) {
    return [
      camToWorld([(0 - cx) / fx * d, (0 - cy) / fy * d, d], R, pos), // TL
      camToWorld([(W - cx) / fx * d, (0 - cy) / fy * d, d], R, pos), // TR
      camToWorld([(W - cx) / fx * d, (H - cy) / fy * d, d], R, pos), // BR
      camToWorld([(0 - cx) / fx * d, (H - cy) / fy * d, d], R, pos), // BL
    ];
  }

  return { near: corners(nearD), far: corners(farD) };
}

// Transform a point from camera space to world space
// p_world = R^T * p_cam + cam_position
function camToWorld([px, py, pz], R, pos) {
  return {
    x: R[0]*px + R[3]*py + R[6]*pz + pos.x,
    y: R[1]*px + R[4]*py + R[7]*pz + pos.y,
    z: R[2]*px + R[5]*py + R[8]*pz + pos.z,
  };
}

// ── Pose math ─────────────────────────────────────────────────────────────────

function poseToWorldPos(pose) {
  const R = quatToRotMatrix(pose.rotation);
  const t = pose.translation;
  return {
    x: -(R[0]*t.tx + R[3]*t.ty + R[6]*t.tz),
    y: -(R[1]*t.tx + R[4]*t.ty + R[7]*t.tz),
    z: -(R[2]*t.tx + R[5]*t.ty + R[8]*t.tz),
  };
}

// Row-major 3x3 rotation matrix from unit quaternion
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
  return pts.reduce((m, p) =>
    Math.max(m, Math.sqrt((p.x-cx)**2 + (p.y-cy)**2 + (p.z-cz)**2)), 0);
}
