BEGIN;
CREATE TABLE platform.rpg_item_master (
 item_key text PRIMARY KEY CHECK (char_length(btrim(item_key)) BETWEEN 1 AND 128),
 item_type text NOT NULL CHECK (item_type='MATERIAL'),
 display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 64),
 grade text NOT NULL CHECK (grade IN ('凡材','靈材','玄材','地材','天材')),
 gathering_skill text CHECK (gathering_skill IN ('HERBALISM','MINING','LOGGING')),
 gathering_tier integer CHECK (gathering_tier BETWEEN 1 AND 10),
 uses jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(uses)='array'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((gathering_skill IS NULL) = (gathering_tier IS NULL))
);
ALTER TABLE platform.rpg_item_master ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE platform.rpg_item_master FROM anon,authenticated;
INSERT INTO platform.rpg_item_master(item_key,item_type,display_name,grade,gathering_skill,gathering_tier,uses)
SELECT * FROM (VALUES
('life.herb.t01','MATERIAL','玄青草','凡材','HERBALISM',1,'["煉丹"]'::jsonb),
('life.herb.t02','MATERIAL','凝露花','凡材','HERBALISM',2,'["煉丹"]'::jsonb),
('life.herb.t03','MATERIAL','赤陽葉','凡材','HERBALISM',3,'["煉丹"]'::jsonb),
('life.herb.t04','MATERIAL','月影藤','靈材','HERBALISM',4,'["煉丹"]'::jsonb),
('life.herb.t05','MATERIAL','紫靈參','靈材','HERBALISM',5,'["煉丹"]'::jsonb),
('life.herb.t06','MATERIAL','青木芝','靈材','HERBALISM',6,'["煉丹","任務"]'::jsonb),
('life.herb.t07','MATERIAL','九節靈竹','玄材','HERBALISM',7,'["煉丹"]'::jsonb),
('life.herb.t08','MATERIAL','天星草','玄材','HERBALISM',8,'["煉丹","任務"]'::jsonb),
('life.herb.t09','MATERIAL','玄冰蓮','地材','HERBALISM',9,'["煉丹"]'::jsonb),
('life.herb.t10','MATERIAL','九轉仙藤','天材','HERBALISM',10,'["煉丹","任務"]'::jsonb),
('life.ore.t01','MATERIAL','赤鐵礦','凡材','MINING',1,'["鍛造"]'::jsonb),
('life.ore.t02','MATERIAL','青銅靈礦','凡材','MINING',2,'["鍛造"]'::jsonb),
('life.ore.t03','MATERIAL','寒鐵礦','凡材','MINING',3,'["鍛造"]'::jsonb),
('life.ore.t04','MATERIAL','紫晶礦','靈材','MINING',4,'["鍛造"]'::jsonb),
('life.ore.t05','MATERIAL','玄鋼礦','靈材','MINING',5,'["鍛造"]'::jsonb),
('life.ore.t06','MATERIAL','星紋鐵','靈材','MINING',6,'["鍛造","任務"]'::jsonb),
('life.ore.t07','MATERIAL','天外玄鐵','玄材','MINING',7,'["鍛造"]'::jsonb),
('life.ore.t08','MATERIAL','九曜晶礦','玄材','MINING',8,'["鍛造","任務"]'::jsonb),
('life.ore.t09','MATERIAL','太虛靈晶','地材','MINING',9,'["鍛造"]'::jsonb),
('life.ore.t10','MATERIAL','混沌玄晶','天材','MINING',10,'["鍛造","任務"]'::jsonb),
('life.wood.t01','MATERIAL','青木','凡材','LOGGING',1,'["鍛造","任務"]'::jsonb),
('life.wood.t02','MATERIAL','赤松靈木','凡材','LOGGING',2,'["鍛造"]'::jsonb),
('life.wood.t03','MATERIAL','鐵杉木','凡材','LOGGING',3,'["鍛造"]'::jsonb),
('life.wood.t04','MATERIAL','紫檀靈木','靈材','LOGGING',4,'["鍛造"]'::jsonb),
('life.wood.t05','MATERIAL','玄雷木','靈材','LOGGING',5,'["鍛造"]'::jsonb),
('life.wood.t06','MATERIAL','星月神木','靈材','LOGGING',6,'["鍛造","任務"]'::jsonb),
('life.wood.t07','MATERIAL','天青古木','玄材','LOGGING',7,'["鍛造"]'::jsonb),
('life.wood.t08','MATERIAL','九霄雷木','玄材','LOGGING',8,'["鍛造","任務"]'::jsonb),
('life.wood.t09','MATERIAL','太初神木','地材','LOGGING',9,'["鍛造"]'::jsonb),
('life.wood.t10','MATERIAL','建木神枝','天材','LOGGING',10,'["鍛造","任務"]'::jsonb)
) v(item_key,item_type,display_name,grade,gathering_skill,gathering_tier,uses);
COMMIT;