#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'test:e2e:responsive'], {
    cwd: process.cwd(),
    env: {
        ...process.env,
        UPDATE_VISUAL_BASELINES: '1'
    },
    stdio: 'inherit',
    shell: false
});

if (result.error) {
    console.error(`[visual-baselines] ${result.error.message}`);
}
process.exitCode = Number.isInteger(result.status) ? result.status : 1;
