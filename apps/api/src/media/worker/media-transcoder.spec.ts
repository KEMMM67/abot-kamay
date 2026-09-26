// apps/api/src/media/worker/media-transcoder.spec.ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  FfmpegSharpTranscoder,
  MAX_IMAGE_EDGE,
  parseProbe,
  posterArgs,
  UnusableMediaError,
  videoArgs,
} from './media-transcoder.js';

// Photos only: the video path needs ffmpeg, which runs in the Docker image (see its smoke check).
const transcoder = new FfmpegSharpTranscoder({
  ffmpegPath: 'ffmpeg',
  ffprobePath: 'ffprobe',
  heifConvertPath: 'heif-convert',
  videoTimeoutMs: 60_000,
});

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'abotkamay-transcoder-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

/** A phone-like JPEG: sideways pixels with EXIF orientation 6, camera make and GPS coordinates. */
async function phonePhoto(width: number, height: number): Promise<string> {
  const path = join(workDir, 'source');
  const bytes = await sharp({ create: { width, height, channels: 3, background: '#0e7c6b' } })
    .withExif({
      IFD0: { Make: 'TestPhone', Model: 'Model X' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '14/1 35/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '120/1 59/1 0/1',
      },
    })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  await writeFile(path, bytes);
  return path;
}

describe('photos', () => {
  it('turns the photo upright and drops every piece of metadata, GPS included', async () => {
    const sourcePath = await phonePhoto(64, 32);
    const input = await sharp(sourcePath).metadata();
    expect(input.orientation).toBe(6);
    expect(input.exif?.includes(Buffer.from('TestPhone'))).toBe(true);

    const copy = await transcoder.render({ kind: 'IMAGE', mimeType: 'image/jpeg', sourcePath, workDir });
    expect(copy).toMatchObject({ contentType: 'image/jpeg', width: 32, height: 64, posterPath: null });
    const output = await sharp(copy.filePath).metadata();
    expect(output.format).toBe('jpeg');
    expect(output.exif).toBeUndefined();
    expect(output.xmp).toBeUndefined();
    expect(output.iptc).toBeUndefined();
    expect(output.orientation).toBeUndefined();
  });

  it(`scales large photos down to ${MAX_IMAGE_EDGE} px on the long side, never up`, async () => {
    const big = join(workDir, 'big');
    await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#f2b632' } })
      .png()
      .toFile(big);
    const copy = await transcoder.render({ kind: 'IMAGE', mimeType: 'image/png', sourcePath: big, workDir });
    expect(copy).toMatchObject({ contentType: 'image/png', width: MAX_IMAGE_EDGE, height: 1536 });

    const small = join(workDir, 'small');
    await sharp({ create: { width: 300, height: 200, channels: 3, background: '#e0603a' } })
      .webp()
      .toFile(small);
    const smallCopy = await transcoder.render({
      kind: 'IMAGE',
      mimeType: 'image/webp',
      sourcePath: small,
      workDir,
    });
    expect(smallCopy).toMatchObject({ contentType: 'image/webp', width: 300, height: 200 });
  });

  it('refuses a file that is not really a photo, for good', async () => {
    const fake = join(workDir, 'fake');
    await writeFile(fake, 'this is not a JPEG');
    await expect(
      transcoder.render({ kind: 'IMAGE', mimeType: 'image/jpeg', sourcePath: fake, workDir }),
    ).rejects.toBeInstanceOf(UnusableMediaError);
  });
});

describe('ffmpeg arguments', () => {
  it('re-encode video to H.264/AAC MP4 at most 720p, with every tag stripped and the index up front', () => {
    const args = videoArgs('in.mov', 'out.mp4', { hasAudio: true });
    const pair = (flag: string) => args[args.indexOf(flag) + 1];
    expect(pair('-i')).toBe('in.mov');
    expect(pair('-map_metadata')).toBe('-1');
    expect(pair('-map_chapters')).toBe('-1');
    expect(pair('-c:v')).toBe('libx264');
    expect(pair('-c:a')).toBe('aac');
    expect(pair('-movflags')).toBe('+faststart');
    expect(pair('-fpsmax')).toBe('30');
    expect(pair('-vf')).toContain('min(1280,iw)');
    expect(pair('-vf')).toContain('format=yuv420p');
    expect(args.at(-1)).toBe('out.mp4');
  });

  it('leave audio out when the clip has none', () => {
    const args = videoArgs('in.mp4', 'out.mp4', { hasAudio: false });
    expect(args).toContain('-an');
    expect(args).not.toContain('0:a:0');
  });

  it('cut the poster a moment into the clip', () => {
    expect(posterArgs('v.mp4', 'p.jpg', 12_000)).toEqual(expect.arrayContaining(['-ss', '1.00']));
    expect(posterArgs('v.mp4', 'p.jpg', 1_500)).toEqual(expect.arrayContaining(['-ss', '0.00']));
    expect(posterArgs('v.mp4', 'p.jpg', null)).toEqual(expect.arrayContaining(['-frames:v', '1']));
  });
});

describe('parseProbe', () => {
  it('reports displayed size, with width and height swapped for a phone rotated a quarter turn', () => {
    const probe = parseProbe(
      JSON.stringify({
        streams: [
          { codec_type: 'video', width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] },
          { codec_type: 'audio' },
        ],
        format: { duration: '14.52' },
      }),
    );
    expect(probe).toEqual({ hasVideo: true, hasAudio: true, width: 1080, height: 1920, durationMs: 14_520 });
  });

  it('reads the older "rotate" tag too', () => {
    const probe = parseProbe(
      JSON.stringify({
        streams: [{ codec_type: 'video', width: 1280, height: 720, tags: { rotate: '270' } }],
        format: { duration: '3.000000' },
      }),
    );
    expect(probe).toMatchObject({ width: 720, height: 1280, durationMs: 3_000 });
  });

  it('copes with a silent clip without a duration', () => {
    expect(
      parseProbe(JSON.stringify({ streams: [{ codec_type: 'video', width: 640, height: 480 }] })),
    ).toEqual({ hasVideo: true, hasAudio: false, width: 640, height: 480, durationMs: null });
  });
});
