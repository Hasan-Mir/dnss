/**
 * Generate placeholder app icons for Tauri (PNG + ICO) without any
 * dependencies: a rounded indigo square with a white circle "power dot".
 * Replace with real brand icons before release.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 128;
const INDIGO = [79, 70, 229, 255];
const WHITE = [255, 255, 255, 255];
const CORNER = 24; // rounded corner radius

function pixelIsInsideRoundedSquare(x, y, size) {
    const r = CORNER;
    if (x < r && y < r) {
        return dist(x - r, y - r) <= r;
    }
    if (x >= size - r && y < r) {
        return dist(x - (size - r - 1), y - r) <= r;
    }
    if (x < r && y >= size - r) {
        return dist(x - r, y - (size - r - 1)) <= r;
    }
    if (x >= size - r && y >= size - r) {
        return dist(x - (size - r - 1), y - (size - r - 1)) <= r;
    }
    return true;
}

function dist(dx, dy) {
    return Math.sqrt(dx * dx + dy * dy);
}

function render(size) {
    const rows = [];
    const centerX = size / 2;
    const centerY = size / 2;
    const outerR = size * 0.36;
    const innerR = size * 0.16;
    for (let y = 0; y < size; y++) {
        const row = Buffer.alloc(1 + size * 4);
        row[0] = 0; // filter type: none
        for (let x = 0; x < size; x++) {
            const offset = 1 + x * 4;
            const d = dist(x + 0.5 - centerX, y + 0.5 - centerY);
            let color = [0, 0, 0, 0];
            if (pixelIsInsideRoundedSquare(x, y, size)) {
                if (d <= innerR || (d <= outerR && d >= outerR - size * 0.06)) {
                    color = WHITE;
                } else {
                    color = INDIGO;
                }
            }
            row.set(color, offset);
        }
        rows.push(row);
    }
    return Buffer.concat(rows);
}

function crc32(buffer) {
    let table = crc32.table;
    if (!table) {
        table = crc32.table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 : c >>> 1;
            }
            table[n] = c;
        }
    }
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(size, raw) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type: RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

function makePng(size) {
    return encodePng(size, render(size));
}

// Minimal ICO containing one uncompressed 32bpp BMP.
function makeIco(size) {
    // Pixel rows are stored bottom-up as BGRA.
    const xor = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const srcY = size - 1 - y;
            const d = dist(x + 0.5 - size / 2, srcY + 0.5 - size / 2);
            let color = [0, 0, 0, 0];
            if (pixelIsInsideRoundedSquare(x, srcY, size)) {
                color = d <= size * 0.16 ? WHITE : INDIGO;
            }
            const offset = (y * size + x) * 4;
            xor[offset] = color[2];
            xor[offset + 1] = color[1];
            xor[offset + 2] = color[0];
            xor[offset + 3] = color[3];
        }
    }
    const and = Buffer.alloc(Math.ceil(size / 8) * size);

    const infoHeader = Buffer.alloc(40);
    infoHeader.writeUInt32LE(40, 0);
    infoHeader.writeInt32LE(size, 4);
    infoHeader.writeInt32LE(size * 2, 8); // height is doubled in ICO BMPs
    infoHeader.writeUInt16LE(1, 12); // planes
    infoHeader.writeUInt16LE(32, 14); // bits per pixel
    const bitmap = Buffer.concat([infoHeader, xor, and]);

    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(1, 4); // image count

    const entry = Buffer.alloc(16);
    entry[0] = size; // width
    entry[1] = size; // height
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(bitmap.length, 8); // data size
    entry.writeUInt32LE(6 + 16, 12); // data offset

    return Buffer.concat([header, entry, bitmap]);
}

const outDir = path.join(
    __dirname,
    '..',
    'packages',
    'gui',
    'src-tauri',
    'icons'
);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, '32x32.png'), makePng(32));
fs.writeFileSync(path.join(outDir, '128x128.png'), makePng(128));
fs.writeFileSync(path.join(outDir, '128x128@2x.png'), makePng(256));
fs.writeFileSync(path.join(outDir, 'icon.png'), makePng(128));
fs.writeFileSync(path.join(outDir, 'icon.ico'), makeIco(32));
console.log('Icons written to', outDir);
