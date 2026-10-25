/** 16-bit PCM WAV with a LIST/INFO comment chunk (used to mark audio as simulated). */
export function encodeWav(channels: Float32Array[], sr: number, comment = ''): ArrayBuffer {
  const nch = channels.length;
  const n = channels[0].length;
  const enc = new TextEncoder();
  const cmt = enc.encode(comment + '\0');
  const cmtPad = cmt.length + (cmt.length % 2);
  const sw = enc.encode('V8 LAB\0');
  const swPad = sw.length + (sw.length % 2);
  const listSize = comment ? 4 + 8 + cmtPad + 8 + swPad : 0;
  const dataSize = n * nch * 2;
  const total = 44 + (listSize ? 8 + listSize : 0) + dataSize;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  let o = 0;
  const str = (s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o++, s.charCodeAt(i));
  };
  const u32 = (v: number) => {
    dv.setUint32(o, v, true);
    o += 4;
  };
  const u16 = (v: number) => {
    dv.setUint16(o, v, true);
    o += 2;
  };
  str('RIFF');
  u32(total - 8);
  str('WAVE');
  str('fmt ');
  u32(16);
  u16(1);
  u16(nch);
  u32(sr);
  u32(sr * nch * 2);
  u16(nch * 2);
  u16(16);
  if (listSize) {
    str('LIST');
    u32(listSize);
    str('INFO');
    str('ICMT');
    u32(cmt.length);
    new Uint8Array(buf, o, cmt.length).set(cmt);
    o += cmtPad;
    str('ISFT');
    u32(sw.length);
    new Uint8Array(buf, o, sw.length).set(sw);
    o += swPad;
  }
  str('data');
  u32(dataSize);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return buf;
}

/** Minimal parser (for tests and re-import checks). */
export function parseWavHeader(buf: ArrayBuffer): { sr: number; channels: number; bits: number; frames: number; comment: string | null } {
  const dv = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');
  let o = 12;
  let sr = 0, channels = 0, bits = 0, frames = 0;
  let comment: string | null = null;
  while (o + 8 <= buf.byteLength) {
    const id = tag(o);
    const size = dv.getUint32(o + 4, true);
    if (id === 'fmt ') {
      channels = dv.getUint16(o + 10, true);
      sr = dv.getUint32(o + 12, true);
      bits = dv.getUint16(o + 22, true);
    } else if (id === 'data') frames = size / (channels * (bits / 8));
    else if (id === 'LIST' && tag(o + 8) === 'INFO') {
      let p = o + 12;
      while (p < o + 8 + size) {
        const sid = tag(p);
        const ss = dv.getUint32(p + 4, true);
        if (sid === 'ICMT') comment = new TextDecoder().decode(new Uint8Array(buf, p + 8, ss)).replace(/\0+$/, '');
        p += 8 + ss + (ss % 2);
      }
    }
    o += 8 + size + (size % 2);
  }
  return { sr, channels, bits, frames, comment };
}
