import { env } from "cloudflare:workers";
import { handleApi } from "../../../server/rooms.mjs";

export const dynamic = "force-dynamic";

function serve(request: Request) {
  const binding = env.DB;
  // Keep each poll and mutation on a consistent primary-backed D1 session.
  const DB = binding?.withSession ? binding.withSession("first-primary") : binding;
  return handleApi(request, { DB });
}

export const GET = serve;
export const POST = serve;
