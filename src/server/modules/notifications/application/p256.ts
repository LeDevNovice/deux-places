// The curve P-256 (secp256r1), SEC 2 v2 §2.4.2: y² = x³ − 3x + b over the prime field of p.
const p = 2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n;
const b = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;

const toBigInt = (octets: Uint8Array) =>
  octets.reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);

/**
 * Whether `octets` is a P-256 public key as RFC 8291 §3.1 requires it: an uncompressed point
 * (SEC 1 §2.3.3: 0x04 ‖ X ‖ Y, 65 octets) whose coordinates are field elements (below p) and
 * satisfy the curve equation (SEC 1 §3.2.2.1). The point at infinity has no such encoding.
 */
export const isP256PublicKey = (octets: Uint8Array): boolean => {
  if (octets.length !== 65 || octets[0] !== 0x04) return false;
  const x = toBigInt(octets.subarray(1, 33));
  const y = toBigInt(octets.subarray(33, 65));
  if (x >= p || y >= p) return false;
  return (y * y - (x * x * x - 3n * x + b)) % p === 0n;
};
