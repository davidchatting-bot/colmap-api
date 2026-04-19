# colmap-api

REST API wrapping [COLMAP](https://colmap.github.io/) for camera pose estimation. Accepts images from browser clients and returns camera rotation and translation via WebSocket.

## Requirements

- Ubuntu 22.04 / 24.04
- Node.js 20+
- COLMAP

Run `setup.sh` to install both on a fresh droplet.

## Setup

```bash
# On the droplet
bash setup.sh
git clone https://github.com/davidchatting-bot/colmap-api.git
cd colmap-api
npm install
node server.js
```

## API

### `POST /jobs`

Upload images for reconstruction. Returns a job ID.

```
Content-Type: multipart/form-data
Body: images[] — JPEG/PNG files, minimum 2
```

```json
{ "jobId": "uuid" }
```

### `GET /jobs/:id`

Poll job status and result.

```json
{
  "id": "uuid",
  "status": "queued | running | done | error",
  "progress": { "stage": "Matching features", "log": "..." },
  "result": { "cameras": {}, "poses": [] },
  "error": null
}
```

### `WS /jobs/:id/ws`

Stream progress updates for a job. Receives JSON messages:

```json
{ "type": "status | update", "job": { ... } }
```

Final message has `status: "done"` with `result.poses` or `status: "error"`.

## Browser client

```js
import { submitPoseJob } from '/client.js'

const imgs = document.querySelectorAll('.scene-image')
const { cameras, poses } = await submitPoseJob(imgs, {
  apiBase: 'http://your-droplet-ip:3000',
  onProgress: ({ stage }) => console.log(stage),
})
```

Each pose contains:

```js
{
  name: 'image_0001.jpg',
  rotation: { qw, qx, qy, qz },   // world-to-camera quaternion
  translation: { tx, ty, tz },     // world-to-camera translation
  cameraId: 1
}
```

## Notes

- Jobs run one at a time — COLMAP is single-threaded per job
- Job files are cleaned up after 1 hour
- 512 MB RAM limits practical use to ~5–15 images
