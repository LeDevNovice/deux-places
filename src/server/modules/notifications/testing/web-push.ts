// Test support for Web Push: published test vectors and the user agent's side of RFC 8291, written
// from the RFC text, so that tests check what we send without trusting our own encryption code.
import { Result } from "effect";
import { Base64Url } from "effect/encoding";

/** Decodes base64url (RFC 4648 §5), ignoring the whitespace the RFCs use to wrap long values. */
export const bytes = (base64url: string) =>
  Result.getOrThrow(Base64Url.decode(base64url.replace(/\s/g, "")));

export const text = (value: string) => new TextEncoder().encode(value);

// RFC 8291 §5 and Appendix A. Published test values, never real keys.
export const rfc8291 = {
  plaintext: text("When I grow up, I want to be a watermelon"),
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg", // gitleaks:allow (RFC 8291 §5)
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  receiver: {
    privateKey: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94", // gitleaks:allow (RFC 8291 §5)
    publicKey:
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  },
  sender: {
    privateKey: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", // gitleaks:allow (RFC 8291 §5)
    publicKey:
      "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  },
  // The encrypted body of §5, unwrapped (144 octets: erratum 5230 corrects its Content-Length).
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
} as const;

/** A P-256 key as a JWK, from its uncompressed public point and, for a private key, its `d`. */
export const jwk = (publicKey: string, privateKey?: string): JsonWebKey => {
  const point = bytes(publicKey);
  return {
    kty: "EC",
    crv: "P-256",
    x: Base64Url.encode(point.slice(1, 33)),
    y: Base64Url.encode(point.slice(33, 65)),
    ...(privateKey === undefined ? {} : { d: privateKey }),
  };
};

const subtle = () => crypto.subtle;

const hkdf = async (
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  octets: number,
) =>
  new Uint8Array(
    await subtle().deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info },
      await subtle().importKey("raw", ikm, "HKDF", false, ["deriveBits"]),
      octets * 8,
    ),
  );

/** The parameters of an `aes128gcm` content-coding header (RFC 8188 §2.1). */
export const header = (body: Uint8Array) => {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const idlen = body[20] ?? 0;
  return {
    salt: body.slice(0, 16),
    rs: view.getUint32(16),
    idlen,
    keyid: body.slice(21, 21 + idlen),
    record: body.slice(21 + idlen),
  };
};

/**
 * What a user agent does on receipt (RFC 8291 §3.4, RFC 8188 §2): ECDH with the server's key from
 * `keyid`, HKDF, AES-GCM, then removal of the padding delimiter, which must be 0x02 (§4).
 */
export const decrypt = async (
  body: Uint8Array,
  receiver: { publicKey: string; privateKey: string; authSecret: string },
) => {
  const { salt, keyid, record } = header(body);
  const uaPrivate = await subtle().importKey(
    "jwk",
    jwk(receiver.publicKey, receiver.privateKey),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const asPublic = await subtle().importKey(
    "raw",
    keyid,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  // The standard parameter is `public`; worker-configuration.d.ts names it `$public` (see J1.13).
  const ecdh = { name: "ECDH", public: asPublic };
  const ecdhSecret = new Uint8Array(
    await subtle().deriveBits(ecdh, uaPrivate, 256),
  );
  const keyInfo = new Uint8Array([
    ...text("WebPush: info\0"),
    ...bytes(receiver.publicKey),
    ...keyid,
  ]);
  const ikm = await hkdf(ecdhSecret, bytes(receiver.authSecret), keyInfo, 32);
  const cek = await hkdf(ikm, salt, text("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, text("Content-Encoding: nonce\0"), 12);
  const padded = new Uint8Array(
    await subtle().decrypt(
      { name: "AES-GCM", iv: nonce },
      await subtle().importKey("raw", cek, "AES-GCM", false, ["decrypt"]),
      record,
    ),
  );
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  if (padded[end] !== 2)
    throw new Error(`padding delimiter is ${padded[end]}, not 2`);
  return padded.slice(0, end);
};

/** A random ECDH P-256 pair, like the one the adapter draws for each message. */
export const randomEcdhPair = async () => {
  const generated = await subtle().generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  if (!("privateKey" in generated)) throw new TypeError("not a key pair");
  return generated;
};

/** The uncompressed point of a public key. */
export const rawPublicKey = async (key: CryptoKey) => {
  const raw = await subtle().exportKey("raw", key);
  if (!(raw instanceof ArrayBuffer)) throw new TypeError("not raw octets");
  return new Uint8Array(raw);
};
