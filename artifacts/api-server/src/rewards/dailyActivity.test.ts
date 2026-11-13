import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAILY_TASK_POOL, selectDailyTasks } from './dailyTaskPool';
import { applyVerifiedEvent, claimableMilestones, dailyActivityPoints, taipeiActivityDay } from './dailyActivity';

test('17 candidate tasks are defined', () => {
  assert.equal(DAILY_TASK_POOL.length, 17);
  assert.equal(new Set(DAILY_TASK_POOL.map(t => t.id)).size, 15);
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
