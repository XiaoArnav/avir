/**
 * AVIR — Local Wi-Fi Device Address Validator (Step 5/24)
 *
 * Enforces strict local network boundaries, prevents SSRF / public IP access,
 * and strips/rejects malicious injection attempts (credentials, paths, queries).
 */

export interface ValidatedDeviceAddress {
  valid: boolean;
  cleanHost: string;
  port?: number;
  url: string;
  error?: string;
}

/**
 * Checks if an IPv4 address is in private/local range:
 * - 10.0.0.0/8 (10.0.0.0 – 10.255.255.255)
 * - 172.16.0.0/12 (172.16.0.0 – 172.31.255.255)
 * - 192.168.0.0/16 (192.168.0.0 – 192.168.255.255)
 * - 127.0.0.0/8 (Loopback for local testing / emulator)
 * - 169.254.0.0/16 (Link-local)
 */
export function isPrivateIpv4(octets: number[]): boolean {
  if (octets.length !== 4) return false;
  const [a, b, c, d] = octets;
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

  // 10.0.0.0/8
  if (a === 10) return true;

  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  // 127.0.0.0/8 (Localhost loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-local autoconfig)
  if (a === 169 && b === 254) return true;

  return false;
}

export function validateDeviceAddress(input: string, endpointPath = '/measures/current'): ValidatedDeviceAddress {
  if (!input || typeof input !== 'string') {
    return { valid: false, cleanHost: '', url: '', error: 'Device address cannot be empty.' };
  }

  const raw = input.trim();
  if (raw.length === 0) {
    return { valid: false, cleanHost: '', url: '', error: 'Device address cannot be empty.' };
  }

  // Reject embedded credentials
  if (raw.includes('@')) {
    return { valid: false, cleanHost: '', url: '', error: 'Embedded user credentials (@) are not permitted in device addresses.' };
  }

  // Reject query parameters, hash fragments, or path traversal
  if (raw.includes('?') || raw.includes('#') || raw.includes('..')) {
    return { valid: false, cleanHost: '', url: '', error: 'Query parameters, hash fragments, and path traversals are not permitted.' };
  }

  // Strip leading protocol if present
  let sanitized = raw.replace(/^https?:\/\//i, '');

  // Strip trailing slashes or subpaths
  const slashIdx = sanitized.indexOf('/');
  if (slashIdx !== -1) {
    sanitized = sanitized.slice(0, slashIdx);
  }

  if (sanitized.length === 0) {
    return { valid: false, cleanHost: '', url: '', error: 'Invalid device address format.' };
  }

  // Extract host and optional port
  let host = sanitized;
  let port: number | undefined;

  const colonIdx = sanitized.lastIndexOf(':');
  if (colonIdx !== -1) {
    const portStr = sanitized.slice(colonIdx + 1);
    const parsedPort = Number(portStr);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      return { valid: false, cleanHost: '', url: '', error: `Invalid port number: ${portStr}. Port must be an integer between 1 and 65535.` };
    }
    port = parsedPort;
    host = sanitized.slice(0, colonIdx);
  }

  // Check IPv4 format: e.g. 192.168.1.50
  const ipv4Parts = host.split('.');
  if (ipv4Parts.length === 4 && ipv4Parts.every((p) => /^\d+$/.test(p))) {
    const octets = ipv4Parts.map(Number);
    if (octets.some((n) => n < 0 || n > 255)) {
      return { valid: false, cleanHost: '', url: '', error: 'Invalid IPv4 address: octets must be between 0 and 255.' };
    }

    if (!isPrivateIpv4(octets)) {
      return {
        valid: false,
        cleanHost: '',
        url: '',
        error: `Address ${host} is a public or forbidden IP address. Only local network addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x) are permitted.`,
      };
    }

    const cleanHost = port ? `${host}:${port}` : host;
    const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
    return {
      valid: true,
      cleanHost,
      port,
      url: `http://${cleanHost}${cleanPath}`,
    };
  }

  // Check local mDNS hostname: e.g. airgradient.local, esp32-sensor.local, or localhost
  const isLocalhost = host.toLowerCase() === 'localhost';
  const localDomainRegex = /^[a-zA-Z0-9_\-]+\.local$/i;

  if (isLocalhost || localDomainRegex.test(host)) {
    const cleanHost = port ? `${host}:${port}` : host;
    const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
    return {
      valid: true,
      cleanHost,
      port,
      url: `http://${cleanHost}${cleanPath}`,
    };
  }

  return {
    valid: false,
    cleanHost: '',
    url: '',
    error: 'Invalid device address. Enter a private IPv4 address (e.g. 192.168.1.50) or .local hostname (e.g. airgradient.local).',
  };
}
