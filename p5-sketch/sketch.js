// colmap pose estimator
// David Chatting - davidchatting.com

p5.disableFriendlyErrors = true;

const API_BASE = 'https://labs.davidchatting.com/colmap';

let droppedImages = [];  // { p5img, el }
let status = 'DROP IMAGES THEN PRESS SPACE';
let poses = null;
let submitPoseJob = null;

// Load the colmap client module
import(API_BASE + '/client.js').then(mod => {
  submitPoseJob = mod.submitPoseJob;
}).catch(err => {
  status = 'Failed to load API client: ' + err.message;
});

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont('monospace');
  canvas.drop(onFileDropped);
}

function draw() {
  background(20);

  if (droppedImages.length === 0) {
    drawCentreText(status);
    return;
  }

  // Draw thumbnails along the top
  const thumbW = width / droppedImages.length;
  const thumbH = height * 0.4;

  for (let i = 0; i < droppedImages.length; i++) {
    const img = droppedImages[i].p5img;
    const scale = min(thumbW / img.width, thumbH / img.height);
    const x = i * thumbW + (thumbW - img.width * scale) / 2;
    const y = (thumbH - img.height * scale) / 2;
    push();
      translate(x, y);
      image(img, 0, 0, img.width * scale, img.height * scale);
    pop();
  }

  // Status
  fill(200);
  noStroke();
  textSize(14);
  textAlign(LEFT, TOP);
  text(status, 20, thumbH + 20);

  // Poses output
  if (poses) {
    fill(100, 200, 100);
    textSize(11);
    textAlign(LEFT, TOP);
    let y = thumbH + 60;
    for (const p of poses) {
      const r = p.rotation;
      const t = p.translation;
      text(
        `${p.name}  R(${fmt(r.qw)}, ${fmt(r.qx)}, ${fmt(r.qy)}, ${fmt(r.qz)})  T(${fmt(t.tx)}, ${fmt(t.ty)}, ${fmt(t.tz)})`,
        20, y
      );
      y += 18;
    }
  }
}

function onFileDropped(file) {
  if (!file.type.startsWith('image')) return;

  const p5img = loadImage(file.data);
  const el = createImg(file.data, '');
  el.style('visibility', 'hidden');

  droppedImages.push({ p5img, el });
  status = `${droppedImages.length} image(s) — press SPACE to run COLMAP`;
  poses = null;
}

function keyPressed() {
  if (key === ' ' && droppedImages.length >= 2) {
    runColmap();
  }
}

async function runColmap() {
  if (!submitPoseJob) {
    status = 'API client not loaded yet';
    return;
  }

  status = 'Starting...';
  poses = null;

  try {
    const domImgs = droppedImages.map(d => d.el.elt);
    const result = await submitPoseJob(domImgs, {
      apiBase: API_BASE,
      onProgress: ({ stage }) => { status = stage; }
    });
    poses = result.poses;
    status = `Done — ${poses.length} camera pose(s) estimated`;
  } catch (err) {
    status = 'Error: ' + err.message;
  }
}

function drawCentreText(msg) {
  fill(150);
  noStroke();
  textSize(16);
  textAlign(CENTER, CENTER);
  text(msg, width / 2, height / 2);
}

function fmt(n) {
  return n.toFixed(3);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
