const { spawn } = require('child_process');

const [, , labelArg, command, ...args] = process.argv;
const label = labelArg || command || 'comanda';

if (!command) {
    console.error('[progress] Lipseste comanda de rulat.');
    process.exit(1);
}

const startTime = Date.now();
let lastHeartbeat = 0;
const timeoutSeconds = Number.parseInt(process.env.F1_PROGRESS_TIMEOUT_SECONDS || '0', 10);
const timeoutMs = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds * 1000 : 0;

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
if (timeoutMs > 0) {
    console.log(`[progress] Limita maxima pentru ${label}: ${formatElapsed(timeoutMs)}.`);
}
const intervalId = setInterval(() => heartbeat(true), 15000);
let timeoutId = null;

const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
});

if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
        const elapsed = formatElapsed(Date.now() - startTime);
        console.error(`[progress] ${label} a depasit limita de ${formatElapsed(timeoutMs)} dupa ${elapsed}. Oprește comanda.`);
        child.kill('SIGTERM');
    }, timeoutMs);
}

child.on('error', error => {
    clearInterval(intervalId);
    if (timeoutId) clearTimeout(timeoutId);
    console.error(`[progress] Nu am putut porni ${label}: ${error.message}`);
    process.exit(1);
});

child.on('exit', (code, signal) => {
    clearInterval(intervalId);
    if (timeoutId) clearTimeout(timeoutId);
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
