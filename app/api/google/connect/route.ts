import {getAppEnv} from "@/lib/runtime/cloudflare.ts";
import {session} from "@/lib/auth/session.ts";
import {nonce,hash,cookie,config} from "@/lib/auth/oauth.ts";
import {errorResponse} from "@/lib/http/api-error.ts";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{const env=await getAppEnv();await session(request,env);const cfg=config(env);const state=nonce(),verifier=nonce(48);const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");for(const [k,v] of Object.entries({client_id:cfg.id,redirect_uri:cfg.redirect.replace("/api/auth/google/callback","/api/google/callback"),response_type:"code",scope:"https://www.googleapis.com/auth/webmasters.readonly",state,code_challenge:await hash(verifier),code_challenge_method:"S256",access_type:"offline",prompt:"consent select_account",include_granted_scopes:"false"}))url.searchParams.set(k,v);const headers=new Headers({Location:url.toString(),"Cache-Control":"no-store"});headers.append("Set-Cookie",cookie("seo_gsc_state",state,600));headers.append("Set-Cookie",cookie("seo_gsc_verifier",verifier,600));return new Response(null,{status:302,headers});}catch(e){return errorResponse(e)}}
