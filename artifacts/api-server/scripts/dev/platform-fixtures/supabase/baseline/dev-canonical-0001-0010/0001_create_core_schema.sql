CREATE SCHEMA IF NOT EXISTS core;
COMMENT ON SCHEMA core IS
'Imperial Compass Core Domain';

CREATE SCHEMA IF NOT EXISTS apps;
COMMENT ON SCHEMA apps IS
'Imperial Compass Application Domains';

CREATE SCHEMA IF NOT EXISTS platform;
COMMENT ON SCHEMA platform IS
'Imperial Compass Platform Domains';

CREATE SCHEMA IF NOT EXISTS audit;
COMMENT ON SCHEMA audit IS
'Imperial Compass Audit Domain';

CREATE SCHEMA IF NOT EXISTS system;
COMMENT ON SCHEMA system IS
'Imperial Compass System Domain';
