/**
 * The cutscenes in `rtlibs/*.dll` are not libraries: each is an MPEG-1
 * PROGRAM stream (pack headers `00 00 01 BA` with the MPEG-1 marker,
 * video stream 0xE0 at 320 x 208 and 30 frames a second, MPEG-1 layer II
 * audio on stream 0xC0 at 44.1 kHz mono). The executable plays them through
 * DirectShow, and the extension only keeps them out of the way. Decoded
 * 2026-09-07; docs/FORMATS.md "The cutscenes".
 *
 * The browser decoder we use (jsmpeg) reads MPEG TRANSPORT streams, so this
 * rewraps the same elementary data: every PES packet is copied out of its
 * pack, given an MPEG-2 PES header carrying the same PTS (the five
 * timestamp bytes are identical in both), and cut into 188-byte transport
 * packets on PID 0x100 for video and 0x101 for audio, after a PAT and a
 * PMT. No decoding happens here and nothing is re-encoded.
 */

const TS_PACKET = 188;
const PID_PAT = 0;
const PID_PMT = 0x1000;
const PID_VIDEO = 0x100;
const PID_AUDIO = 0x101;
const PMT_PROGRAM = 1;

/** One elementary packet lifted out of the program stream. */
interface Pes {
  stream: number;
  /** The five timestamp bytes as stored, or null. */
  pts: Uint8Array | null;
  payload: Uint8Array;
}

/** Walk the program stream's packs and PES packets. */
export function readProgramStream(bytes: Uint8Array): Pes[] {
  const out: Pes[] = [];
  let i = 0;
  const n = bytes.length;
  while (i + 4 <= n) {
    if (bytes[i] !== 0 || bytes[i + 1] !== 0 || bytes[i + 2] !== 1) { i++; continue; }
    const id = bytes[i + 3]!;
    if (id === 0xba) {
      // A pack header: MPEG-1 packs are 12 bytes, MPEG-2 ones 14 plus stuffing.
      if ((bytes[i + 4]! & 0xc0) === 0x40) i += 14 + (bytes[i + 13]! & 7);
      else i += 12;
      continue;
    }
    if (id === 0xb9) break;                       // the end code
    const length = (bytes[i + 4]! << 8) | bytes[i + 5]!;
    const start = i + 6;
    const end = Math.min(n, start + length);
    i = end;
    if (id === 0xbb || id === 0xbc || id === 0xbe || id === 0xbf) continue;  // system header, PSM, padding, private 2
    if (!((id >= 0xe0 && id <= 0xef) || (id >= 0xc0 && id <= 0xdf))) continue;
    // The MPEG-1 PES header: stuffing, an optional STD buffer field, then
    // a PTS, a PTS and DTS, or the lone 0x0f meaning neither.
    let p = start;
    while (p < end && bytes[p] === 0xff) p++;
    if (p < end && (bytes[p]! & 0xc0) === 0x40) p += 2;
    let pts: Uint8Array | null = null;
    if (p < end) {
      const b = bytes[p]!;
      if ((b & 0xf0) === 0x20) { pts = bytes.subarray(p, p + 5); p += 5; }
      else if ((b & 0xf0) === 0x30) { pts = bytes.subarray(p, p + 5); p += 10; }
      else if (b === 0x0f) p += 1;
    }
    if (p > end) continue;
    out.push({ stream: id, pts, payload: bytes.subarray(p, end) });
  }
  return out;
}

/** CRC-32 as the MPEG tables want it (the "MPEG-2" polynomial, no reflection). */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte << 24;
    for (let k = 0; k < 8; k++) crc = (crc & 0x80000000) ? ((crc << 1) ^ 0x04c11db7) : (crc << 1);
  }
  return crc >>> 0;
}

/** A PSI table wrapped as one transport packet. */
function tablePacket(pid: number, tableId: number, body: Uint8Array): Uint8Array {
  const section = new Uint8Array(3 + body.length + 4);
  section[0] = tableId;
  const length = body.length + 4;
  section[1] = 0xb0 | ((length >> 8) & 0x0f);
  section[2] = length & 0xff;
  section.set(body, 3);
  const crc = crc32(section.subarray(0, 3 + body.length));
  section[3 + body.length] = crc >>> 24;
  section[4 + body.length] = (crc >>> 16) & 0xff;
  section[5 + body.length] = (crc >>> 8) & 0xff;
  section[6 + body.length] = crc & 0xff;
  const packet = new Uint8Array(TS_PACKET).fill(0xff);
  packet[0] = 0x47;
  packet[1] = 0x40 | ((pid >> 8) & 0x1f);
  packet[2] = pid & 0xff;
  packet[3] = 0x10;
  packet[4] = 0;                                  // pointer field
  packet.set(section, 5);
  return packet;
}

