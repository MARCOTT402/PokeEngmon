-- ============================================================
-- Migration 20261026：Gen 2-5 世代擴充（v127）
--
-- 1. chain_rarity 加 gen 欄（舊 Gen 1 rows default 1）
-- 2. 插入 Gen 2-5 共 299 條鏈（由 tools/gen_chain_sql.py 生成）
-- 3. max_unlocked_gen(uid) helper：逐代檢查該代全鏈齊先開下代
-- 4. gacha_pull 加 p_gen：池 filter gen + server 端解鎖驗證
--    （舊簽名 gacha_pull(numeric) 必須 drop，否則 default 參數
--      會同新簽名撞 overload → PostgREST 300 ambiguous）
-- 5. obtain_capture 放寬 dex 上限 151 → 649 + gen 解鎖驗證
-- ============================================================

alter table chain_rarity add column if not exists gen int not null default 1;

insert into chain_rarity (chain_key, rarity, stage1_dex, gen) values
  ('chikorita','rare',152,2),
  ('cyndaquil','rare',155,2),
  ('totodile','rare',158,2),
  ('sentret','normal',161,2),
  ('hoothoot','normal',163,2),
  ('ledyba','normal',165,2),
  ('spinarak','normal',167,2),
  ('crobat','rare',169,2),
  ('chinchou','normal',170,2),
  ('pichu','normal',172,2),
  ('cleffa','normal',173,2),
  ('igglybuff','normal',174,2),
  ('togepi','normal',175,2),
  ('natu','normal',177,2),
  ('mareep','rare',179,2),
  ('bellossom','normal',182,2),
  ('marill','normal',183,2),
  ('sudowoodo','normal',185,2),
  ('politoed','rare',186,2),
  ('hoppip','normal',187,2),
  ('aipom','normal',190,2),
  ('sunkern','normal',191,2),
  ('yanma','normal',193,2),
  ('wooper','normal',194,2),
  ('espeon','rare',196,2),
  ('umbreon','rare',197,2),
  ('murkrow','normal',198,2),
  ('slowking','normal',199,2),
  ('misdreavus','normal',200,2),
  ('unown','normal',201,2),
  ('wobbuffet','normal',202,2),
  ('girafarig','normal',203,2),
  ('pineco','normal',204,2),
  ('dunsparce','normal',206,2),
  ('gligar','normal',207,2),
  ('steelix','rare',208,2),
  ('snubbull','normal',209,2),
  ('qwilfish','normal',211,2),
  ('scizor','rare',212,2),
  ('shuckle','rare',213,2),
  ('heracross','rare',214,2),
  ('sneasel','normal',215,2),
  ('teddiursa','rare',216,2),
  ('slugma','normal',218,2),
  ('swinub','normal',220,2),
  ('corsola','normal',222,2),
  ('remoraid','normal',223,2),
  ('delibird','normal',225,2),
  ('mantine','normal',226,2),
  ('skarmory','normal',227,2),
  ('houndour','rare',228,2),
  ('kingdra','rare',230,2),
  ('phanpy','rare',231,2),
  ('porygon','rare',233,2),
  ('stantler','normal',234,2),
  ('smeargle','normal',235,2),
  ('tyrogue','normal',236,2),
  ('smoochum','normal',238,2),
  ('elekid','normal',239,2),
  ('magby','normal',240,2),
  ('miltank','normal',241,2),
  ('blissey','rare',242,2),
  ('raikou','legend',243,2),
  ('entei','legend',244,2),
  ('suicune','legend',245,2),
  ('larvitar','epic',246,2),
  ('lugia','legend',249,2),
  ('hooh','legend',250,2),
  ('celebi','legend',251,2),
  ('treecko','rare',252,3),
  ('torchic','rare',255,3),
  ('mudkip','rare',258,3),
  ('poochyena','normal',261,3),
  ('zigzagoon','normal',263,3),
  ('wurmple','normal',265,3),
  ('lotad','normal',270,3),
  ('seedot','normal',273,3),
  ('taillow','normal',276,3),
  ('wingull','normal',278,3),
  ('ralts','rare',280,3),
  ('surskit','normal',283,3),
  ('shroomish','normal',285,3),
  ('slakoth','epic',287,3),
  ('nincada','normal',290,3),
  ('whismur','normal',293,3),
  ('makuhita','normal',296,3),
  ('azurill','normal',298,3),
  ('nosepass','normal',299,3),
  ('skitty','normal',300,3),
  ('sableye','normal',302,3),
  ('mawile','normal',303,3),
  ('aron','rare',304,3),
  ('meditite','normal',307,3),
  ('electrike','normal',309,3),
  ('plusle','normal',311,3),
  ('minun','normal',312,3),
  ('volbeat','normal',313,3),
  ('illumise','normal',314,3),
  ('roselia','normal',315,3),
  ('gulpin','normal',316,3),
  ('carvanha','normal',318,3),
  ('wailmer','rare',320,3),
  ('numel','normal',322,3),
  ('torkoal','normal',324,3),
  ('spoink','normal',325,3),
  ('spinda','normal',327,3),
  ('trapinch','rare',328,3),
  ('cacnea','normal',331,3),
  ('swablu','normal',333,3),
  ('zangoose','normal',335,3),
  ('seviper','normal',336,3),
  ('lunatone','normal',337,3),
  ('solrock','normal',338,3),
  ('barboach','normal',339,3),
  ('corphish','normal',341,3),
  ('baltoy','rare',343,3),
  ('lileep','normal',345,3),
  ('anorith','normal',347,3),
  ('feebas','rare',349,3),
  ('castform','normal',351,3),
  ('kecleon','normal',352,3),
  ('shuppet','normal',353,3),
  ('duskull','normal',355,3),
  ('tropius','normal',357,3),
  ('chimecho','normal',358,3),
  ('absol','normal',359,3),
  ('wynaut','normal',360,3),
  ('snorunt','normal',361,3),
  ('spheal','rare',363,3),
  ('clamperl','normal',366,3),
  ('relicanth','normal',369,3),
  ('luvdisc','normal',370,3),
  ('bagon','epic',371,3),
  ('beldum','epic',374,3),
  ('regirock','legend',377,3),
  ('regice','legend',378,3),
  ('registeel','legend',379,3),
  ('latias','legend',380,3),
  ('latios','legend',381,3),
  ('kyogre','legend',382,3),
  ('groudon','legend',383,3),
  ('rayquaza','legend',384,3),
  ('jirachi','legend',385,3),
  ('deoxys','legend',386,3),
  ('turtwig','rare',387,4),
  ('chimchar','rare',390,4),
  ('piplup','rare',393,4),
  ('starly','normal',396,4),
  ('bidoof','normal',399,4),
  ('kricketot','normal',401,4),
  ('shinx','rare',403,4),
  ('budew','normal',406,4),
  ('roserade','rare',407,4),
  ('cranidos','normal',408,4),
  ('shieldon','normal',410,4),
  ('burmy','normal',412,4),
  ('combee','normal',415,4),
  ('pachirisu','normal',417,4),
  ('buizel','normal',418,4),
  ('cherubi','normal',420,4),
  ('shellos','normal',422,4),
  ('ambipom','normal',424,4),
  ('drifloon','normal',425,4),
  ('buneary','normal',427,4),
  ('mismagius','normal',429,4),
  ('honchkrow','rare',430,4),
  ('glameow','normal',431,4),
  ('chingling','normal',433,4),
  ('stunky','normal',434,4),
  ('bronzor','rare',436,4),
  ('bonsly','normal',438,4),
  ('mimejr','normal',439,4),
  ('happiny','normal',440,4),
  ('chatot','normal',441,4),
  ('spiritomb','normal',442,4),
  ('gible','epic',443,4),
  ('munchlax','normal',446,4),
  ('riolu','rare',447,4),
  ('hippopotas','rare',449,4),
  ('skorupi','rare',451,4),
  ('croagunk','normal',453,4),
  ('carnivine','normal',455,4),
  ('finneon','normal',456,4),
  ('mantyke','normal',458,4),
  ('snover','normal',459,4),
  ('weavile','rare',461,4),
  ('magnezone','rare',462,4),
  ('lickilicky','rare',463,4),
  ('rhyperior','rare',464,4),
  ('tangrowth','rare',465,4),
  ('electivire','rare',466,4),
  ('magmortar','rare',467,4),
  ('togekiss','rare',468,4),
  ('yanmega','rare',469,4),
  ('leafeon','rare',470,4),
  ('glaceon','rare',471,4),
  ('gliscor','rare',472,4),
  ('mamoswine','rare',473,4),
  ('porygonz','rare',474,4),
  ('gallade','rare',475,4),
  ('probopass','rare',476,4),
  ('dusknoir','rare',477,4),
  ('froslass','normal',478,4),
  ('rotom','normal',479,4),
  ('uxie','legend',480,4),
  ('mesprit','legend',481,4),
  ('azelf','legend',482,4),
  ('dialga','legend',483,4),
  ('palkia','legend',484,4),
  ('heatran','legend',485,4),
  ('regigigas','legend',486,4),
  ('giratina','legend',487,4),
  ('cresselia','legend',488,4),
  ('phione','legend',489,4),
  ('darkrai','legend',491,4),
  ('shaymin','legend',492,4),
  ('arceus','legend',493,4),
  ('victini','legend',494,5),
  ('snivy','rare',495,5),
  ('tepig','rare',498,5),
  ('oshawott','rare',501,5),
  ('patrat','normal',504,5),
  ('lillipup','rare',506,5),
  ('purrloin','normal',509,5),
  ('pansage','normal',511,5),
  ('pansear','normal',513,5),
  ('panpour','normal',515,5),
  ('munna','normal',517,5),
  ('pidove','normal',519,5),
  ('blitzle','normal',522,5),
  ('roggenrola','rare',524,5),
  ('woobat','normal',527,5),
  ('drilbur','rare',529,5),
  ('audino','normal',531,5),
  ('timburr','rare',532,5),
  ('tympole','rare',535,5),
  ('throh','normal',538,5),
  ('sawk','normal',539,5),
  ('sewaddle','rare',540,5),
  ('venipede','normal',543,5),
  ('cottonee','normal',546,5),
  ('petilil','normal',548,5),
  ('basculin','normal',550,5),
  ('sandile','rare',551,5),
  ('darumaka','normal',554,5),
  ('maractus','normal',556,5),
  ('dwebble','normal',557,5),
  ('scraggy','normal',559,5),
  ('sigilyph','normal',561,5),
  ('yamask','normal',562,5),
  ('tirtouga','normal',564,5),
  ('archen','rare',566,5),
  ('trubbish','normal',568,5),
  ('zorua','rare',570,5),
  ('minccino','normal',572,5),
  ('gothita','normal',574,5),
  ('solosis','normal',577,5),
  ('ducklett','normal',580,5),
  ('vanillite','rare',582,5),
  ('deerling','normal',585,5),
  ('emolga','normal',587,5),
  ('karrablast','normal',588,5),
  ('foongus','normal',590,5),
  ('frillish','normal',592,5),
  ('alomomola','normal',594,5),
  ('joltik','normal',595,5),
  ('ferroseed','normal',597,5),
  ('klink','rare',599,5),
  ('tynamo','rare',602,5),
  ('elgyem','normal',605,5),
  ('litwick','rare',607,5),
  ('axew','rare',610,5),
  ('cubchoo','rare',613,5),
  ('cryogonal','rare',615,5),
  ('shelmet','normal',616,5),
  ('stunfisk','normal',618,5),
  ('mienfoo','rare',619,5),
  ('druddigon','normal',621,5),
  ('golett','normal',622,5),
  ('pawniard','normal',624,5),
  ('bouffalant','normal',626,5),
  ('rufflet','rare',627,5),
  ('vullaby','rare',629,5),
  ('heatmor','normal',631,5),
  ('durant','normal',632,5),
  ('deino','epic',633,5),
  ('larvesta','rare',636,5),
  ('cobalion','legend',638,5),
  ('terrakion','legend',639,5),
  ('virizion','legend',640,5),
  ('tornadus','legend',641,5),
  ('thundurus','legend',642,5),
  ('reshiram','legend',643,5),
  ('zekrom','legend',644,5),
  ('landorus','legend',645,5),
  ('kyurem','legend',646,5),
  ('keldeo','legend',647,5),
  ('meloetta','legend',648,5),
  ('genesect','legend',649,5)
