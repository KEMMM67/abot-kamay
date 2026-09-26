// apps/api/src/media/worker/media-transcoder.ts
//
// Makes the public copy of an approved upload (TECHNICAL_PLAN.md 2.3: "EXIF-stripped, moderated,
// re-encoded derivatives"). The raw upload never leaves the quarantine bucket.
//
// Photos (sharp/libvips): turned upright from the EXIF orientation, then re-encoded with every piece
// of metadata dropped: GPS location, camera, time, and the embedded thumbnail. At most 2048 px on
// the long side. HEIC/HEIF from iPhones is first converted by libheif's heif-convert, because the
// prebuilt sharp binaries decode AVIF only.
//
// Videos (ffmpeg): H.264 High + AAC in MP4 with the index up front (+faststart), so the feed starts
// playing before the file finishes downloading on any phone or browser. At most 1280 px on the long
// side (720p), 30 frames per second, rotation applied to the pixels, all metadata and chapters
// dropped. A poster JPEG is cut from the finished copy for the feed to show before playback.
//
// Re-encoding also means no byte of the uploaded file reaches the CDN as-is, which defuses files
// crafted to exploit image or video decoders on donors' phones.
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { publicRenditionFor, type MediaKind } from '../media-policy.js';
import { ProcessFailure, runProcess } from './run-process.js';

export const MAX_IMAGE_EDGE = 2048;
export const MAX_VIDEO_EDGE = 1280;
const MAX_INPUT_PIXELS = 100_000_000; // 100 MP: above any phone camera, below a decompression bomb
const TOOL_TIMEOUT_MS = 120_000;

// Every file is read once, then its work folder is deleted. libvips' cache would keep the deleted
// files open (leaking descriptors and disk space) and gains nothing here.
sharp.cache(false);

export interface RenderedCopy {
  filePath: string;
  contentType: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Videos: a JPEG still for the feed to show before playback. Null for photos. */
  posterPath: string | null;
}

export interface MediaTranscoder {
  render(input: {
    kind: MediaKind;
    mimeType: string;
    sourcePath: string;
    workDir: string;
  }): Promise<RenderedCopy>;
}

export const MEDIA_TRANSCODER = Symbol('MEDIA_TRANSCODER');

/** A file that can never be turned into a public copy (corrupt, not really a photo or video). */
export class UnusableMediaError extends Error {
  override readonly name = 'UnusableMediaError';
}

export interface ProbeResult {
  hasVideo: boolean;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

/**
 * Full stream and format sections: -show_entries section names (e.g. for side data) differ between
 * ffprobe versions, and these two sections are the same in all of them.
 */
export function ffprobeArgs(input: string): string[] {
  return ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', input];
}

/**
 * Reads ffprobe's JSON. Width and height are as displayed: swapped for a 90 or 270 degree rotation,
 * which newer ffprobe reports as display-matrix side data and older versions as a "rotate" tag.
 */
export function parseProbe(json: string): ProbeResult {
  const data = JSON.parse(json) as {
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      side_data_list?: Array<{ rotation?: number | string }>;
      tags?: { rotate?: string };
    }>;
    format?: { duration?: string };
  };
  const streams = data.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const sideRotation = video?.side_data_list?.find((side) => side.rotation !== undefined)?.rotation;
  const rotation = Math.abs(Number(sideRotation ?? video?.tags?.rotate ?? 0)) || 0;
  const quarterTurn = rotation % 180 === 90;
  const width = video?.width ?? null;
  const height = video?.height ?? null;
  const seconds = Number(data.format?.duration);
  return {
    hasVideo: video !== undefined,
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
    width: quarterTurn ? height : width,
    height: quarterTurn ? width : height,
    durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null,
  };
}

const QUIET = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y'];

export function videoArgs(input: string, output: string, { hasAudio }: { hasAudio: boolean }): string[] {
  const edge = MAX_VIDEO_EDGE;
  const audioMap = hasAudio ? ['-map', '0:a:0'] : [];
  const audioCodec = hasAudio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : ['-an'];
  return [
    ...QUIET,
    '-i',
    input,
    '-map',
    '0:v:0',
    ...audioMap,
    // Drop every tag (GPS location, device, creation time) and chapter. ffmpeg applies the phone's
    // rotation to the pixels itself, so the copy needs no rotation flag either.
    '-map_metadata',
    '-1',
    '-map_chapters',
    '-1',
    '-vf',
    `scale=w='min(${edge},iw)':h='min(${edge},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p`,
    '-fpsmax',
    '30',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '26',
    '-profile:v',
    'high',
    '-level:v',
    '4.0',
    '-maxrate',
    '3M',
    '-bufsize',
    '6M',
    ...audioCodec,
    // Index at the front, so playback starts before the download ends; no encoder version tags.
    '-movflags',
    '+faststart',
    '-fflags',
    '+bitexact',
    '-flags:v',
    '+bitexact',
    '-flags:a',
    '+bitexact',
    output,
  ];
}

