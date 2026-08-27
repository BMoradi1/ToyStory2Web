/**
 * Parser for the `.ngn` container.
 *
 * `.ngn` is not a native PC format. Traveller's Tales built the PC version from
 * the PlayStation source data using a converter (`pconv.exe`) whose per-level
 * config files are still present in the shipped game. For level 1 it reads:
 *
 *     INPUT_FILE    level.dat     # "Define the PSX scene file."
 *     TEXTURE_FILE  level.raw     # "Define the PSX texture file."
 *     OUTPUT_FILE   level.ngn
 *
 * So a `.ngn` is a repack: PSX scene plus PSX textures, with the textures
 * converted to plain 24bpp Windows BMPs along the way. That conversion already
 * resolved the PSX CLUT/4bpp palette indirection for us, so reading textures
 * needs no PSX-specific decoding at all.
 *
 * Each image is preceded by a length-prefixed ASCII tag: `tex00`, `bgr36`, etc.
 * The trailing number is the engine's texture slot ID — the same IDs that
 * appear in Pconv.cfg lines like `BMP_FILE ...\level1.bmp 37`. Slots are sparse;
 * a level populates only the ones it uses.
 */

const BMP_MAGIC = 0x4d42; // 'BM'
const MIN_BMP_SIZE = 54; // 14-byte file header + 40-byte BITMAPINFOHEADER
const MAX_TAG_LEN = 16;

export interface NgnTexture {
  /** Tag from the container, e.g. `tex00`. Falls back to a synthetic name. */
  tag: string;
  /** Engine texture slot ID parsed from the tag, or null if the tag has none. */
  slot: number | null;
  width: number;
  height: number;
  bitsPerPixel: number;
  /** Byte offset of the BMP within the container, useful for debugging. */
  offset: number;
  /** The complete BMP file, decodable by `createImageBitmap` or any BMP reader. */
  bmp: Uint8Array;
}

/**
 * Walk backwards from a BMP to recover its length-prefixed tag.
 * The layout is `[u32 tagLength][tag bytes][BMP]`, so we try each plausible
 * length and accept the one whose preceding u32 agrees with it.
 */
function readTag(view: DataView, bytes: Uint8Array, bmpStart: number): string | null {
  for (let len = 3; len <= MAX_TAG_LEN; len++) {
    const tagStart = bmpStart - len;
    if (tagStart - 4 < 0) break;
    if (view.getUint32(tagStart - 4, true) !== len) continue;

    let tag = '';
    let printable = true;
    for (let i = tagStart; i < bmpStart; i++) {
      const c = bytes[i]!;
      if (c < 0x20 || c > 0x7e) { printable = false; break; }
      tag += String.fromCharCode(c);
    }
    if (printable) return tag;
  }
  return null;
}

/**
 * Scan a `.ngn` for embedded BMPs.
 *
 * We scan for signatures and validate each candidate rather than walking a
 * chunk table, because the container's full record layout isn't mapped yet.
 * Validating the DIB header makes false positives from texture data very
 * unlikely, and this stays correct if the surrounding structure differs
 * between levels.
 */
export function parseNgn(buffer: ArrayBuffer | Uint8Array): NgnTexture[] {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const textures: NgnTexture[] = [];

  for (let i = 0; i + MIN_BMP_SIZE <= bytes.length; i++) {
    if (view.getUint16(i, true) !== BMP_MAGIC) continue;

    const size = view.getUint32(i + 2, true);
    const pixelOffset = view.getUint32(i + 10, true);
    const headerSize = view.getUint32(i + 14, true);
    if (size < MIN_BMP_SIZE || i + size > bytes.length) continue;
    // 40 = BITMAPINFOHEADER, 12 = the older BITMAPCOREHEADER.
    if (headerSize !== 40 && headerSize !== 12) continue;
    if (pixelOffset < MIN_BMP_SIZE || pixelOffset >= size) continue;

    const width = view.getInt32(i + 18, true);
    // Height is signed: negative means the rows are stored top-down.
    const height = view.getInt32(i + 22, true);
    const bitsPerPixel = view.getUint16(i + 28, true);
    if (width <= 0 || width > 4096 || height === 0 || Math.abs(height) > 4096) continue;

    const tag = readTag(view, bytes, i) ?? `img${String(textures.length).padStart(3, '0')}`;
    const slotMatch = /(\d+)$/.exec(tag);

    textures.push({
      tag,
      slot: slotMatch ? Number(slotMatch[1]) : null,
      width,
      height: Math.abs(height),
      bitsPerPixel,
      offset: i,
      bmp: bytes.subarray(i, i + size),
    });

    i += size - 1; // Skip the body; nothing valid starts inside a BMP we just took.
  }

  return textures;
}

/** Pure green is the engine's transparency key. */
export const COLOUR_KEY = { r: 0, g: 255, b: 0 };

/**
 * Decode a 24bpp Windows BMP to RGBA, punching the colour key out to alpha 0.
 *
 * Decoding here rather than via `createImageBitmap` plus a canvas readback is
 * deliberate. That route passes the pixels through the browser's colour
 * management, which can shift a texel stored as exactly (0,255,0) to something
 * like (1,254,2) — so an exact-match key test silently stops matching and the
 * keyed areas render as solid green panels. Reading the bytes directly is both
 * exact and faster.
 *
 * Rows are returned top-down regardless of how the file stores them, matching
 * the UV convention (v indexes rows from the top).
 */
export function decodeBmp(
  bmp: Uint8Array,
): { width: number; height: number; rgba: Uint8Array<ArrayBuffer> } | null {
  if (bmp.length < 54) return null;
  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
  if (view.getUint16(0, true) !== BMP_MAGIC) return null;

  const pixelOffset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const bitsPerPixel = view.getUint16(28, true);
  if (bitsPerPixel !== 24 || width <= 0 || rawHeight === 0) return null;

  const height = Math.abs(rawHeight);
  // A positive height means the rows are stored bottom-up.
  const bottomUp = rawHeight > 0;
  const stride = (width * 3 + 3) & ~3;
  if (pixelOffset + stride * height > bmp.length) return null;

  const rgba = new Uint8Array(new ArrayBuffer(width * height * 4));
  for (let y = 0; y < height; y++) {
    let src = pixelOffset + (bottomUp ? height - 1 - y : y) * stride;
    let dst = y * width * 4;
    for (let x = 0; x < width; x++) {
      const b = bmp[src]!, g = bmp[src + 1]!, r = bmp[src + 2]!;
      rgba[dst] = r; rgba[dst + 1] = g; rgba[dst + 2] = b;
      rgba[dst + 3] = r === COLOUR_KEY.r && g === COLOUR_KEY.g && b === COLOUR_KEY.b ? 0 : 255;
      src += 3; dst += 4;
    }
  }

  // Bleed edge colours into keyed texels. Their RGB is invisible at full
  // resolution (alpha 0), but mipmap generation averages RGB and alpha
  // independently, so pure-green key pixels tint every minified cutout edge
  // green. Replacing a keyed texel's RGB with the mean of its non-keyed
  // neighbours makes the mip chain average toward the art instead of the key.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (rgba[o + 3] !== 0) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const no = (ny * width + nx) * 4;
          if (rgba[no + 3] === 0) continue;
          r += rgba[no]!; g += rgba[no + 1]!; b += rgba[no + 2]!; n++;
        }
      }
      if (n > 0) {
        rgba[o] = r / n; rgba[o + 1] = g / n; rgba[o + 2] = b / n;
      }
    }
  }
  return { width, height, rgba };
}
