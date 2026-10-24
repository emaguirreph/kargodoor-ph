// Worker entry: the OpenNext worker plus the runtime's EmailMessage class,
// which app code cannot import directly through the Next.js build.
import { EmailMessage } from "cloudflare:email";
import handler from "./.open-next/worker.js";

(globalThis as { __kdEmailMessage?: unknown }).__kdEmailMessage = EmailMessage;

export default handler;

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
