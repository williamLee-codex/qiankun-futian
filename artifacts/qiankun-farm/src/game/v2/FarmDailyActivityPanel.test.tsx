// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FarmDailyActivityPanel, type DailyActivitySnapshot } from "./FarmDailyActivityPanel";
afterEach(cleanup);
const snapshot = (points=0,claimed=false): DailyActivitySnapshot => ({status:"ready",day:"2026-11-14",points,maximum:120,
 tasks:Array.from({length:6},(_,i)=>({id:String(i),label:`測試任務${i+1}`,target:1,progress:points===120?1:0,complete:points===120})),
 milestones:[{activity:30,reward:"金幣 ×10",eligible:points>=30,claimed},{activity:60,reward:"隨機黃級盆栽 ×1",eligible:points>=60,claimed:false},{activity:100,reward:"蘊靈砂 ×1",eligible:points>=100,claimed:false}]});
it("renders six server tasks and gates each milestone without inventing progress",async()=>{
 render(<FarmDailyActivityPanel read={async()=>snapshot()} claim={vi.fn()} onReward={vi.fn()}/>);
 await screen.findByText("測試任務1");
 expect(screen.getAllByRole("listitem")).toHaveLength(6);
 expect((screen.getByRole("button",{name:"領取 30 活躍獎勵"}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByText("0 / 120")).toBeTruthy();
});
it("uses the server claim response and disables a claimed milestone",async()=>{
 const claim=vi.fn(async()=>({...snapshot(120,true),status:"claimed"})); const onReward=vi.fn();
 render(<FarmDailyActivityPanel read={async()=>snapshot(120)} claim={claim} onReward={onReward}/>);
 const button=await screen.findByRole("button",{name:"領取 30 活躍獎勵"});
 fireEvent.click(button);
 await waitFor(()=>expect(claim).toHaveBeenCalledWith(30));
 await waitFor(()=>expect(onReward).toHaveBeenCalledTimes(1));
 expect((screen.getByRole("button",{name:"30 活躍獎勵已領取"}) as HTMLButtonElement).disabled).toBe(true);
});
it("fails closed when authoritative activity cannot be read",async()=>{
 render(<FarmDailyActivityPanel read={async()=>{throw new Error("offline")}} claim={vi.fn()} onReward={vi.fn()}/>);
 await screen.findByRole("alert");
 expect(screen.queryByRole("button",{name:"領取 30 活躍獎勵"})).toBeNull();
});
