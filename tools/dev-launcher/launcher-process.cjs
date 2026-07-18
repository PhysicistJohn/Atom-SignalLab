'use strict';

function stopDevelopmentHostProcess(child, options = {}) {
  if (!child || child.exitCode !== null || child.killed) return false;
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) {
    throw new TypeError('Development host process must have a positive integer pid');
  }

  const platform = options.platform ?? process.platform;
  if (platform === 'win32') {
    child.kill('SIGTERM');
  } else {
    const kill = options.kill ?? process.kill;
    kill(-child.pid, 'SIGTERM');
  }
  return true;
}

module.exports = { stopDevelopmentHostProcess };
