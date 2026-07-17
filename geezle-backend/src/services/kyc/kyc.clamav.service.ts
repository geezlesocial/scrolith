/**
 * ClamAV client — talks to an isolated clamd process/service over TCP.
 * GPLv2 ClamAV is NOT linked into this application binary.
 */
import net from 'net';
import {
  KYC_CLAMAV_RETRIES,
  KYC_CLAMAV_TIMEOUT_MS
} from './kyc.constants';

export type ClamAvScanResult = {
  clean: boolean;
  infected: boolean;
  unavailable: boolean;
  signature?: string | null;
  engine: string;
  definitionVersion?: string | null;
  rawStatus: 'CLEAN' | 'INFECTED' | 'UNAVAILABLE' | 'ERROR';
};

const trim = (value: unknown) => String(value || '').trim();

const resolveMode = () => {
  // mock_clean / mock_infected for unit tests only.
  const mode = trim(process.env.CLAMAV_MODE || process.env.KYC_CLAMAV_MODE).toLowerCase();
  if (mode === 'mock_clean' || mode === 'mock_infected' || mode === 'disabled') return mode;
  return 'tcp';
};

const resolveHost = () => trim(process.env.CLAMAV_HOST || process.env.KYC_CLAMAV_HOST) || '127.0.0.1';
const resolvePort = () => {
  const port = Number(process.env.CLAMAV_PORT || process.env.KYC_CLAMAV_PORT || 3310);
  return Number.isFinite(port) && port > 0 ? port : 3310;
};

const scanViaInstream = (buffer: Buffer, host: string, port: number, timeoutMs: number): Promise<ClamAvScanResult> =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    let response = '';

    const finish = (result: ClamAvScanResult) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.on('timeout', () => {
      finish({
        clean: false,
        infected: false,
        unavailable: true,
        engine: 'clamav',
        rawStatus: 'UNAVAILABLE',
        signature: null
      });
    });

    socket.on('error', () => {
      finish({
        clean: false,
        infected: false,
        unavailable: true,
        engine: 'clamav',
        rawStatus: 'UNAVAILABLE',
        signature: null
      });
    });

    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
    });

    socket.on('end', () => {
      const normalized = response.trim();
      if (/OK$/i.test(normalized) || /: OK/i.test(normalized)) {
        finish({
          clean: true,
          infected: false,
          unavailable: false,
          engine: 'clamav',
          rawStatus: 'CLEAN',
          signature: null
        });
        return;
      }
      const infectedMatch = normalized.match(/FOUND/i);
      if (infectedMatch) {
        const signature = normalized.replace(/.*:\s*/, '').replace(/\s*FOUND.*/i, '').trim() || 'UNKNOWN';
        finish({
          clean: false,
          infected: true,
          unavailable: false,
          engine: 'clamav',
          rawStatus: 'INFECTED',
          // Do not log full signature strings with path data; keep short code only.
          signature: signature.slice(0, 80)
        });
        return;
      }
      finish({
        clean: false,
        infected: false,
        unavailable: true,
        engine: 'clamav',
        rawStatus: 'ERROR',
        signature: null
      });
    });

    socket.connect(port, host, () => {
      // clamd INSTREAM protocol
      socket.write('zINSTREAM\0');
      const chunkSize = 2048;
      for (let offset = 0; offset < buffer.length; offset += chunkSize) {
        const slice = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
        const size = Buffer.alloc(4);
        size.writeUInt32BE(slice.length, 0);
        socket.write(size);
        socket.write(slice);
      }
      const end = Buffer.alloc(4);
      end.writeUInt32BE(0, 0);
      socket.write(end);
    });
  });

/**
 * Scan buffer with ClamAV. Fail-closed: unavailable/error => not clean.
 * Never logs file content.
 */
export const scanBufferWithClamAv = async (buffer: Buffer): Promise<ClamAvScanResult> => {
  const mode = resolveMode();
  if (mode === 'mock_clean') {
    return {
      clean: true,
      infected: false,
      unavailable: false,
      engine: 'clamav-mock',
      definitionVersion: 'mock-1',
      rawStatus: 'CLEAN'
    };
  }
  if (mode === 'mock_infected') {
    return {
      clean: false,
      infected: true,
      unavailable: false,
      engine: 'clamav-mock',
      definitionVersion: 'mock-1',
      signature: 'Eicar-Test-Signature',
      rawStatus: 'INFECTED'
    };
  }
  if (mode === 'disabled') {
    // Fail closed — never mark clean when scanner is disabled.
    return {
      clean: false,
      infected: false,
      unavailable: true,
      engine: 'clamav',
      rawStatus: 'UNAVAILABLE'
    };
  }

  const host = resolveHost();
  const port = resolvePort();
  const timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS || KYC_CLAMAV_TIMEOUT_MS);
  const retries = Math.max(0, Number(process.env.CLAMAV_RETRIES || KYC_CLAMAV_RETRIES));

  let last: ClamAvScanResult | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    last = await scanViaInstream(buffer, host, port, timeoutMs);
    if (last.clean || last.infected) return last;
  }
  return (
    last || {
      clean: false,
      infected: false,
      unavailable: true,
      engine: 'clamav',
      rawStatus: 'UNAVAILABLE'
    }
  );
};

export const getClamAvConfigSnapshot = () => ({
  mode: resolveMode(),
  host: resolveHost(),
  port: resolvePort(),
  timeoutMs: Number(process.env.CLAMAV_TIMEOUT_MS || KYC_CLAMAV_TIMEOUT_MS)
});
