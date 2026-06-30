const { spawn } = require('child_process');

const [, , labelArg, command, ...args] = process.argv;
const label = labelArg || command || 'comanda';

if (!command) {
    console.error('[progress] Lipseste comanda de rulat.');
    process.exit(1);
}

const startTime = Date.now();
let lastHeartbeat = 0;

function formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function heartbeat(force = false) {
    const elapsed = Date.now() - startTime;
    const elapsedSeconds = Math.floor(elapsed / 1000);
    if (!force && elapsedSeconds === lastHeartbeat) return;
    lastHeartbeat = elapsedSeconds;
    console.log(`[progress] ${label} inca ruleaza... timp scurs ${formatElapsed(elapsed)}`);
}

console.log(`[progress] Pornesc: ${label}`);
const intervalId = setInterval(() => heartbeat(true), 15000);

const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
});

child.on('error', error => {
    clearInterval(intervalId);
    console.error(`[progress] Nu am putut porni ${label}: ${error.message}`);
    process.exit(1);
});

child.on('exit', (code, signal) => {
    clearInterval(intervalId);
    const elapsed = formatElapsed(Date.now() - startTime);
    if (signal) {
        console.error(`[progress] ${label} oprit cu semnalul ${signal} dupa ${elapsed}.`);
        process.exit(1);
    }

    if (code === 0) {
        console.log(`[progress] Finalizat: ${label} in ${elapsed}.`);
        process.exit(0);
    }

    console.error(`[progress] ${label} a esuat cu codul ${code} dupa ${elapsed}.`);
    process.exit(code || 1);
});
