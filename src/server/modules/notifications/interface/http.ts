import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { Api, PushPublicKey, Validation } from "../../../../contracts/api";
import {
  ApplicationServerKey,
  registerPushSubscription,
} from "../application/push-subscriptions";
import { scheduleTestNotification } from "../application/test-notification";

/** The `notifications` group of the contract (technique-v2 §6.1): decode → use case → errors. */
export const httpGroup = HttpApiBuilder.group(
  Api,
  "notifications",
  (handlers) =>
    handlers
      .handle("publicKey", () =>
        Effect.gen(function* () {
          const { publicKey } = yield* ApplicationServerKey;
          return new PushPublicKey({ publicKey });
        }),
      )
      .handle("subscribe", ({ payload }) =>
        registerPushSubscription(payload).pipe(
          // §6.2: an input the server refuses is the `validation` problem.
          Effect.catchTag("PushSubscriptionRefused", () =>
            Effect.fail(new Validation()),
          ),
        ),
      )
      .handle("testNotification", () => scheduleTestNotification()),
);
