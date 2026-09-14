'use strict';
const cron = require('node-cron');

function startScheduledJob({ name, schedule, execute, cancel }) {
  const controller = new AbortController();
  let running;
  let stopped = false;
  function run() {
    if (stopped || running) return running;
    running = Promise.resolve().then(() => execute({ signal: controller.signal })).catch((error) => {
      console.error(JSON.stringify({ event: 'job_failed', job: name,
        code: ['JOB_BUSY', 'AZURE_SYNC_DISABLED'].includes(error.code) ? error.code : 'JOB_EXECUTION_ERROR' }));
    }).finally(() => { running = undefined; });
    return running;
  }
  const task = cron.schedule(schedule, run, { name, timezone: 'UTC', noOverlap: true });
  setImmediate(run);
  return {
    async stop() {
      stopped = true;
      controller.abort();
      cancel?.();
      await task.destroy();
      await running;
    },
  };
}

module.exports = { startScheduledJob };
