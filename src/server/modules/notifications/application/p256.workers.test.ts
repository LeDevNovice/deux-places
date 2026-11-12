import { describe, expect, it } from "vitest";
import { bytes, rfc8291 } from "../testing/web-push";
import { isP256PublicKey } from "./p256";

// Plan J1.14: the phone's p256dh is checked when it subscribes, not only when a message is sent
// (J1.13). RFC 8291 §3.1: an uncompressed point (SEC 1 §2.3.3: 0x04 ‖ X ‖ Y, 65 octets) on P-256.
// The reference is WebCrypto in workerd, which refuses a point off the curve (probe, J1.13).

const generatedPoint = async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  if (!("publicKey" in pair)) throw new TypeError("not a key pair");
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  if (!(raw instanceof ArrayBuffer)) throw new TypeError("not raw octets");
  return new Uint8Array(raw);
};

const hex = (digits: string) =>
  Uint8Array.from({ length: digits.length / 2 }, (_, i) =>
    Number.parseInt(digits.slice(2 * i, 2 * i + 2), 16),
  );

const webCryptoAccepts = (point: Uint8Array) =>
  crypto.subtle
    .importKey("raw", point, { name: "ECDH", namedCurve: "P-256" }, true, [])
    .then(
      () => true,
      () => false,
    );

describe("isP256PublicKey — an uncompressed point of P-256 (RFC 8291 §3.1)", () => {
  it("accepts the receiver key published in RFC 8291 §5", () => {
    expect(isP256PublicKey(bytes(rfc8291.receiver.publicKey))).toBe(true);
  });

  it("accepts the 200 points WebCrypto generates", async () => {
    const points = await Promise.all(
      Array.from({ length: 200 }, generatedPoint),
    );

    expect(points.filter((point) => !isP256PublicKey(point))).toStrictEqual([]);
  });

  it("refuses, as WebCrypto does, a point moved off the curve by one bit of Y", async () => {
    const moved = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const point = await generatedPoint();
        point[64] = (point[64] ?? 0) ^ 0x01;
        return point;
      }),
    );

    const accepted = await Promise.all(moved.map(webCryptoAccepts));

    expect(accepted).toStrictEqual(moved.map(() => false));
    expect(moved.map(isP256PublicKey)).toStrictEqual(moved.map(() => false));
  });

  it("refuses the same point compressed (0x02 or 0x03 ‖ X, 33 octets)", async () => {
    const point = await generatedPoint();
    const compressed = Uint8Array.of(
      0x02 + ((point[64] ?? 0) & 1),
      ...point.slice(1, 33),
    );

    expect(isP256PublicKey(compressed)).toBe(false);
  });

  it("refuses a point without its 0x04 prefix, or with another prefix", async () => {
    const point = await generatedPoint();

    expect(isP256PublicKey(point.slice(1))).toBe(false);
    expect(isP256PublicKey(Uint8Array.of(0x06, ...point.slice(1)))).toBe(false);
  });

  it("refuses 66 octets, and an empty key", async () => {
    const point = await generatedPoint();

    expect(isP256PublicKey(Uint8Array.of(...point, 0))).toBe(false);
    expect(isP256PublicKey(new Uint8Array())).toBe(false);
  });

  // SEC 1 §2.3.4: each coordinate must be an element of the field, below p. (0, Y0) is on the curve
  // (Y0² ≡ b, computed for this test); X = p is 0 modulo p but not a field element.
  it("refuses an X equal to the field prime p, whose point modulo p is on the curve", async () => {
    // SEC 2 v2 §2.4.2 (secp256r1): p = 2^256 − 2^224 + 2^192 + 2^96 − 1.
    const p = hex(
      "ffffffff00000001000000000000000000000000ffffffffffffffffffffffff",
    );
    const y0 = hex(
      "66485c780e2f83d72433bd5d84a06bb6541c2af31dae871728bf856a174f93f4",
    );
    const onCurve = Uint8Array.of(0x04, ...new Uint8Array(32), ...y0);
    const outOfField = Uint8Array.of(0x04, ...p, ...y0);

    expect(await webCryptoAccepts(onCurve)).toBe(true);
    expect(isP256PublicKey(onCurve)).toBe(true);
    expect(await webCryptoAccepts(outOfField)).toBe(false);
    expect(isP256PublicKey(outOfField)).toBe(false);
  });
});
