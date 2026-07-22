const fs = require('node:fs');
const path = require('node:path');

const sharp = require('sharp');

const DEFAULT_CHANNEL_THRESHOLD = 24;
const DEFAULT_MAX_DIFF_RATIO = 0.005;

async function decodePng(input) {
    const { data, info } = await sharp(input)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    return {
        data,
        width: info.width,
        height: info.height,
        channels: info.channels
    };
}

function createDimensionMismatch(baseline, current) {
    return {
        dimensionsMatch: false,
        baselineSize: { width: baseline.width, height: baseline.height },
        currentSize: { width: current.width, height: current.height },
        differentPixels: null,
        totalPixels: null,
        diffRatio: 1,
        diffData: null
    };
}

async function comparePngBuffers(baselineBuffer, currentBuffer, options = {}) {
    const requestedChannelThreshold = Number.isFinite(options.channelThreshold)
        ? options.channelThreshold
        : DEFAULT_CHANNEL_THRESHOLD;
    const channelThreshold = Math.min(255, Math.max(0, requestedChannelThreshold));
    const [baseline, current] = await Promise.all([
        decodePng(baselineBuffer),
        decodePng(currentBuffer)
    ]);

    if (baseline.width !== current.width || baseline.height !== current.height) {
        return createDimensionMismatch(baseline, current);
    }

    const totalPixels = baseline.width * baseline.height;
    const diffData = Buffer.alloc(current.data.length);
    let differentPixels = 0;

    for (let offset = 0; offset < current.data.length; offset += 4) {
        const redDelta = Math.abs(baseline.data[offset] - current.data[offset]);
        const greenDelta = Math.abs(baseline.data[offset + 1] - current.data[offset + 1]);
        const blueDelta = Math.abs(baseline.data[offset + 2] - current.data[offset + 2]);
        const alphaDelta = Math.abs(baseline.data[offset + 3] - current.data[offset + 3]);
        const isDifferent = Math.max(redDelta, greenDelta, blueDelta, alphaDelta) > channelThreshold;

        if (isDifferent) {
            differentPixels += 1;
            diffData[offset] = 255;
            diffData[offset + 1] = 0;
            diffData[offset + 2] = 72;
        } else {
            const luminance = Math.round(
                (current.data[offset] * 0.2126)
                + (current.data[offset + 1] * 0.7152)
                + (current.data[offset + 2] * 0.0722)
            );
            const muted = Math.round(luminance * 0.22);
            diffData[offset] = muted;
            diffData[offset + 1] = muted;
            diffData[offset + 2] = muted;
        }
        diffData[offset + 3] = 255;
    }

    return {
        dimensionsMatch: true,
        baselineSize: { width: baseline.width, height: baseline.height },
        currentSize: { width: current.width, height: current.height },
        differentPixels,
        totalPixels,
        diffRatio: totalPixels === 0 ? 0 : differentPixels / totalPixels,
        diffData
    };
}

async function writeDiffPng(comparison, outputPath) {
    if (!comparison.dimensionsMatch || !comparison.diffData) return false;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    await sharp(comparison.diffData, {
        raw: {
            width: comparison.currentSize.width,
            height: comparison.currentSize.height,
            channels: 4
        }
    }).png({ compressionLevel: 9 }).toFile(outputPath);
    return true;
}

module.exports = {
    DEFAULT_CHANNEL_THRESHOLD,
    DEFAULT_MAX_DIFF_RATIO,
    comparePngBuffers,
    decodePng,
    writeDiffPng
};
