import {getAppEnv} from "@/lib/runtime/cloudflare.ts";
import {hash,expireCookie} from "@/lib/auth/oauth.ts";
import {originCheck} from "@/lib/auth/session.ts";
import {errorResponse} from "@/lib/http/api-error.ts";
export async function POST(request:Request){try{originCheck(request);const env=await getAppEnv();const raw=(request.headers.get("cookie")||"").split(";").map(v=>v.trim()).find(x=>x.startsWith("seo_session="))?.slice(12);if(raw)await env.DB.prepare("DELETE FROM app_sessions WHERE token_hash=?").bind(await hash(raw)).run();const headers=new Headers({"Location":"/","Cache-Control":"no-store"});headers.set("Set-Cookie",expireCookie("seo_session"));return new Response(null,{status:303,headers});}catch(e){return errorResponse(e)}}