on conflict (chain_key) do nothing;

-- ---------- max_unlocked_gen：該用戶最高已解鎖世代 ----------
create or replace function max_unlocked_gen(p_uid uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gen int := 1;
  v_missing int;
begin
  while v_gen < 5 loop
    select count(*) into v_missing
      from chain_rarity cr
      where cr.gen = v_gen
        and not exists (
          select 1 from user_entries ue
          where ue.account_id = p_uid and ue.chain_key = cr.chain_key
        );
    exit when v_missing > 0;
    v_gen := v_gen + 1;
  end loop;
  return v_gen;
end;
$$;
revoke execute on function max_unlocked_gen(uuid) from public, anon;
grant execute on function max_unlocked_gen(uuid) to authenticated;

-- ---------- gacha_pull：舊簽名要 drop（default 參數撞 overload） ----------
drop function if exists gacha_pull(numeric);

create or replace function gacha_pull(init_exp numeric default 0, p_gen int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  bal int;
  roll numeric;
  v_rarity text;
  ck record;
  ent user_entries%rowtype;
  is_dupe boolean := false;
  entry_count int;
  start_exp numeric := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_gen is null or p_gen < 1 or p_gen > 5 then raise exception 'invalid gen'; end if;
  /* server 端解鎖驗證：唔准抽未解鎖世代（防前端改 unlockedGen） */
  if p_gen > max_unlocked_gen(uid) then raise exception 'gen locked'; end if;

  /* 原子扣 3 鑽（唔夠 → 冇 row → raise） */
  update user_account set diamonds = diamonds - 3,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = uid and diamonds >= 3
  returning diamonds into bal;
  if not found then raise exception 'insufficient diamonds'; end if;

  /* server 自己 roll rarity（對齊 PULL_ODDS.rare：0.80 / 0.15 / 0.05） */
  roll := random();
  if roll < 0.80 then v_rarity := 'rare';
  elsif roll < 0.95 then v_rarity := 'epic';
  else v_rarity := 'legend'; end if;

  select cr.chain_key, cr.stage1_dex into ck from chain_rarity cr
    where cr.rarity = v_rarity and cr.gen = p_gen order by random() limit 1;
  if ck is null then raise exception 'no chain for rarity % gen %', v_rarity, p_gen; end if;

  select count(*) into entry_count from user_entries where account_id = uid;

  select * into ent from user_entries where account_id = uid and chain_key = ck.chain_key;
  if found then
    /* 重複：EV+1、糖果+1、dupes+1、stars 重計 */
    is_dupe := true;
    update user_entries set
      ev_points = ev_points + 1,
      dupes = dupes + 1,
      candies = candies + 1,
      stars = least(5, 1 + (dupes + 1) / 5),
      updated_at = (extract(epoch from now()) * 1000)::bigint
    where id = ent.id
    returning * into ent;
  else
    /* init_exp 只限帳號第一隻（對應 pendingExp），clamp ≤ 5000 */
    if entry_count = 0 and init_exp is not null then
      start_exp := least(greatest(init_exp, 0), 5000);
    end if;
    insert into user_entries(account_id, chain_key, stage, exp, level, ivs, evs,
      ev_points, candies, dupes, stars, active, owned_species, obtained_at, updated_at)
    values (uid, ck.chain_key, 1, start_exp, 1,
      jsonb_build_object('hp', floor(random()*32)::int, 'atk', floor(random()*32)::int,
        'def', floor(random()*32)::int, 'spa', floor(random()*32)::int,
        'spd', floor(random()*32)::int, 'spe', floor(random()*32)::int),
      jsonb_build_object('hp',0,'atk',0,'def',0,'spa',0,'spd',0,'spe',0),
      0, 0, 0, 1, entry_count = 0, ARRAY[ck.stage1_dex::text],
      (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint)
    returning * into ent;
  end if;

  return jsonb_build_object('entry', to_jsonb(ent), 'rarity', v_rarity,
    'is_dupe', is_dupe, 'balance', bal);
end;
$$;
revoke execute on function gacha_pull(numeric, int) from public, anon;
grant execute on function gacha_pull(numeric, int) to authenticated;

-- ---------- obtain_capture：放寬 dex 上限 + gen 解鎖驗證 ----------
create or replace function obtain_capture(chain_key text, dex_id int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ck record;
  ent user_entries%rowtype;
  is_dupe boolean := false;
  entry_count int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if dex_id is null or dex_id < 1 or dex_id > 649 then raise exception 'invalid dex_id'; end if;

  select cr.chain_key, cr.stage1_dex, cr.gen into ck from chain_rarity cr
    where cr.chain_key = obtain_capture.chain_key and cr.rarity = 'normal';
  if ck is null or ck.stage1_dex <> dex_id then
    raise exception 'chain not capturable';
  end if;
  /* 捕捉池同樣受世代解鎖限制（防前端繞過 pullablePool 直call） */
  if ck.gen > max_unlocked_gen(uid) then raise exception 'gen locked'; end if;

  select count(*) into entry_count from user_entries where account_id = uid;

  select * into ent from user_entries where account_id = uid and chain_key = ck.chain_key;
  if found then
    is_dupe := true;
    update user_entries set
      ev_points = ev_points + 1,
      dupes = dupes + 1,
      stars = least(5, 1 + (dupes + 1) / 5),
      updated_at = (extract(epoch from now()) * 1000)::bigint
    where id = ent.id
    returning * into ent;
  else
    insert into user_entries(account_id, chain_key, stage, exp, level, ivs, evs,
      ev_points, candies, dupes, stars, active, owned_species, obtained_at, updated_at)
    values (uid, ck.chain_key, 1, 0, 1,
      jsonb_build_object('hp', floor(random()*32)::int, 'atk', floor(random()*32)::int,
        'def', floor(random()*32)::int, 'spa', floor(random()*32)::int,
        'spd', floor(random()*32)::int, 'spe', floor(random()*32)::int),
      jsonb_build_object('hp',0,'atk',0,'def',0,'spa',0,'spd',0,'spe',0),
      0, 0, 0, 1, entry_count = 0, ARRAY[ck.stage1_dex::text],
      (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint)
    returning * into ent;
  end if;

  return jsonb_build_object('entry', to_jsonb(ent), 'is_dupe', is_dupe);
end;
$$;
revoke execute on function obtain_capture(text, int) from public, anon;
grant execute on function obtain_capture(text, int) to authenticated;
