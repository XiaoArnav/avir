/**
 * Pure-TypeScript GRIB2 Decoder for NOAA GFS & ECMWF IFS Operational Wind Messages
 *
 * Designed for serverless execution (Vercel / Node.js 20+) without native C libraries or large
 * WASM binary dependencies. Validates GRIB2 framing, metadata sections, and decodes:
 * - Template 5.0: Grid Point Data - Simple Packing
 * - Template 5.2: Grid Point Data - Complex Packing
 * - Template 5.3: Grid Point Data - Complex Packing & Spatial Differencing (Order 1 & 2) [NOAA GFS]
 * - Template 5.42: Grid Point Data - CCSDS 121.0-B-3 Lossless Entropy Coding (AEC) [ECMWF IFS]
 *
 * Also handles Section 6 bitmaps when present and rejects truncated/malformed payloads cleanly.
 */

export interface DecodedGrib2Message {
  ni: number;
  nj: number;
  lo1: number;
  la1: number;
  di: number;
  dj: number;
  scanMode: number;
  initTimeUtc: string;
  validTimeUtc: string;
  forecastMinutes: number;
  discipline: number;
  parameterCategory: number;
  parameterNumber: number;
  levelType: number;
  levelValue: number;
  templateNumber: number;
  values: Float64Array;
}

const MAX_GRIB2_BYTES = 24 * 1024 * 1024;
const MAX_GRID_POINTS = 2_000_000;

function readSignMagnitudeInt16(hi: number, lo: number): number {
  const raw = (hi << 8) | lo;
  const negative = (raw & 0x8000) !== 0;
  const magnitude = raw & 0x7fff;
  return negative ? -magnitude : magnitude;
}

function readSignMagnitudeInt32(buf: Uint8Array, offset: number): number {
  const b0 = buf[offset];
  const negative = (b0 & 0x80) !== 0;
  const magnitude = ((b0 & 0x7f) * 16_777_216) + ((buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]);
  return negative ? -magnitude : magnitude;
}

class BitStreamReader {
  private readonly buf: Uint8Array;
  private bytePos: number;
  private readonly byteEnd: number;
  private bitPos = 0;

  constructor(buf: Uint8Array, byteOffset: number, byteEnd: number) {
    this.buf = buf;
    this.bytePos = byteOffset;
    this.byteEnd = byteEnd;
  }

  alignToByte(): void {
    if (this.bitPos !== 0) {
      this.bytePos += 1;
      this.bitPos = 0;
    }
  }

  readBits(bitCount: number): number {
    if (bitCount === 0) return 0;
    if (bitCount < 0 || bitCount > 32) {
      throw new Error(`Invalid bit read width: ${bitCount}`);
    }
    let val = 0;
    let remaining = bitCount;
    while (remaining > 0) {
      if (this.bytePos >= this.byteEnd) {
        throw new Error('Truncated GRIB2 Section 7 bitstream');
      }
      const avail = 8 - this.bitPos;
      const take = Math.min(remaining, avail);
      const shift = avail - take;
      const bits = (this.buf[this.bytePos] >> shift) & ((1 << take) - 1);
      val = val * (1 << take) + bits;
      this.bitPos += take;
      if (this.bitPos === 8) {
        this.bitPos = 0;
        this.bytePos += 1;
      }
      remaining -= take;
    }
    return val;
  }

  readZeroRunUntilOne(): number {
    let zeros = 0;
    while (this.readBits(1) === 0) {
      zeros++;
    }
    return zeros;
  }
}

function forecastUnitMultiplierMinutes(unitCode: number): number | null {
  switch (unitCode) {
    case 0: // Minute
      return 1;
    case 1: // Hour
      return 60;
    case 2: // Day
      return 1440;
    case 10: // 3 hours
      return 180;
    case 11: // 6 hours
      return 360;
    case 12: // 12 hours
      return 720;
    case 13: // Second
      return 1 / 60;
    default:
      return null;
  }
}

