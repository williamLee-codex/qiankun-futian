-- Run only through a verified Farm DB read-only connection. Never export credentials.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database_name, current_schema() AS schema_name;
SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
       has_table_privilege(current_user,c.oid,'SELECT') AS can_select
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname IN ('farm_v2_player_state','farm_v2_land','farm_v2_mutation',
 'farm_v2_authorization_attempt','farm_v2_reconciliation_case','farm_v2_reconciliation_event',
 '__drizzle_migrations','schema_migrations');
SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_name LIKE 'farm_v2_%' ORDER BY table_schema,table_name,ordinal_position;
SELECT n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) AS definition
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname LIKE 'farm_v2_%';
SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE tablename LIKE 'farm_v2_%';
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE tablename LIKE 'farm_v2_%';
SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.table_privileges WHERE table_name LIKE 'farm_v2_%';
ROLLBACK;
