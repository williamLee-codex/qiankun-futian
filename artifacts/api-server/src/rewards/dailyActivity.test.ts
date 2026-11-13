import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAILY_TASK_POOL, selectDailyTasks } from './dailyTaskPool';
import { applyVerifiedEvent, assignedDailyActivityPoints, claimableMilestones, dailyActivityPoints, projectDailyActivity, taipeiActivityDay } from './dailyActivity';

test('17 candidate tasks are defined', () => {
  assert.equal(DAILY_TASK_POOL.length, 17);
  assert.equal(new Set(DAILY_TASK_POOL.map(t => t.id)).size, 17);
});

test('Taipei 05:00 boundary', () => {
  assert.equal(taipeiActivityDay(new Date('2026-11-12T20:59:59Z')), '2026-11-12');
  assert.equal(taipeiActivityDay(new Date('2026-11-12T21:00:00Z')), '2026-11-13');
});

test('six unique eligible tasks and mutually exclusive thresholds', () => {
  const eligibility = { pets:true, friends:true, synthesis:true, pots:true, availablePlantSpecies:2, availableHarvestSpecies:2 };
  for (let seed=0; seed<17; seed++) {
    let step=seed;
    const tasks = selectDailyTasks(eligibility, n => (step++ % n));
    assert.equal(tasks.length,6);
    assert.equal(new Set(tasks.map(t=>t.id)).size,6);
    assert.ok(tasks.filter(t=>t.clickOnly).length <= 1);
    assert.ok(tasks.filter(t=>t.exclusiveGroup==='plant_threshold').length <= 1);
    assert.ok(tasks.filter(t=>t.exclusiveGroup==='harvest_threshold').length <= 1);
    assert.ok(tasks.filter(t=>t.exclusiveGroup==='seed_quantity_threshold').length <= 1);
  }
});

test('new player with only first plot receives six legal tasks', () => {
  const eligibility = {
    pets:false, friends:false, synthesis:false, pots:false,
    availablePlantSpecies:1, availableHarvestSpecies:1,
  };
  const tasks = selectDailyTasks(eligibility, () => 0);
  assert.equal(tasks.length, 6);
  assert.equal(new Set(tasks.map(t=>t.id)).size, 6);
  assert.ok(tasks.every(t=>!t.feature && t.metric!=='distinct_species'));
  assert.ok(tasks.filter(t=>t.clickOnly).length <= 1);
  assert.ok(tasks.filter(t=>t.exclusiveGroup==='seed_quantity_threshold').length <= 1);
});

test('verified quantity and distinct species progress', () => {
  const tasks=DAILY_TASK_POOL.filter(t=>t.id==='plant_5'||t.id==='plant_distinct_2');
  const first=applyVerifiedEvent(tasks,[],{transactionId:'tx1',event:'plant',quantity:5,speciesId:'a'});
  assert.equal(first[0].completed,true);
  assert.equal(first[1].completed,false);
  const second=applyVerifiedEvent(tasks,first,{transactionId:'tx2',event:'plant',quantity:1,speciesId:'b'});
  assert.equal(second[1].completed,true);
  assert.equal(dailyActivityPoints(second),40);
  assert.deepEqual(claimableMilestones(40,[]),[30]);
  assert.deepEqual(claimableMilestones(120,[30,100]),[60]);
});

test('new player selection remains feasible across deterministic draw orders', () => {
  const eligibility = {
    pets:false, friends:false, synthesis:false, pots:false,
    availablePlantSpecies:1, availableHarvestSpecies:1,
  };
  for (let seed=0; seed<100; seed++) {
    let step=seed;
    const tasks=selectDailyTasks(eligibility, n => (step++ * 7 + seed) % n);
    assert.equal(tasks.length,6);
    assert.equal(new Set(tasks.map(t=>t.id)).size,6);
    assert.ok(tasks.filter(t=>t.clickOnly).length <= 1);
    for (const group of ['plant_threshold','harvest_threshold','seed_quantity_threshold']) {
      assert.ok(tasks.filter(t=>t.exclusiveGroup===group).length <= 1);
    }
  }
});

test('invalid random index is rejected', () => {
  const eligibility = {
    pets:false, friends:false, synthesis:false, pots:false,
    availablePlantSpecies:1, availableHarvestSpecies:1,
  };
  assert.throws(() => selectDailyTasks(eligibility, () => -1), /INVALID_RANDOM_INDEX/);
});

test('replay deduplicates retries and ignores unassigned tasks for points', () => {
  const assigned = DAILY_TASK_POOL.filter(t => [
    'plant_once','plant_5','harvest_5','buy_seeds_once','buy_seeds_5','open_warehouse',
  ].includes(t.id));
  const events = [
    {transactionId:'a',event:'plant' as const,quantity:5,speciesId:'seed-a'},
    {transactionId:'a',event:'plant' as const,quantity:5,speciesId:'seed-a'},
    {transactionId:'b',event:'buy_seeds' as const,quantity:5},
  ];
  const progress=projectDailyActivity(assigned,events);
  assert.equal(progress.find(p=>p.taskId==='plant_5')?.count,5);
  assert.equal(progress.find(p=>p.taskId==='plant_once')?.count,1);
  assert.equal(assignedDailyActivityPoints(assigned,progress),80);
  assert.equal(assignedDailyActivityPoints(assigned,[...progress,{taskId:'harvest_10',count:10,species:[],completed:true}]),80);
  assert.throws(() => projectDailyActivity(assigned,[
    events[0],{...events[0],quantity:10},
  ]), /CONFLICTING_TRANSACTION_EVENT/);
});

test('retry comparison ignores object property order but rejects changed payload', () => {
  const assigned=DAILY_TASK_POOL.filter(t=>[
    'plant_once','plant_5','harvest_5','buy_seeds_once','buy_seeds_5','open_warehouse',
  ].includes(t.id));
  const first={transactionId:'tx-order',event:'plant' as const,quantity:5,speciesId:'rice'};
  const reordered={speciesId:'rice',quantity:5,event:'plant' as const,transactionId:'tx-order'};
  const progress=projectDailyActivity(assigned,[first,reordered]);
  assert.equal(progress.find(p=>p.taskId==='plant_5')?.count,5);
  assert.throws(()=>projectDailyActivity(assigned,[first,{...first,speciesId:'other'}]),/CONFLICTING_TRANSACTION_EVENT/);
  assert.throws(()=>projectDailyActivity(assigned,[{...first,speciesId:' '}]),/INVALID_VERIFIED_EVENT/);
});

test('daily replay rejects tampered assignments', () => {
  const assigned=DAILY_TASK_POOL.filter(t=>[
    'plant_once','plant_5','harvest_5','buy_seeds_once','buy_seeds_5','open_warehouse',
  ].includes(t.id));
  assert.throws(()=>projectDailyActivity(assigned.map((t,i)=>i===0?{...t,target:999}:t),[]),/ALTERED_ASSIGNED_TASK/);
  const conflicting=DAILY_TASK_POOL.filter(t=>[
    'plant_once','plant_5','plant_10','harvest_5','buy_seeds_once','open_warehouse',
  ].includes(t.id));
  assert.throws(()=>projectDailyActivity(conflicting,[]),/CONFLICTING_ASSIGNED_TASKS/);
});