function decodeSimplePacking(
  buf: Uint8Array,
  dv: DataView,
  sec5Off: number,
  sec7Off: number,
  sec7Len: number,
  packedCount: number
): Float64Array {
  const refVal = dv.getFloat32(sec5Off + 11, false);
  const E = readSignMagnitudeInt16(buf[sec5Off + 15], buf[sec5Off + 16]);
  const D = readSignMagnitudeInt16(buf[sec5Off + 17], buf[sec5Off + 18]);
  const bpv = buf[sec5Off + 19];
  const scale2 = Math.pow(2, E);
  const scale10 = Math.pow(10, -D);

  const out = new Float64Array(packedCount);
  if (bpv === 0) {
    const constant = refVal * scale10;
    out.fill(constant);
    return out;
  }

  const reader = new BitStreamReader(buf, sec7Off + 5, sec7Off + sec7Len);
  for (let i = 0; i < packedCount; i++) {
    const raw = reader.readBits(bpv);
    out[i] = (refVal + raw * scale2) * scale10;
  }
  return out;
}

function decodeComplexPacking(
  buf: Uint8Array,
  dv: DataView,
  sec5Off: number,
  sec5Len: number,
  sec7Off: number,
  sec7Len: number,
  packedCount: number,
  tmpl: number
): Float64Array {
  if (sec5Len < (tmpl === 3 ? 49 : 47)) {
    throw new Error('Malformed GRIB2 Section 5 complex packing header');
  }
  const refVal = dv.getFloat32(sec5Off + 11, false);
  const E = readSignMagnitudeInt16(buf[sec5Off + 15], buf[sec5Off + 16]);
  const D = readSignMagnitudeInt16(buf[sec5Off + 17], buf[sec5Off + 18]);
  const bpv = buf[sec5Off + 19];
  const ng = dv.getUint32(sec5Off + 31, false);
  const refGroupWidth = buf[sec5Off + 35];
  const bitsGroupWidth = buf[sec5Off + 36];
  const refGroupLength = dv.getUint32(sec5Off + 37, false);
  const incGroupLength = buf[sec5Off + 41];
  const lastGroupLength = dv.getUint32(sec5Off + 42, false);
  const bitsGroupLength = buf[sec5Off + 46];

  const order = tmpl === 3 ? buf[sec5Off + 47] : 0;
  const extraOctets = tmpl === 3 ? buf[sec5Off + 48] : 0;

  const scale2 = Math.pow(2, E);
  const scale10 = Math.pow(10, -D);

  if (ng === 0) {
    const out = new Float64Array(packedCount);
    out.fill(refVal * scale10);
    return out;
  }

  let cur = sec7Off + 5;
  const readExtraSigned = (off: number, octets: number): number => {
    if (octets === 0) return 0;
    let val = buf[off] & 0x7f;
    for (let k = 1; k < octets; k++) {
      val = val * 256 + buf[off + k];
    }
    return (buf[off] & 0x80) !== 0 ? -val : val;
  };

  const initVals: number[] = [];
  let hMin = 0;
  if (tmpl === 3 && order > 0) {
    if (cur + (order + 1) * extraOctets > sec7Off + sec7Len) {
      throw new Error('Truncated spatial differencing descriptors in GRIB2 Section 7');
    }
    for (let k = 0; k < order; k++) {
      initVals.push(readExtraSigned(cur, extraOctets));
      cur += extraOctets;
    }
    hMin = readExtraSigned(cur, extraOctets);
    cur += extraOctets;
  }

  const reader = new BitStreamReader(buf, cur, sec7Off + sec7Len);
  const groupRefs = new Int32Array(ng);
  for (let g = 0; g < ng; g++) groupRefs[g] = reader.readBits(bpv);
  reader.alignToByte();

  const groupWidths = new Uint8Array(ng);
  for (let g = 0; g < ng; g++) groupWidths[g] = refGroupWidth + reader.readBits(bitsGroupWidth);
  reader.alignToByte();

  const groupLengths = new Uint32Array(ng);
  for (let g = 0; g < ng; g++) {
    const rawLen = reader.readBits(bitsGroupLength);
    groupLengths[g] = g === ng - 1 ? lastGroupLength : refGroupLength + rawLen * incGroupLength;
  }
  reader.alignToByte();

  const raw = new Float64Array(packedCount);
  let idx = 0;
  for (let g = 0; g < ng; g++) {
    const w = groupWidths[g];
    const len = groupLengths[g];
    const ref = groupRefs[g];
    for (let k = 0; k < len && idx < packedCount; k++) {
      raw[idx++] = ref + (w > 0 ? reader.readBits(w) : 0);
    }
  }

  if (idx !== packedCount) {
    throw new Error(`GRIB2 Section 7 decoded count (${idx}) mismatch with expected (${packedCount})`);
  }

  if (tmpl === 3 && order === 2 && packedCount >= 2) {
    raw[0] = initVals[0];
    raw[1] = initVals[1];
    for (let k = 2; k < packedCount; k++) {
      raw[k] = raw[k] + hMin + 2 * raw[k - 1] - raw[k - 2];
    }
  } else if (tmpl === 3 && order === 1 && packedCount >= 1) {
    raw[0] = initVals[0];
    for (let k = 1; k < packedCount; k++) {
      raw[k] = raw[k] + hMin + raw[k - 1];
    }
  }

  const out = new Float64Array(packedCount);
  for (let k = 0; k < packedCount; k++) {
    out[k] = (refVal + raw[k] * scale2) * scale10;
  }
  return out;
}

