// RFC 9457 problem, type from technique-v2 §6.2. No `instance` until requests carry a trace id.
const notFoundProblem = JSON.stringify({
  type: "/problems/not-found",
  title: "Not Found",
  status: 404,
});

export default {
  fetch(): Response {
    return new Response(notFoundProblem, {
      status: 404,
      headers: { "Content-Type": "application/problem+json" },
    });
  },
} satisfies ExportedHandler;
