export interface IWavWriter {
  pushSample: (s16: number) => void;
  finish: () => Uint8Array;
  getSampleCount: () => number;
}

export const createWavWriter = (sampleRate: number): IWavWriter => {
  const sr: number = sampleRate >>> 0;
  const buffers: Uint8Array[] = [];
  let sampleCount = 0;

  const pushSample = (s16: number): void => {
    // Clamp and store little-endian 16-bit
    let v = s16 | 0;
    if (v > 32767) v = 32767;
    if (v < -32768) v = -32768;
    const b = new Uint8Array(2);
    b[0] = v & 0xff;
    b[1] = (v >> 8) & 0xff;
    buffers.push(b);
    sampleCount++;
  };

  const finish = (): Uint8Array => {
    const dataSize = sampleCount * 2; // mono, 16-bit
    const fmtChunkSize = 16;
    const headerSize = 12 + 8 + fmtChunkSize + 8; // RIFF + fmt + data header (no data yet)
    const totalSize = headerSize + dataSize;

    const out = new Uint8Array(totalSize);
    let off = 0;
    // RIFF header
    out[off++] = 0x52; out[off++] = 0x49; out[off++] = 0x46; out[off++] = 0x46; // 'RIFF'
    const riffSize = totalSize - 8;
    out[off++] = riffSize & 0xff;
    out[off++] = (riffSize >> 8) & 0xff;
    out[off++] = (riffSize >> 16) & 0xff;
    out[off++] = (riffSize >> 24) & 0xff;
    out[off++] = 0x57; out[off++] = 0x41; out[off++] = 0x56; out[off++] = 0x45; // 'WAVE'

    // fmt chunk
    out[off++] = 0x66; out[off++] = 0x6D; out[off++] = 0x74; out[off++] = 0x20; // 'fmt '
    out[off++] = fmtChunkSize & 0xff;
    out[off++] = (fmtChunkSize >> 8) & 0xff;
    out[off++] = (fmtChunkSize >> 16) & 0xff;
    out[off++] = (fmtChunkSize >> 24) & 0xff;
    // PCM format (1)
    out[off++] = 1; out[off++] = 0;
    // channels = 1
    out[off++] = 1; out[off++] = 0;
    // sample rate
    const sr32 = sr >>> 0;
    out[off++] = sr32 & 0xff;
    out[off++] = (sr32 >> 8) & 0xff;
    out[off++] = (sr32 >> 16) & 0xff;
    out[off++] = (sr32 >> 24) & 0xff;
    // byte rate = sr * blockAlign
    const blockAlign = 2; // mono 16-bit
    const byteRate = (sr32 * blockAlign) >>> 0;
    out[off++] = byteRate & 0xff;
    out[off++] = (byteRate >> 8) & 0xff;
    out[off++] = (byteRate >> 16) & 0xff;
    out[off++] = (byteRate >> 24) & 0xff;
    // block align
    out[off++] = blockAlign & 0xff;
    out[off++] = (blockAlign >> 8) & 0xff;
    // bits per sample
    out[off++] = 16; out[off++] = 0;

    // data chunk header
    out[off++] = 0x64; out[off++] = 0x61; out[off++] = 0x74; out[off++] = 0x61; // 'data'
    out[off++] = dataSize & 0xff;
    out[off++] = (dataSize >> 8) & 0xff;
    out[off++] = (dataSize >> 16) & 0xff;
    out[off++] = (dataSize >> 24) & 0xff;

    // data
    for (const b of buffers) {
      out[off++] = b[0]!;
      out[off++] = b[1]!;
    }
    return out;
  };

  const getSampleCount = (): number => sampleCount | 0;

  return { pushSample, finish, getSampleCount };
};