function decodeCcsdsAecPacking(
  buf: Uint8Array,
  dv: DataView,
  sec5Off: number,
  sec5Len: number,
  sec7Off: number,
  sec7Len: number,
  packedCount: number
): Float64Array {
  if (sec5Len < 25) {
    throw new Error('Malformed GRIB2 Section 5 CCSDS header');
  }
  const refVal = dv.getFloat32(sec5Off + 11, false);
  const E = readSignMagnitudeInt16(buf[sec5Off + 15], buf[sec5Off + 16]);
  const D = readSignMagnitudeInt16(buf[sec5Off + 17], buf[sec5Off + 18]);
  const bpv = buf[sec5Off + 19];
  const flags = buf[sec5Off + 21];
  const blockSize = buf[sec5Off + 22];
  const rsi = dv.getUint16(sec5Off + 23, false);

  const scale2 = Math.pow(2, E);
  const scale10 = Math.pow(10, -D);
  if (bpv === 0) {
    const out = new Float64Array(packedCount);
    out.fill(refVal * scale10);
    return out;
  }
  if (blockSize < 2 || rsi < 1) {
    throw new Error(`Invalid CCSDS blockSize=${blockSize} or rsi=${rsi}`);
  }

  const preprocess = (flags & 4) !== 0;
  const idLen = bpv <= 8 ? 3 : bpv <= 16 ? 4 : 5;
  const uncodedId = (1 << idLen) - 1;
  const xMax = bpv === 32 ? 0xffffffff : (1 << bpv) - 1;
  const xMid = Math.pow(2, bpv - 1);

  const reader = new BitStreamReader(buf, sec7Off + 5, sec7Off + sec7Len);
  const mapped = new Uint32Array(packedCount);
  let i = 0;
  let blockInRsi = 0;

  while (i < packedCount) {
    const isRef = preprocess && blockInRsi % rsi === 0;
    const id = reader.readBits(idLen);
    const blockCount = Math.min(blockSize, packedCount - i);

    if (id === 0) {
      const se = reader.readBits(1);
      if (se === 0) {
        let refSample = 0;
        if (isRef) {
          refSample = reader.readBits(bpv);
        }
        const fsZeros = reader.readZeroRunUntilOne();
        const leftInSeg = 64 - (blockInRsi % 64);
        const leftInRsi = rsi - blockInRsi;
        const zeroBlocks =
          fsZeros < 4
            ? fsZeros + 1
            : fsZeros === 4
              ? Math.min(leftInSeg, leftInRsi)
              : fsZeros;

        for (let zb = 0; zb < zeroBlocks && i < packedCount; zb++) {
          const c = Math.min(blockSize, packedCount - i);
          if (zb === 0 && isRef) {
            mapped[i] = refSample;
            for (let z = 1; z < c; z++) mapped[i + z] = 0;
          } else {
            for (let z = 0; z < c; z++) mapped[i + z] = 0;
          }
          i += c;
          blockInRsi++;
        }
      } else {
        if (isRef) {
          mapped[i] = reader.readBits(bpv);
          const m = reader.readZeroRunUntilOne();
          const s = Math.floor((Math.sqrt(8 * m + 1) - 1) / 2);
          if (i + 1 < packedCount) {
            mapped[i + 1] = m - (s * (s + 1)) / 2;
          }
        }
        for (let k = isRef ? 2 : 0; k < blockCount; k += 2) {
          const m2 = reader.readZeroRunUntilOne();
          const s2 = Math.floor((Math.sqrt(8 * m2 + 1) - 1) / 2);
          const b2 = m2 - (s2 * (s2 + 1)) / 2;
          mapped[i + k] = s2 - b2;
          if (i + k + 1 < packedCount) {
            mapped[i + k + 1] = b2;
          }
        }
        i += blockCount;
        blockInRsi++;
      }
    } else if (id === uncodedId) {
      for (let k = 0; k < blockCount; k++) {
        mapped[i + k] = reader.readBits(bpv);
      }
      i += blockCount;
      blockInRsi++;
    } else {
      const kSplit = id - 1;
      let startK = 0;
      if (isRef) {
        mapped[i] = reader.readBits(bpv);
        startK = 1;
      }
      const fsArr = new Uint32Array(blockCount);
      for (let k = startK; k < blockCount; k++) {
        fsArr[k] = reader.readZeroRunUntilOne();
      }
      for (let k = startK; k < blockCount; k++) {
        mapped[i + k] =
          (fsArr[k] << kSplit) | (kSplit > 0 ? reader.readBits(kSplit) : 0);
      }
      i += blockCount;
      blockInRsi++;
    }

    if (blockInRsi >= rsi) blockInRsi = 0;
  }

  const out = new Float64Array(packedCount);
  let prev = 0;
  for (let k = 0; k < packedCount; k++) {
    let raw: number;
    if (!preprocess || k % (rsi * blockSize) === 0) {
      raw = mapped[k];
    } else {
      const x = prev;
      const theta = Math.min(x, xMax - x);
      const omega = mapped[k];
      const delta =
        omega <= 2 * theta
          ? (omega & 1) === 0
            ? omega >>> 1
            : -((omega + 1) >>> 1)
          : x < xMid
            ? omega - theta
            : theta - omega;
      raw = x + delta;
    }
    prev = raw;
    out[k] = (refVal + raw * scale2) * scale10;
  }

  return out;
}

