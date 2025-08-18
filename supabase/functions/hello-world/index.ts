import { createSuccessResponse, handleRequest } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  return await handleRequest(req, async (req, _user, _supabaseClient) => {
    const { name } = await req.json();
    const data = {
      message: `Hello ${name}!`,
    };
    return createSuccessResponse(data);
  });
});