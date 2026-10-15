import test from "node:test";
import assert from "node:assert/strict";
import type {AppEnv} from "../lib/db/d1.ts";
import {encrypt,decrypt,config,nonce,hash} from "../lib/auth/oauth.ts";
import {isAdmin} from "../lib/auth/session.ts";
test("AES-GCM refresh token encryption works and rejects tampering",async()=>{
 const env={TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString("base64")} as AppEnv;
 const encrypted=await encrypt("fake-refresh-token",env);
 assert.notEqual(encrypted,"fake-refresh-token");
 assert.equal(await decrypt(encrypted,env),"fake-refresh-token");
 await assert.rejects(decrypt(encrypted.slice(0,-2)+"zz",env));
});
test("oauth redirect URL is pinned to the exact callback and HTTPS",()=>{
 const env={GOOGLE_OAUTH_CLIENT_ID:"id",GOOGLE_OAUTH_CLIENT_SECRET:"secret",GOOGLE_OAUTH_REDIRECT_URI:"https://seo.example.com/api/auth/google/callback"} as AppEnv;
 assert.equal(config(env).redirect,env.GOOGLE_OAUTH_REDIRECT_URI);
 assert.throws(()=>config({...env,GOOGLE_OAUTH_REDIRECT_URI:"http://seo.example.com/api/auth/google/callback"}));
 assert.throws(()=>config({...env,GOOGLE_OAUTH_REDIRECT_URI:"https://seo.example.com/redirect"}));
});
test("admin email list is precise, not partial",()=>{
 const env={ADMIN_EMAILS:"admin@example.com, owner@example.com"} as AppEnv;
 assert.equal(isAdmin(env,"OWNER@example.com"),true);
 assert.equal(isAdmin(env,"notadmin@example.com"),false);
});
test("generated CSRF nonce is random and hashes are stable",async()=>{
 const a=nonce(),b=nonce();
 assert.notEqual(a,b);
 assert.equal(await hash(a),await hash(a));
 assert.notEqual(await hash(a),await hash(b));
});
