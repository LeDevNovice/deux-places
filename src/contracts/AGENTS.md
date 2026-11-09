# AGENTS.md — src/contracts

The single `HttpApi` definition shared by server and PWA, plus live-event schemas. Spec:
technique-v2 §6. Changing a schema here changes both sides at compile time.

- Prefix `/api/v1`; one `HttpApiGroup` per context; commands are explicit `POST` sub-resources.
- Response classes with `Schema.Class`, inputs with `Schema.Struct`, branded ids from the kernel.
- Every endpoint declares its errors (`Schema.TaggedErrorClass` + status); problem types follow
  technique-v2 §6.2 exactly — a new type needs a line in that table first (ask the human).
- Never remove or narrow a field already deployed: a cached PWA may still call it. Add, migrate,
  then remove after a service-worker update cycle (ask the human before any removal).
- Live events are a `Schema` union with a sequence number; payloads stay minimal and never carry
  a hidden rating, taste seeds or equity.
