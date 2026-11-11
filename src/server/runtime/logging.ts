import { Logger } from "effect";

/**
 * Effect's logs as one JSON line each on the console, which Workers Logs collects (technique-v2
 * §12.1); it replaces the default logger. A Layer is only a description: whoever provides it
 * builds it, once per isolate or object, never per request.
 */
export const jsonLogs = Logger.layer([Logger.consoleJson]);
