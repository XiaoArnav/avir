/**
 * Avir Request Size Limiter & Bounded Stream Reader
 * Step 22: Request Size Limits & Memory Exhaustion Prevention
 * 
 * Enforces strict byte ceilings (e.g. 100 KB max) before JSON parsing,
 * defending against Denial of Service and heap memory exhaustion attacks.
 */

import { NextRequest } from 'next/server';

export const DEFAULT_MAX_BODY_BYTES = 100 * 1024; // 100 KB

export interface BoundedReadResult<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  errorCode?: 'PAYLOAD_TOO_LARGE' | 'INVALID_JSON' | 'EMPTY_BODY';
  errorMessage?: string;
  bytesRead: number;
}

/**
 * Safely reads and parses JSON from a NextRequest within strict size limits.
 */
export async function readBoundedJson<T = Record<string, unknown>>(
  req: NextRequest,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<BoundedReadResult<T>> {
  // 1. Fast-path check: Content-Length header check
  const contentLength = req.headers.get('content-length');
  if (contentLength) {
    const parsedLength = parseInt(contentLength, 10);
    if (!isNaN(parsedLength) && parsedLength > maxBytes) {
      return {
        success: false,
        errorCode: 'PAYLOAD_TOO_LARGE',
        errorMessage: `Payload size (${parsedLength} bytes) exceeds maximum limit of ${maxBytes} bytes.`,
        bytesRead: parsedLength,
      };
    }
  }

  // 2. Stream-based bounded read (defends against absent/spoofed Content-Length)
  try {
    if (req.body) {
      const reader = req.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            // Cancel stream reader immediately to free network buffers
            await reader.cancel('Payload size exceeded limit');
            return {
              success: false,
              errorCode: 'PAYLOAD_TOO_LARGE',
              errorMessage: `Payload stream exceeded maximum allowed limit of ${maxBytes} bytes.`,
              bytesRead: totalBytes,
            };
          }
          chunks.push(value);
        }
      }

      if (totalBytes === 0) {
        return {
          success: false,
          errorCode: 'EMPTY_BODY',
          errorMessage: 'Request body cannot be empty.',
          bytesRead: 0,
        };
      }

      // Concatenate and decode
      const totalBuffer = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        totalBuffer.set(chunk, offset);
        offset += chunk.byteLength;
      }

      const decodedText = new TextDecoder('utf-8').decode(totalBuffer);
      const parsed = JSON.parse(decodedText);

      return {
        success: true,
        data: parsed as T,
        bytesRead: totalBytes,
      };
    } else {
      // Fallback for mocked test environments where req.body might not be a ReadableStream
      const rawText = await req.text();
      const bytes = new TextEncoder().encode(rawText).byteLength;

      if (bytes > maxBytes) {
        return {
          success: false,
          errorCode: 'PAYLOAD_TOO_LARGE',
          errorMessage: `Payload size (${bytes} bytes) exceeds limit of ${maxBytes} bytes.`,
          bytesRead: bytes,
        };
      }

      if (!rawText.trim()) {
        return {
          success: false,
          errorCode: 'EMPTY_BODY',
          errorMessage: 'Request body cannot be empty.',
          bytesRead: 0,
        };
      }

      const parsed = JSON.parse(rawText);
      return {
        success: true,
        data: parsed as T,
        bytesRead: bytes,
      };
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'SyntaxError') {
      return {
        success: false,
        errorCode: 'INVALID_JSON',
        errorMessage: 'Malformed JSON payload.',
        bytesRead: 0,
      };
    }
    return {
      success: false,
      errorCode: 'INVALID_JSON',
      errorMessage: err instanceof Error && err.message ? err.message : 'Failed to read request body.',
      bytesRead: 0,
    };
  }
}