/**
 * Decodes one GRIB2 message buffer into a validated grid and physical metadata.
 * Throws strictly on malformed framing, unsupported grid/packing templates, or non-finite values.
 */
export function decodeWindGrib2Message(buffer: Uint8Array | Buffer): DecodedGrib2Message {
  const buf =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (buf.byteLength < 32 || buf.byteLength > MAX_GRIB2_BYTES) {
    throw new Error('GRIB2 message size out of valid bounds');
  }

  if (
    buf[0] !== 0x47 ||
    buf[1] !== 0x52 ||
    buf[2] !== 0x49 ||
    buf[3] !== 0x42
  ) {
    throw new Error('Invalid GRIB2 header signature');
  }

  const edition = buf[7];
  if (edition !== 2) {
    throw new Error(`Unsupported GRIB edition: ${edition}`);
  }

  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const declaredLength = Number(dv.getBigUint64(8, false));
  if (!Number.isSafeInteger(declaredLength) || declaredLength !== buf.byteLength) {
    throw new Error('GRIB2 declared message length does not match byte length');
  }

  const endOff = buf.byteLength - 4;
  if (
    buf[endOff] !== 0x37 ||
    buf[endOff + 1] !== 0x37 ||
    buf[endOff + 2] !== 0x37 ||
    buf[endOff + 3] !== 0x37
  ) {
    throw new Error('Missing GRIB2 trailing 7777 marker');
  }

  const discipline = buf[6];
  const sections = new Map<number, { off: number; len: number }>();
  let off = 16;

  while (off < endOff) {
    if (off + 5 > endOff) {
      throw new Error('Truncated GRIB2 section header');
    }
    const len = dv.getUint32(off, false);
    const num = buf[off + 4];
    if (len < 5 || off + len > endOff) {
      throw new Error(`Invalid GRIB2 section ${num} length`);
    }
    sections.set(num, { off, len });
    off += len;
  }

  const sec1 = sections.get(1);
  const sec3 = sections.get(3);
  const sec4 = sections.get(4);
  const sec5 = sections.get(5);
  const sec6 = sections.get(6);
  const sec7 = sections.get(7);

  if (!sec1 || !sec3 || !sec4 || !sec5 || !sec7) {
    throw new Error('GRIB2 message missing mandatory sections');
  }
  if (sec1.len < 21 || sec3.len < 72 || sec4.len < 34 || sec5.len < 21) {
    throw new Error('GRIB2 section header shorter than mandatory minimum');
  }

  // Section 1: Reference Time (Model Run / Initialization UTC)
  const year = dv.getUint16(sec1.off + 12, false);
  const month = buf[sec1.off + 14];
  const day = buf[sec1.off + 15];
  const hour = buf[sec1.off + 16];
  const minute = buf[sec1.off + 17];
  const second = buf[sec1.off + 18];
  const initMs = Date.UTC(year, month - 1, day, hour, minute, second);
  if (
    !Number.isFinite(initMs) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23
  ) {
    throw new Error('Invalid GRIB2 Section 1 reference timestamp');
  }
  const initTimeUtc = new Date(initMs).toISOString();

  // Section 3: Latitude/Longitude Grid Definition (Template 3.0)
  const gridTemplate = dv.getUint16(sec3.off + 12, false);
  if (gridTemplate !== 0) {
    throw new Error(`Unsupported GRIB2 grid template 3.${gridTemplate}`);
  }
  const ni = dv.getUint32(sec3.off + 30, false);
  const nj = dv.getUint32(sec3.off + 34, false);
  if (ni < 2 || nj < 2 || ni * nj > MAX_GRID_POINTS) {
    throw new Error(`Invalid GRIB2 grid dimensions ${ni}x${nj}`);
  }
  const la1Raw = readSignMagnitudeInt32(buf, sec3.off + 46);
  const lo1Raw = readSignMagnitudeInt32(buf, sec3.off + 50);
  const diRaw = dv.getUint32(sec3.off + 63, false);
  const djRaw = dv.getUint32(sec3.off + 67, false);
  const scanMode = buf[sec3.off + 71];
  const basicAngle = dv.getUint32(sec3.off + 38, false);
  const subDiv = dv.getUint32(sec3.off + 42, false);
  const unitFactor =
    basicAngle === 0 || basicAngle === 0xffffffff || subDiv === 0 || subDiv === 0xffffffff
      ? 1e-6
      : basicAngle / subDiv;

  const la1 = la1Raw * unitFactor;
  const lo1 = lo1Raw * unitFactor;
  const di = diRaw * unitFactor;
  const dj = djRaw * unitFactor;
  if (![la1, lo1, di, dj].every(Number.isFinite) || di <= 0 || dj <= 0) {
    throw new Error('Invalid GRIB2 lat/lon spacing parameters');
  }

  // Section 4: Product Definition (Template 4.0 forecast parameter and lead time)
  const prodTemplate = dv.getUint16(sec4.off + 7, false);
  if (prodTemplate !== 0 && prodTemplate !== 8) {
    throw new Error(`Unsupported GRIB2 product template 4.${prodTemplate}`);
  }
  const parameterCategory = buf[sec4.off + 9];
  const parameterNumber = buf[sec4.off + 10];
  const timeUnit = buf[sec4.off + 17];
  const forecastTimeVal = dv.getInt32(sec4.off + 18, false);
  const multMin = forecastUnitMultiplierMinutes(timeUnit);
  if (multMin === null) {
    throw new Error(`Unsupported GRIB2 forecast time unit ${timeUnit}`);
  }
  const forecastMinutes = Math.round(forecastTimeVal * multMin);
  const validTimeUtc = new Date(initMs + forecastMinutes * 60_000).toISOString();
  const levelType = buf[sec4.off + 22];
  const levelScale = buf[sec4.off + 23];
  const levelScaled = dv.getUint32(sec4.off + 24, false);
  const levelValue = levelScale === 0 ? levelScaled : levelScaled * Math.pow(10, -levelScale);

  // Section 5: Data Representation
  const numPackedPts = dv.getUint32(sec5.off + 5, false);
  const drsTemplate = dv.getUint16(sec5.off + 9, false);
  const totalGridPts = ni * nj;

  let decodedPacked: Float64Array;
  if (drsTemplate === 0) {
    decodedPacked = decodeSimplePacking(buf, dv, sec5.off, sec7.off, sec7.len, numPackedPts);
  } else if (drsTemplate === 2 || drsTemplate === 3) {
    decodedPacked = decodeComplexPacking(
      buf,
      dv,
      sec5.off,
      sec5.len,
      sec7.off,
      sec7.len,
      numPackedPts,
      drsTemplate
    );
  } else if (drsTemplate === 42) {
    decodedPacked = decodeCcsdsAecPacking(
      buf,
      dv,
      sec5.off,
      sec5.len,
      sec7.off,
      sec7.len,
      numPackedPts
    );
  } else {
    throw new Error(`Unsupported GRIB2 Data Representation Template 5.${drsTemplate}`);
  }

  // Section 6: Bitmap Application (if indicator == 0)
  let values: Float64Array;
  const bitmapIndicator = sec6 ? buf[sec6.off + 5] : 255;
  if (bitmapIndicator === 255) {
    if (decodedPacked.length !== totalGridPts) {
      throw new Error(`GRIB2 point count (${decodedPacked.length}) does not match grid ${ni}x${nj}`);
    }
    values = decodedPacked;
  } else if (bitmapIndicator === 0 && sec6) {
    const bitmapBytesNeeded = Math.ceil(totalGridPts / 8);
    if (sec6.len < 6 + bitmapBytesNeeded) {
      throw new Error('Truncated GRIB2 Section 6 bitmap');
    }
    values = new Float64Array(totalGridPts);
    let pIdx = 0;
    for (let g = 0; g < totalGridPts; g++) {
      const bitOn = (buf[sec6.off + 6 + (g >> 3)] & (0x80 >> (g & 7))) !== 0;
      if (bitOn) {
        if (pIdx >= decodedPacked.length) {
          throw new Error('GRIB2 bitmap specifies more present values than packed count');
        }
        values[g] = decodedPacked[pIdx++];
      } else {
        values[g] = Number.NaN;
      }
    }
  } else {
    throw new Error(`Unsupported GRIB2 Section 6 bitmap indicator ${bitmapIndicator}`);
  }

  return {
    ni,
    nj,
    lo1,
    la1,
    di,
    dj,
    scanMode,
    initTimeUtc,
    validTimeUtc,
    forecastMinutes,
    discipline,
    parameterCategory,
    parameterNumber,
    levelType,
    levelValue,
    templateNumber: drsTemplate,
    values,
  };
}
