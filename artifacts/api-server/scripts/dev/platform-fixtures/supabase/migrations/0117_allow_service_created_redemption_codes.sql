begin;

alter table platform.redemption_codes
  alter column created_by drop not null;

commit;
