// Temporary Preview-only, read-only connectivity acceptance. Never merge to production.
const SQL=`SELECT current_user AS role,
 (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,
 current_setting('statement_timeout')='15s' AS statement_timeout,
 current_setting('lock_timeout')='3s' AS lock_timeout,
 current_setting('idle_in_transaction_session_timeout')='8s' AS idle_timeout,
 (SELECT bool_and(has_table_privilege(current_user,t,p)) FROM
 unnest(ARRAY['public.farm_v2_player_state','public.farm_v2_land','public.farm_v2_mutation','public.farm_v2_authorization_attempt']) t
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE']) p) AS game_permissions,
 has_function_privilege(current_user,'public.farm_v2_apply_atomic_pot_wallet(uuid,uuid,text,jsonb,text)','EXECUTE') AS atomic_rpc,
 has_function_privilege(current_user,'public.farm_v2_inspect_recovery(uuid,text)','EXECUTE') AS inspect_rpc,
 has_function_privilege(current_user,'public.farm_v2_observe_recovery(uuid,text)','EXECUTE') AS observe_rpc,
 NOT(has_table_privilege(current_user,'public.core_wallets','INSERT,UPDATE,DELETE') OR
 has_table_privilege(current_user,'public.core_wallet_ledger','INSERT,UPDATE,DELETE')) AS core_writes_denied`;
export function createHandler(env,connect){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  let url;try{url=new URL(env.DATABASE_URL)}catch{}
  if(env.VERCEL_ENV!=='preview'||env.FARM_V2_ENTRY_ENABLED!=='0'||env.FARM_V2_ATOMIC_POT_ENABLED!=='0'||env.FARM_DB_CONNECTION_MODE!=='session'||!url||url.hostname!=='aws-0-ap-southeast-1.pooler.supabase.com'||url.port!=='5432'||url.username!=='farm_v2_runtime.ijguwqserwiufpxizgzy'||url.pathname!=='/postgres')return res.status(404).json({status:'disabled'});
  if(req.method!=='GET')return res.status(405).json({status:'method_not_allowed'});
  let client;
  try{
   url.search='';
   client=await connect({connectionString:url.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:5000,query_timeout:10000,application_name:'farm_isolated_acceptance',options:'-c statement_timeout=15000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=8000'});
   const {rows:[row]}=await client.query(SQL);
   const checks={...row,role:row.role==='farm_v2_runtime'};
   const passed=Object.values(checks).every(v=>v===true);
   return res.status(passed?200:503).json({status:passed?'pass':'not_ready',checks});
  }catch(error){
   const codes=['SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID','28P01','28000','53300','42501','ETIMEDOUT','ECONNREFUSED','ENOTFOUND','ERR_MODULE_NOT_FOUND'];
   console.error('FARM_ISOLATED_CONNECTION_CHECK_FAILED',codes.includes(error?.code)?error.code:'UNKNOWN');
   return res.status(503).json({status:'not_ready'});
  }
  finally{if(client)await client.end().catch(()=>{});}
 };
}
export default createHandler(process.env,async config=>{
 const {default:pg}=await import('../lib/db/node_modules/pg/lib/index.js');
 const client=new pg.Client(config);await client.connect();return client;
});
