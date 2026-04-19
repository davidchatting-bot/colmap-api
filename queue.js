const { EventEmitter } = require('events')

class JobQueue extends EventEmitter {
  constructor() {
    super()
    this.jobs = new Map()
    this.pending = []
    this.running = false
  }

  add(id, jobData) {
    const job = { id, status: 'queued', createdAt: Date.now(), progress: null, result: null, error: null, ...jobData }
    this.jobs.set(id, job)
    this.pending.push(id)
    this._next()
    return job
  }

  get(id) {
    return this.jobs.get(id) || null
  }

  update(id, patch) {
    const job = this.jobs.get(id)
    if (!job) return
    Object.assign(job, patch)
    this.emit(`job:${id}`, { ...job })
  }

  complete(id) {
    this.running = false
    this._next()
  }

  _next() {
    if (this.running || this.pending.length === 0) return
    this.running = true
    const id = this.pending.shift()
    // Defer so the caller's response can be sent first
    setImmediate(() => this.emit('run', id))
  }
}

module.exports = new JobQueue()
