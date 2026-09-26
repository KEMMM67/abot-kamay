// apps/api/scripts/smoke-media.mjs
//
// Smoke test for the media worker's toolchain INSIDE the Docker image (CI job api-image):
//   docker run --rm -i abotkamay-api node --input-type=module - < apps/api/scripts/smoke-media.mjs
//
// Makes a portrait phone video tagged with a GPS location and a JPEG with GPS EXIF, runs the compiled
// production transcoder (dist/) on both, and fails unless the public copies are H.264/AAC MP4 with a
// poster frame and a clean JPEG, with no location or camera metadata left. Also checks that
// heif-convert (iPhone HEIC photos) is installed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const transcoderModule = pathToFileURL(join(process.cwd(), 'dist/media/worker/media-transcoder.js')).href;
const { FfmpegSharpTranscoder } = await import(transcoderModule);
const transcoder = new FfmpegSharpTranscoder({
  ffmpegPath: 'ffmpeg',
  ffprobePath: 'ffprobe',
  heifConvertPath: 'heif-convert',
  videoTimeoutMs: 120_000,
});
const work = mkdtempSync(join(tmpdir(), 'abotkamay-smoke-'));
const run = (command, args) => execFileSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const tags = (file) =>
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'ffmetadata', '-']);
const GPS = '+14.5995+120.9842+010.000/';

// Video: portrait, with the location tags phones write.
const video = join(work, 'phone.mov');
// prettier-ignore
run('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=3',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
  '-metadata', `location=${GPS}`, '-metadata', `com.apple.quicktime.location.ISO6709=${GPS}`,
  '-movflags', 'use_metadata_tags', video,
]);
assert.ok(tags(video).includes('14.5995'), 'the sample video should carry a location tag');
const clip = await transcoder.render({
  kind: 'VIDEO',
  mimeType: 'video/quicktime',
  sourcePath: video,
  workDir: work,
});
assert.equal(clip.contentType, 'video/mp4');
assert.deepEqual([clip.width, clip.height], [720, 1280]);
assert.ok(!tags(clip.filePath).includes('14.5995'), 'the public video must not keep the location');
const streams = JSON.parse(
  run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', clip.filePath]),
)
  .streams.map((stream) => stream.codec_name)
  .sort();
assert.deepEqual(streams, ['aac', 'h264']);
const bytes = readFileSync(clip.filePath);
assert.ok(bytes.indexOf('moov') < bytes.indexOf('mdat'), 'the MP4 index must come first (+faststart)');
assert.equal(
  readFileSync(clip.posterPath).subarray(0, 2).toString('hex'),
  'ffd8',
  'the poster must be a JPEG',
);

// Photo: sideways pixels plus GPS EXIF, as phones save them.
const photo = join(work, 'photo.jpg');
writeFileSync(
  photo,
  await sharp({ create: { width: 64, height: 32, channels: 3, background: '#0e7c6b' } })
    .withExif({ IFD0: { Make: 'TestPhone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '14/1 35/1 0/1' } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer(),
);
const still = await transcoder.render({
  kind: 'IMAGE',
  mimeType: 'image/jpeg',
  sourcePath: photo,
  workDir: work,
});
const stillMeta = await sharp(still.filePath).metadata();
assert.deepEqual([still.width, still.height], [32, 64], 'the photo must be turned upright');
assert.equal(stillMeta.exif, undefined, 'the public photo must have no EXIF (GPS, camera)');

run('sh', ['-c', 'command -v heif-convert']);
console.log('Media toolchain OK: ffmpeg', run('ffmpeg', ['-hide_banner', '-version']).split('\n')[0]);
