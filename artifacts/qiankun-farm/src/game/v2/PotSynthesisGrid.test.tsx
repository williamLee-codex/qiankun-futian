// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PotSynthesisGrid } from './PotSynthesisGrid';
import type {WorkshopWarehouse} from './workshopRuntime';
const base=():WorkshopWarehouse=>({seeds:{1:0,2:0,3:0,4:0,5:0,6:0},crops:{1:3,2:0,3:0,4:0,5:0,6:0},workshop:{pots:[],decor:[],potGallery:{},decorGallery:{},materials:{蘊靈砂:1,九霄玉髓:0}}});
afterEach(cleanup);
describe('42-slot synthesis interaction',()=>{
 it('shows every species and level, including unowned pots',()=>{render(<PotSynthesisGrid warehouse={base()} busy={false} readWallet={async()=>({coins:3})} transact={async()=>true}/>);expect(screen.getAllByRole('button',{name:/持有/})).toHaveLength(42);expect(screen.getAllByRole('img')).toHaveLength(1)});
 it('blocks missing materials even when the wallet is sufficient',async()=>{const w=base();w.workshop!.materials.蘊靈砂=0;render(<PotSynthesisGrid warehouse={w} busy={false} readWallet={async()=>({coins:100})} transact={async()=>true}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'合成黃階盆栽'}).hasAttribute('disabled')).toBe(true));expect(screen.getByText(/暫不可合成/)).toBeTruthy()});
 it('checks actual coins and submits once without inventing success',async()=>{let finish!:(ok:boolean)=>void;const transact=vi.fn(()=>new Promise<boolean>(r=>{finish=r}));render(<PotSynthesisGrid warehouse={base()} busy={false} readWallet={async()=>({coins:3})} transact={transact}/>);const button=screen.getByRole('button',{name:'合成黃階盆栽'});await waitFor(()=>expect(button.hasAttribute('disabled')).toBe(false));fireEvent.click(button);fireEvent.click(button);expect(transact).toHaveBeenCalledTimes(1);expect(transact).toHaveBeenCalledWith({kind:'synthesize',species:1,grade:'黃',useDisplayed:false});expect(screen.queryByText(/合成成功/)).toBeNull();finish(true);await screen.findByText(/合成成功/)});
 it('keeps uncertain transaction separate from success',async()=>{render(<PotSynthesisGrid warehouse={base()} busy={false} readWallet={async()=>({coins:3})} transact={async()=>false}/>);const button=screen.getByRole('button',{name:'合成黃階盆栽'});await waitFor(()=>expect(button.hasAttribute('disabled')).toBe(false));fireEvent.click(button);await screen.findByText(/尚未確認合成結果/);expect(button.hasAttribute("disabled")).toBe(true)});
 it('raw plant opens the first-grade recipe rather than consuming anything',async()=>{const transact=vi.fn(async()=>true);render(<PotSynthesisGrid warehouse={base()} busy={false} readWallet={async()=>({coins:3})} transact={transact}/>);fireEvent.click(screen.getByRole('button',{name:/曜金粟 靈植，/}));fireEvent.click(screen.getByRole('button',{name:'查看黃階合成配方'}));expect(transact).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'合成黃階盆栽'})).toBeTruthy()});
 it('reads harvested plant quantities directly from the farm warehouse',async()=>{
  const w=base();w.crops[1]=9;w.crops[6]=4;
  render(<PotSynthesisGrid warehouse={w} busy={false} readWallet={async()=>({coins:100})} transact={async()=>true}/>);
  expect(screen.getByRole('button',{name:/曜金粟 靈植，持有 9/})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/曜金粟 靈植，持有 9/}));
  expect(screen.getByText('持有 9 株靈植')).toBeTruthy();
  expect(screen.getByText('9 / 3')).toBeTruthy();
  expect(screen.getByRole('button',{name:/混沌晶華 靈植，持有 4/})).toBeTruthy();
 });
 it('manages placement in synthesis, not in a duplicate bag grid',async()=>{
  const w=base();
  w.workshop!.pots=[{id:'pot-owned-1',species:1,grade:'黃',displayed:false,acquiredAt:1}];
  const transact=vi.fn(async()=>true);
  render(<PotSynthesisGrid warehouse={w} busy={false} readWallet={async()=>({coins:100})} transact={transact}/>);
  expect(screen.getByRole('button',{name:/曜金粟 黃階盆栽，持有 1/})).toBeTruthy();
  fireEvent.click(screen.getByText('已持有盆栽與擺放管理'));
  fireEvent.click(screen.getByRole('button',{name:'擺放／替換'}));
  await waitFor(()=>expect(transact).toHaveBeenCalledWith({kind:'displayPot',potId:'pot-owned-1'}));
  await screen.findByText(/操作已確認/);
 });
 it('does not submit placement twice while the server response is pending',async()=>{
  const w=base();
  w.workshop!.pots=[{id:'pot-owned-2',species:1,grade:'黃',displayed:true,acquiredAt:1}];
  let finish!:(ok:boolean)=>void;
  const transact=vi.fn(()=>new Promise<boolean>(resolve=>{finish=resolve}));
  render(<PotSynthesisGrid warehouse={w} busy={false} readWallet={async()=>({coins:100})} transact={transact}/>);
  fireEvent.click(screen.getByText('已持有盆栽與擺放管理'));
  const button=screen.getByRole('button',{name:'取下'});
  fireEvent.click(button);fireEvent.click(button);
  expect(transact).toHaveBeenCalledTimes(1);
  expect(transact).toHaveBeenCalledWith({kind:'removePot',species:1});
  finish(false);
  await screen.findByText(/操作未確認/);
  expect(button.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:/月海曇 黃階盆栽，持有 0/}));
  expect(button.hasAttribute('disabled')).toBe(true);
 });

 it('blocks synthesis when the server omits the workshop inventory',async()=>{
  const w=base();delete w.workshop;
  render(<PotSynthesisGrid warehouse={w} busy={false} readWallet={async()=>({coins:100})} transact={async()=>true}/>);
  expect(screen.getByRole('alert').textContent).toContain('已停止合成與擺放操作');
  await waitFor(()=>expect(screen.getByRole('button',{name:'合成黃階盆栽'}).hasAttribute('disabled')).toBe(true));
 });

});
