import {getAppEnv} from "@/lib/runtime/cloudflare.ts";
import {session} from "@/lib/auth/session.ts";
import {errorResponse} from "@/lib/http/api-error.ts";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{const env=await getAppEnv();const user=await session(request,env);return Response.json({success:true,user});}catch(e){return errorResponse(e)}}
