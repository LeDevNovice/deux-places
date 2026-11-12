import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  PushPayloadTooLarge,
  PushSubscriptionInvalid,
} from "../application/push-sender";
import {
  bytes,
  decrypt,
  header,
  jwk,
  randomEcdhPair,
  rawPublicKey,
  rfc8291,
} from "../testing/web-push";
import { encrypt } from "./aes128gcm";

// The RFC's application server key pair, imported as the ECDH pair the adapter would generate.
const rfcSender = async (): Promise<CryptoKeyPair> => ({
  privateKey: await crypto.subtle.importKey(
    "jwk",
    jwk(rfc8291.sender.publicKey, rfc8291.sender.privateKey),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  ),
  publicKey: await crypto.subtle.importKey(
    "raw",
    bytes(rfc8291.sender.publicKey),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  ),
});

const encryptWith = async (plaintext: Uint8Array, salt: string) =>
  Effect.runPromise(
    encrypt({
      plaintext,
      receiver: {
        publicKey: bytes(rfc8291.receiver.publicKey),
        authSecret: bytes(rfc8291.authSecret),
      },
      sender: await rfcSender(),
      salt: bytes(salt),
    }),
  );

const receiver = {
  publicKey: rfc8291.receiver.publicKey,
  privateKey: rfc8291.receiver.privateKey,
  authSecret: rfc8291.authSecret,
};

const failureOf = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.flip(effect));

describe("aes128gcm encryption of a push message (RFC 8291, RFC 8188)", () => {
  it("encrypts the example of RFC 8291 §5 to the same 144 octets", async () => {
    const body = await encryptWith(rfc8291.plaintext, rfc8291.salt);

    expect(body).toStrictEqual(bytes(rfc8291.body));
    expect(body.length).toBe(144);
  });

  it("is decrypted by the phone's private key, from a random sender key and salt", async () => {
    const sender = await randomEcdhPair();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const plaintext = new TextEncoder().encode('{"title":"On continue ?"}');

    const body = await Effect.runPromise(
      encrypt({
        plaintext,
        receiver: {
          publicKey: bytes(receiver.publicKey),
          authSecret: bytes(receiver.authSecret),
        },
        sender,
        salt,
      }),
    );

    // One record of rs = 4096 (RFC 8291 §4), keyid = the sender's 65-octet uncompressed point.
    const parsed = header(body);
    expect(parsed.salt).toStrictEqual(salt);
    expect(parsed.rs).toBe(4096);
    expect(parsed.idlen).toBe(65);
    expect(parsed.keyid).toStrictEqual(await rawPublicKey(sender.publicKey));
    expect(await decrypt(body, receiver)).toStrictEqual(plaintext);
  });

  it("fits 3,993 octets of plaintext in a 4,096-octet body (RFC 8291 §4)", async () => {
    const plaintext = new Uint8Array(3993).fill(0x61);

    const body = await encryptWith(plaintext, rfc8291.salt);

    expect(body.length).toBe(4096);
    expect(await decrypt(body, receiver)).toStrictEqual(plaintext);
  });

  it("refuses 3,994 octets of plaintext before encrypting", async () => {
    const error = await failureOf(
      encrypt({
        plaintext: new Uint8Array(3994),
        receiver: {
          publicKey: bytes(receiver.publicKey),
          authSecret: bytes(receiver.authSecret),
        },
        sender: await randomEcdhPair(),
        salt: bytes(rfc8291.salt),
      }),
    );

    expect(error).toBeInstanceOf(PushPayloadTooLarge);
  });

  const offCurve = bytes(receiver.publicKey);
  offCurve[64] = (offCurve[64] ?? 0) ^ 0x01;
  const compressed = Uint8Array.of(
    0x03,
    ...bytes(receiver.publicKey).slice(1, 33),
  );
  it.each([
    ["a point off the P-256 curve", offCurve, bytes(receiver.authSecret)],
    ["a compressed point", compressed, bytes(receiver.authSecret)],
    [
      "an authentication secret of 15 octets",
      bytes(receiver.publicKey),
      bytes(receiver.authSecret).slice(0, 15),
    ],
  ])(
    "refuses a subscription with %s (RFC 8291 §3.2, §4, §7)",
    async (_case, publicKey, authSecret) => {
      const error = await failureOf(
        encrypt({
          plaintext: rfc8291.plaintext,
          receiver: { publicKey, authSecret },
          sender: await randomEcdhPair(),
          salt: bytes(rfc8291.salt),
        }),
      );

      expect(error).toBeInstanceOf(PushSubscriptionInvalid);
    },
  );
});
