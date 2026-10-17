import {getAppEnv} from "@/lib/runtime/cloudflare.ts";
import {session} from "@/lib/auth/session.ts";
import {googleAccessToken} from "@/lib/auth/oauth.ts";
import {errorResponse} from "@/lib/http/api-error.ts";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{const env=await getAppEnv();const user=await session(request,env);const token=await googleAccessToken(env,user.id);const response=await fetch("https://www.googleapis.com/webmasters/v3/sites",{headers:{Authorization:"Bearer "+token},cache:"no-store"});if(!response.ok)throw new Error("Could not list Google Search Console sites");const data=await response.json() as {siteEntry?:Array<{siteUrl:string;permissionLevel:string}>};return Response.json({success:true,properties:(data.siteEntry||[]).filter(x=>x.permissionLevel!=="siteUnverifiedUser")});}catch(e){return errorResponse(e)}}