/**
 * Turn a program stream into a transport stream. The result is what a
 * `Blob` URL hands the decoder; it is a copy, about the same size.
 */
export function programToTransport(bytes: Uint8Array): Uint8Array {
  const packets = readProgramStream(bytes);
  const chunks: Uint8Array[] = [];

  // PAT: one program, whose map is on PID_PMT.
  chunks.push(tablePacket(PID_PAT, 0, new Uint8Array([
    0x00, 0x01, 0xc1, 0x00, 0x00,               // transport stream id, version/current, section 0 of 0
    (PMT_PROGRAM >> 8) & 0xff, PMT_PROGRAM & 0xff, 0xe0 | ((PID_PMT >> 8) & 0x1f), PID_PMT & 0xff,
  ])));
  // PMT: MPEG-1 video (type 1) and MPEG-1 audio (type 3).
  chunks.push(tablePacket(PID_PMT, 2, new Uint8Array([
    (PMT_PROGRAM >> 8) & 0xff, PMT_PROGRAM & 0xff, 0xc1, 0x00, 0x00,
    0xe0 | ((PID_VIDEO >> 8) & 0x1f), PID_VIDEO & 0xff,      // PCR PID
    0xf0, 0x00,                                              // no program info
    0x01, 0xe0 | ((PID_VIDEO >> 8) & 0x1f), PID_VIDEO & 0xff, 0xf0, 0x00,
    0x03, 0xe0 | ((PID_AUDIO >> 8) & 0x1f), PID_AUDIO & 0xff, 0xf0, 0x00,
  ])));

  const counters = new Map<number, number>();
  for (const pes of packets) {
    const pid = pes.stream >= 0xe0 ? PID_VIDEO : PID_AUDIO;
    // An MPEG-2 PES header: the marker, the flags, the header length, the PTS.
    const headerRest = pes.pts ? 3 + 5 : 3;
    const pesLength = headerRest + pes.payload.length;
    const header = new Uint8Array(6 + headerRest);
    header[0] = 0; header[1] = 0; header[2] = 1; header[3] = pes.stream;
    // Video may exceed a PES length field; 0 means "unbounded" there.
    const stated = pid === PID_VIDEO && pesLength > 0xffff ? 0 : pesLength;
    header[4] = (stated >> 8) & 0xff; header[5] = stated & 0xff;
    header[6] = 0x80;
    header[7] = pes.pts ? 0x80 : 0x00;
    header[8] = pes.pts ? 5 : 0;
    if (pes.pts) header.set(pes.pts, 9);

    // Cut into transport packets, the first flagged as a unit start and the
    // last padded through an adaptation field.
    const whole = new Uint8Array(header.length + pes.payload.length);
    whole.set(header); whole.set(pes.payload, header.length);
    let at = 0;
    let first = true;
    while (at < whole.length) {
      const cc = counters.get(pid) ?? 0;
      counters.set(pid, (cc + 1) & 0x0f);
      const packet = new Uint8Array(TS_PACKET);
      packet[0] = 0x47;
      packet[1] = (first ? 0x40 : 0) | ((pid >> 8) & 0x1f);
      packet[2] = pid & 0xff;
      const remaining = whole.length - at;
      if (remaining >= TS_PACKET - 4) {
        packet[3] = 0x10 | cc;
        packet.set(whole.subarray(at, at + TS_PACKET - 4), 4);
        at += TS_PACKET - 4;
      } else {
        // Adaptation field of stuffing so the payload ends the packet.
        const stuffing = TS_PACKET - 4 - remaining;
        packet[3] = 0x30 | cc;
        packet[4] = stuffing - 1;
        if (stuffing > 1) { packet[5] = 0; packet.fill(0xff, 6, 4 + stuffing); }
        packet.set(whole.subarray(at), 4 + stuffing);
        at = whole.length;
      }
      chunks.push(packet);
      first = false;
    }
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