/** A representative frame from the first seconds (the very first is often black or out of focus). */
export function posterArgs(input: string, output: string, durationMs: number | null): string[] {
  const startSeconds = durationMs !== null && durationMs > 2_000 ? Math.min(1, durationMs / 4_000) : 0;
  return [
    ...QUIET,
    '-ss',
    startSeconds.toFixed(2),
    '-i',
    input,
    '-map_metadata',
    '-1',
    '-frames:v',
    '1',
    '-vf',
    'thumbnail=50',
    '-q:v',
    '3',
    output,
  ];
}

export class FfmpegSharpTranscoder implements MediaTranscoder {
  constructor(
    private readonly tools: {
      ffmpegPath: string;
      ffprobePath: string;
      heifConvertPath: string;
      videoTimeoutMs: number;
    },
  ) {}

  async render(input: {
    kind: MediaKind;
    mimeType: string;
    sourcePath: string;
    workDir: string;
  }): Promise<RenderedCopy> {
    try {
      return input.kind === 'VIDEO'
        ? await this.renderVideo(input.sourcePath, input.workDir)
        : await this.renderImage(input.sourcePath, input.mimeType, input.workDir);
    } catch (error) {
      if (error instanceof ProcessFailure && error.permanent) throw new UnusableMediaError(error.message);
      throw error;
    }
  }

  private async renderImage(sourcePath: string, mimeType: string, workDir: string): Promise<RenderedCopy> {
    const rendition = publicRenditionFor(mimeType);
    if (!rendition) throw new UnusableMediaError(`${mimeType} is not a photo type`);

    let decodable = sourcePath;
    if (mimeType === 'image/heic' || mimeType === 'image/heif') {
      decodable = await this.heicToJpeg(sourcePath, workDir);
    }

    const output = join(workDir, `public.${rendition.extension}`);
    const image = sharp(decodable, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
      .rotate() // upright from the EXIF orientation, before the metadata is dropped
      .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true });
    // sharp keeps no metadata unless asked (no withMetadata/keepExif): no GPS, no ICC profile, sRGB.
    const encoded =
      rendition.extension === 'png'
        ? image.png({ compressionLevel: 9 })
        : rendition.extension === 'webp'
          ? image.webp({ quality: 82 })
          : image.jpeg({ quality: 82, mozjpeg: true });
    try {
      const info = await encoded.toFile(output);
      return {
        filePath: output,
        contentType: rendition.contentType,
        width: info.width,
        height: info.height,
        durationMs: null,
        posterPath: null,
      };
    } catch (error) {
      // An operating-system error (disk full, out of files) may pass on a later attempt. Anything else
      // from libvips means it could not decode the file: corrupt, or not really a photo.
      if (typeof (error as NodeJS.ErrnoException).code === 'string') throw error;
      throw new UnusableMediaError(`Photo could not be decoded: ${(error as Error).message}`);
    }
  }

  private async heicToJpeg(sourcePath: string, workDir: string): Promise<string> {
    const target = join(workDir, 'decoded.jpg');
    await runProcess(this.tools.heifConvertPath, ['-q', '95', sourcePath, target], {
      timeoutMs: TOOL_TIMEOUT_MS,
    });
    // A HEIC with several top-level images is written as decoded-1.jpg, decoded-2.jpg...; the first
    // one is the photo.
    for (const candidate of [target, join(workDir, 'decoded-1.jpg')]) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        // try the next name
      }
    }
    throw new UnusableMediaError('heif-convert produced no image');
  }

  private async renderVideo(sourcePath: string, workDir: string): Promise<RenderedCopy> {
    const source = await this.probe(sourcePath);
    if (!source.hasVideo) throw new UnusableMediaError('The file has no video stream');

    const output = join(workDir, 'public.mp4');
    await runProcess(this.tools.ffmpegPath, videoArgs(sourcePath, output, { hasAudio: source.hasAudio }), {
      timeoutMs: this.tools.videoTimeoutMs,
    });
    const copy = await this.probe(output);

    const poster = join(workDir, 'poster.jpg');
    await runProcess(this.tools.ffmpegPath, posterArgs(output, poster, copy.durationMs), {
      timeoutMs: TOOL_TIMEOUT_MS,
    });
    return {
      filePath: output,
      contentType: 'video/mp4',
      width: copy.width,
      height: copy.height,
      durationMs: copy.durationMs,
      posterPath: poster,
    };
  }

  private async probe(path: string): Promise<ProbeResult> {
    const { stdout } = await runProcess(this.tools.ffprobePath, ffprobeArgs(path), {
      timeoutMs: TOOL_TIMEOUT_MS,
    });
    try {
      return parseProbe(stdout);
    } catch {
      throw new UnusableMediaError('ffprobe returned unreadable output');
    }
  }
}
