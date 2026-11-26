begin;

create table if not exists platform.rpg_level_progression (
  level integer primary key,
  exp_to_next_level integer,
  cumulative_exp bigint not null,
  target_normal_battles integer,
  constraint rpg_level_progression_level_check check (level between 1 and 100),
  constraint rpg_level_progression_exp_check check (
    (level < 100 and exp_to_next_level > 0 and target_normal_battles > 0)
    or
    (level = 100 and exp_to_next_level is null and target_normal_battles is null)
  ),
  constraint rpg_level_progression_cumulative_check check (cumulative_exp >= 0)
);

insert into platform.rpg_level_progression (
  level,
  exp_to_next_level,
  cumulative_exp,
  target_normal_battles
) values
  (1, 50, 0, 5),
  (2, 100, 50, 5),
  (3, 180, 150, 6),
  (4, 240, 330, 6),
  (5, 350, 570, 7),
  (6, 420, 920, 7),
  (7, 560, 1340, 8),
  (8, 640, 1900, 8),
  (9, 810, 2540, 9),
  (10, 1000, 3350, 10),
  (11, 1320, 4350, 12),
  (12, 1560, 5670, 13),
  (13, 1820, 7230, 14),
  (14, 2100, 9050, 15),
  (15, 2400, 11150, 16),
  (16, 2720, 13550, 17),
  (17, 3060, 16270, 18),
  (18, 3420, 19330, 19),
  (19, 3800, 22750, 20),
  (20, 4000, 26550, 20),
  (21, 4410, 30550, 21),
  (22, 4840, 34960, 22),
  (23, 5290, 39800, 23),
  (24, 5760, 45090, 24),
  (25, 6250, 50850, 25),
  (26, 6760, 57100, 26),
  (27, 7290, 63860, 27),
  (28, 7840, 71150, 28),
  (29, 8410, 78990, 29),
  (30, 9000, 87400, 30),
  (31, 9610, 96400, 31),
  (32, 10240, 106010, 32),
  (33, 10890, 116250, 33),
  (34, 11560, 127140, 34),
  (35, 12250, 138700, 35),
  (36, 12960, 150950, 36),
  (37, 13690, 163910, 37),
  (38, 14440, 177600, 38),
  (39, 15210, 192040, 39),
  (40, 16000, 207250, 40),
  (41, 16810, 223250, 41),
  (42, 17640, 240060, 42),
  (43, 18490, 257700, 43),
  (44, 19360, 276190, 44),
  (45, 20250, 295550, 45),
  (46, 21160, 315800, 46),
  (47, 22090, 336960, 47),
  (48, 23040, 359050, 48),
  (49, 24010, 382090, 49),
  (50, 25000, 406100, 50),
  (51, 26010, 431100, 51),
  (52, 27040, 457110, 52),
  (53, 28090, 484150, 53),
  (54, 29160, 512240, 54),
  (55, 30250, 541400, 55),
  (56, 31360, 571650, 56),
  (57, 32490, 603010, 57),
  (58, 33640, 635500, 58),
  (59, 34810, 669140, 59),
  (60, 36000, 703950, 60),
  (61, 37210, 739950, 61),
  (62, 38440, 777160, 62),
  (63, 39690, 815600, 63),
  (64, 40960, 855290, 64),
  (65, 42250, 896250, 65),
  (66, 43560, 938500, 66),
  (67, 44890, 982060, 67),
  (68, 46240, 1026950, 68),
  (69, 47610, 1073190, 69),
  (70, 49000, 1120800, 70),
  (71, 50410, 1169800, 71),
  (72, 51840, 1220210, 72),
  (73, 53290, 1272050, 73),
  (74, 54760, 1325340, 74),
  (75, 56250, 1380100, 75),
  (76, 57760, 1436350, 76),
  (77, 59290, 1494110, 77),
  (78, 60840, 1553400, 78),
  (79, 62410, 1614240, 79),
  (80, 64000, 1676650, 80),
  (81, 65610, 1740650, 81),
  (82, 67240, 1806260, 82),
  (83, 68890, 1873500, 83),
  (84, 70560, 1942390, 84),
  (85, 72250, 2012950, 85),
  (86, 73960, 2085200, 86),
  (87, 75690, 2159160, 87),
  (88, 77440, 2234850, 88),
  (89, 79210, 2312290, 89),
  (90, 81000, 2391500, 90),
  (91, 82810, 2472500, 91),
  (92, 84640, 2555310, 92),
  (93, 86490, 2639950, 93),
  (94, 88360, 2726440, 94),
  (95, 90250, 2814800, 95),
  (96, 92160, 2905050, 96),
  (97, 94090, 2997210, 97),
  (98, 96040, 3091300, 98),
  (99, 98010, 3187340, 99),
  (100, NULL, 3285350, NULL)
on conflict (level) do update set
  exp_to_next_level = excluded.exp_to_next_level,
  cumulative_exp = excluded.cumulative_exp,
  target_normal_battles = excluded.target_normal_battles;

create or replace function platform.calculate_rpg_level_progression(
  p_level integer,
  p_experience bigint
)
returns table (
  level integer,
  experience bigint
)
language plpgsql
security definer
set search_path = platform, public
as $function$
declare
  v_level integer := p_level;
  v_experience bigint := p_experience;
  v_exp_to_next_level integer;
begin
  if v_level < 1 or v_level > 100 then
    raise exception 'Invalid RPG level: %', v_level;
  end if;

  if v_experience < 0 then
    raise exception 'Invalid RPG experience: %', v_experience;
  end if;

  while v_level < 100 loop
    select progression.exp_to_next_level
      into v_exp_to_next_level
      from platform.rpg_level_progression as progression
     where progression.level = v_level;

    if v_exp_to_next_level is null then
      raise exception 'Missing RPG progression threshold for level %', v_level;
    end if;

    if v_experience < v_exp_to_next_level then
      exit;
    end if;

    v_experience := v_experience - v_exp_to_next_level;
    v_level := v_level + 1;
  end loop;

  return query
  select v_level, v_experience;
end;
$function$;

revoke all on function platform.calculate_rpg_level_progression(integer, bigint) from public;
revoke all on function platform.calculate_rpg_level_progression(integer, bigint) from anon;
revoke all on function platform.calculate_rpg_level_progression(integer, bigint) from authenticated;

comment on table platform.rpg_level_progression is
  'Versioned Lv1-Lv100 RPG progression runtime copied from the RPG Master Data Levels sheet.';

comment on function platform.calculate_rpg_level_progression(integer, bigint) is
  'Internal RPG level calculator. Call only from trusted server-side settlement boundaries; do not expose arbitrary EXP awards to clients.';

commit;
