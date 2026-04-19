const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

// Number of parameters per COLMAP camera model
const CAMERA_MODEL_PARAMS = {
  0: 3,  // SIMPLE_PINHOLE  (f, cx, cy)
  1: 4,  // PINHOLE         (fx, fy, cx, cy)
  2: 4,  // SIMPLE_RADIAL   (f, cx, cy, k)
  3: 5,  // RADIAL          (f, cx, cy, k1, k2)
  4: 8,  // OPENCV          (fx, fy, cx, cy, k1, k2, p1, p2)
  5: 8,  // OPENCV_FISHEYE
  6: 12, // FULL_OPENCV
  7: 5,  // FOV
  8: 3,  // SIMPLE_RADIAL_FISHEYE
  9: 5,  // RADIAL_FISHEYE
  10: 13 // THIN_PRISM_FISHEYE
}

const CAMERA_MODEL_NAMES = {
  0: 'SIMPLE_PINHOLE',
  1: 'PINHOLE',
  2: 'SIMPLE_RADIAL',
  3: 'RADIAL',
  4: 'OPENCV',
}

async function runPipeline(jobDir, onProgress) {
  const dbPath    = path.join(jobDir, 'db.db')
  const imagePath = path.join(jobDir, 'images')
  const sparsePath = path.join(jobDir, 'sparse')

  fs.mkdirSync(sparsePath, { recursive: true })

  await run('colmap', [
    'feature_extractor',
    '--database_path', dbPath,
    '--image_path', imagePath,
    '--ImageReader.single_camera', '1',
  ], 'Extracting features', onProgress)

  await run('colmap', [
    'exhaustive_matcher',
    '--database_path', dbPath,
  ], 'Matching features', onProgress)

  await run('colmap', [
    'mapper',
    '--database_path', dbPath,
    '--image_path', imagePath,
    '--output_path', sparsePath,
  ], 'Reconstructing scene', onProgress)

  const modelDir = path.join(sparsePath, '0')
  if (!fs.existsSync(modelDir)) {
    throw new Error('Reconstruction failed — COLMAP produced no model. Images may have insufficient overlap.')
  }

  onProgress({ stage: 'Parsing results' })
  const cameras = parseCamerasBin(path.join(modelDir, 'cameras.bin'))
  const poses   = parseImagesBin(path.join(modelDir, 'images.bin'))

  return { cameras, poses }
}

function run(cmd, args, stage, onProgress) {
  return new Promise((resolve, reject) => {
    onProgress({ stage, log: null })
    const proc = spawn(cmd, args, { env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' } })

    proc.stdout.on('data', d => onProgress({ stage, log: d.toString().trim() }))
    proc.stderr.on('data', d => onProgress({ stage, log: d.toString().trim() }))

    proc.on('error', err => reject(new Error(`Failed to start ${cmd}: ${err.message}`)))
    proc.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with code ${code}`))
    })
  })
}

function parseCamerasBin(filePath) {
  const buf = fs.readFileSync(filePath)
  let off = 0

  const count = Number(buf.readBigUint64LE(off)); off += 8
  const cameras = {}

  for (let i = 0; i < count; i++) {
    const cameraId = buf.readUInt32LE(off); off += 4
    const modelId  = buf.readUInt32LE(off); off += 4
    const width    = Number(buf.readBigUint64LE(off)); off += 8
    const height   = Number(buf.readBigUint64LE(off)); off += 8

    const numParams = CAMERA_MODEL_PARAMS[modelId] ?? 0
    const params = []
    for (let p = 0; p < numParams; p++) {
      params.push(buf.readDoubleLE(off)); off += 8
    }

    cameras[cameraId] = {
      cameraId,
      model: CAMERA_MODEL_NAMES[modelId] ?? `MODEL_${modelId}`,
      width,
      height,
      params,
    }
  }

  return cameras
}

function parseImagesBin(filePath) {
  const buf = fs.readFileSync(filePath)
  let off = 0

  const count = Number(buf.readBigUint64LE(off)); off += 8
  const poses = []

  for (let i = 0; i < count; i++) {
    const imageId  = buf.readUInt32LE(off); off += 4
    const qw       = buf.readDoubleLE(off); off += 8
    const qx       = buf.readDoubleLE(off); off += 8
    const qy       = buf.readDoubleLE(off); off += 8
    const qz       = buf.readDoubleLE(off); off += 8
    const tx       = buf.readDoubleLE(off); off += 8
    const ty       = buf.readDoubleLE(off); off += 8
    const tz       = buf.readDoubleLE(off); off += 8
    const cameraId = buf.readUInt32LE(off); off += 4

    // Null-terminated filename
    let name = ''
    while (off < buf.length && buf[off] !== 0) {
      name += String.fromCharCode(buf[off++])
    }
    off++ // consume null terminator

    const numPoints2D = Number(buf.readBigUint64LE(off)); off += 8
    off += numPoints2D * 24 // skip 2D point observations (x, y float64 + point3D_id int64)

    poses.push({
      imageId,
      name,
      cameraId,
      // Quaternion: world-to-camera rotation
      rotation: { qw, qx, qy, qz },
      // Translation: world-to-camera
      translation: { tx, ty, tz },
    })
  }

  // Sort by name for stable ordering
  poses.sort((a, b) => a.name.localeCompare(b.name))

  return poses
}

module.exports = { runPipeline }
