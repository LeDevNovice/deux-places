/**
 * The text of a push message, read by the service worker (RFC 8291: at most 3,993 octets). It
 * names what to show, never personal data: the phone writes the words (src/web/messages.ts).
 */
export interface PushPayload {
  readonly type: "test";
}

/** The development page's test notification (plan J1.14). */
export const testPushPayload: PushPayload = { type: "test" };
