/**
 * RNC ProPack, method 2 — the compression on `gfx/*.raw`.
 *
 * Rob Northen's packer was the standard on 1990s console titles and this is
 * the byte-oriented variant: a bit stream read MSB-first out of single bytes,
 * literals, LZ matches with a two-level code for the length and the offset,
 * and an occasional block of raw bytes. Transcribed from the engine's own
 * unpacker, `FUN_0047b170` in toy2.exe, which is a hand-unrolled version of
 * the same routine; the shape here is the readable one.
 *
 * A `.raw` file is a sequence of records, each carrying the 14 bytes that
 * follow the (stripped) `RNC\x01` magic in a normal RNC header:
 *
 *     u32 BE unpacked size      0xFFFFFFFF marks the end of the file
 *     u32 BE packed size
 *     u16 BE crc of unpacked, u16 BE crc of packed, u8 leeway, u8 chunks
 *
 * and then `packed` bytes of stream. `unpackRaw` walks that.
 *
 * Nothing here is game data; it is the container, and the same code unpacks
 * every `.raw` in the install (validated by tools/raw-validate.ts).
 */

/** Unpack one method-2 stream. `dst` must be exactly the unpacked size. */
export function unpackRnc2(src: Uint8Array, dst: Uint8Array): void {
  let sp = 0;
  let dp = 0;
  // Byte accumulator with a sentinel: the bits still to read sit above a
  // single 1 bit, so running out is detected when the byte shifts to zero.
  // The first two bits of the stream are unused: the original seeds the
  // accumulator with `byte * 4 + 2`, which drops them and plants the sentinel.
  let acc = (src[sp++]! * 4 + 2) & 0xff;

  const bit = (): number => {
    let b = (acc >> 7) & 1;
    acc = (acc << 1) & 0xff;
    if (acc === 0) {
      if (sp >= src.length) throw new Error(`rnc: ran off the packed data at ${dp}/${dst.length}`);
      // That was the sentinel, not data: reload, and the answer is the new
      // byte's top bit. The sentinel reappears as bit 0.
      const next = src[sp++]!;
      acc = ((next << 1) | 1);
      b = (acc >> 8) & 1;
      acc &= 0xff;
    }
    return b;
  };

  const copy = (length: number, distance: number): void => {
    let from = dp - distance;
    if (from < 0 || dp + length > dst.length) {
      throw new Error(`rnc: bad match len ${length} dist ${distance} at ${dp}/${dst.length}`);
    }
    for (let i = 0; i < length; i++) dst[dp++] = dst[from++]!;
  };

  for (;;) {
    if (bit() === 0) {
      if (dp >= dst.length || sp >= src.length) throw new Error(`rnc: literal past the end at ${dp}/${dst.length}`);
      dst[dp++] = src[sp++]!;
      continue;
    }

    let length: number;
    if (bit() === 0) {
      const x = bit();
      if (bit() === 0) {
        length = 4 + x;
      } else {
        length = (x + 3) * 2 + bit();
        if (length === 9) {
          // "10x1y" with x=y=1: a raw block of (4 bits + 3) * 4 bytes.
          let n = 0;
          for (let i = 0; i < 4; i++) n = (n << 1) | bit();
          const count = (n + 3) * 4;
          if (dp + count > dst.length || sp + count > src.length) throw new Error(`rnc: raw block past the end at ${dp}/${dst.length}`);
          for (let i = 0; i < count; i++) dst[dp++] = src[sp++]!;
          continue;
        }
      }
    } else if (bit() === 0) {
      // "110": length 2, one-byte offset.
      length = 2;
      const distance = src[sp++]! + 1;
      copy(length, distance);
      continue;
    } else if (bit() === 0) {
      length = 3;
    } else {
      // "1111": a byte gives the length, or 0 for a control code.
      const n = src[sp++]!;
      if (n === 0) {
        if (bit() === 0) {
          if (dp !== dst.length) throw new Error(`rnc: ended at ${dp} of ${dst.length}`);
          return;
        }
        continue;  // chunk boundary: nothing to reset
      }
      length = n + 8;
    }

    // Offset: optional high bits, then a low byte. Distance is offset + 1.
    let high = 0;
    if (bit() !== 0) {
      const a = bit();
      if (bit() === 0) {
        high = a === 0 ? (2 | bit()) : 1;
      } else {
        high = ((a << 1) | bit()) | 4;
        if (bit() === 0) high = (high << 1) | bit();
      }
    }
    const distance = ((high << 8) | src[sp++]!) + 1;
    copy(length, distance);
  }
}

/** CRC-16 as RNC computes it (reflected 0x8005, zero init), for checking decodes. */
export function rncCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]!;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

export interface RawRecord {
  /** Offset of the 14-byte header in the file. */
  offset: number;
  unpackedSize: number;
  packedSize: number;
  /** The decoded payload. Its first u32 is the record type. */
  data: Uint8Array;
  /** `data`'s leading u32, little-endian: 0x23 is the creature list. */
  type: number;
  /** Whether the decoded bytes match the header's CRC. */
  crcOk: boolean;
}

/** Walk and unpack every record of a `.raw` container. */
export function unpackRaw(buffer: ArrayBuffer | Uint8Array): RawRecord[] {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records: RawRecord[] = [];
  let p = 0;
  while (p + 14 <= bytes.length) {
    const unpackedSize = view.getUint32(p, false);
    if (unpackedSize === 0xffffffff) break;
    const packedSize = view.getUint32(p + 4, false);
    const data = new Uint8Array(unpackedSize);
    unpackRnc2(bytes.subarray(p + 14, p + 14 + packedSize), data);
    const type = unpackedSize >= 4 ? new DataView(data.buffer).getUint32(0, true) : -1;
    const crcOk = rncCrc(data) === view.getUint16(p + 8, false);
    records.push({ offset: p, unpackedSize, packedSize, data, type, crcOk });
    p += 14 + packedSize;
  }
  return records;
}
