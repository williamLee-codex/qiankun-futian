import type { CSSProperties, ReactNode } from "react";
const ART_W = 1536;
const ART_H = 1024;
const regions = {
  centralBalance: [340, 324, 302, 53], farmBalance: [1098, 324, 302, 53],
  directionIn: [376, 499, 62, 63], directionOut: [926, 499, 63, 63],
  amountInput: [383, 631, 806, 67], maxButton: [1222, 629, 180, 73],
  quickRow: [383, 706, 905, 64],
  submitButton: [526, 785, 486, 117], closeButton: [1418, 49, 109, 98],
} as const;
// The stage keeps the 1536×1024 art ratio but is bounded by BOTH viewport
// dimensions, so a short or narrow screen never clips the panel. 100dvh is the
// game iframe viewport, which already excludes the platform header, and keeps
// room for the one-line status message below the art.
const stageStyle: CSSProperties = {
  width: `min(100%, ${ART_W}px, calc((100dvh - 64px) * ${ART_W / ART_H}))`,
  margin: "0 auto",
};
const quickAmounts = [1, 10, 100, 1000] as const;
type Region = keyof typeof regions;
function position(name: Region): CSSProperties {
  const [x,y,w,h] = regions[name];
  return {position:"absolute",left:`${x/1536*100}%`,top:`${y/1024*100}%`,width:`${w/1536*100}%`,height:`${h/1024*100}%`,display:"flex",alignItems:"center",justifyContent:"center"};
}
export function FarmCoinWalletArtLayout(props:{
  centralBalance:ReactNode;farmBalance:ReactNode;direction:"in"|"out";
  onDirectionChange:(direction:"in"|"out")=>void;amount:string;
  onAmountChange:(value:string)=>void;onAdd:(value:number)=>void;onMax:()=>void;onSubmit:()=>void;
  onClose:()=>void;disabled:boolean;submitDisabled:boolean;message?:ReactNode;
}){
  const buttonBase:CSSProperties={border:0,background:"transparent",color:"transparent",cursor:"pointer",padding:0};
  const balanceStyle:CSSProperties={color:"#ffe5a0",fontWeight:800,fontSize:"clamp(9px,2vw,25px)",textAlign:"center",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums",textShadow:"0 2px 4px #24101a"};
  const quickButton:CSSProperties={border:"2px solid #f7dc95",borderRadius:999,padding:0,cursor:"pointer",color:"#4a2c08",fontWeight:800,fontSize:"clamp(9px,1.35vw,21px)",letterSpacing:".02em",background:"linear-gradient(180deg,#ffeeb4 0%,#f4cb6b 46%,#c9922f 100%)",boxShadow:"0 2px 6px rgba(0,0,0,.45),inset 0 1px 0 #fff8d8",fontVariantNumeric:"tabular-nums"};
  return <section aria-label="金幣轉換" style={stageStyle}>
    <div style={{position:"relative",width:"100%",aspectRatio:"1536 / 1024"}}>
      <img src={`${import.meta.env.BASE_URL ?? "/"}images/farm/coin-conversion-approved.png`} alt="" aria-hidden="true" style={{width:"100%",height:"100%",display:"block"}}/>
      <output aria-label="中央金幣餘額" style={{...position("centralBalance"),...balanceStyle}}>{props.centralBalance}</output>
      <output aria-label="福田金幣餘額" style={{...position("farmBalance"),...balanceStyle}}>{props.farmBalance}</output>
      {(["in","out"] as const).map(dir=><button key={dir} type="button" aria-label={dir==="in"?"中央金幣轉入福田":"福田金幣回存中央"} aria-pressed={props.direction===dir} disabled={props.disabled} onClick={()=>props.onDirectionChange(dir)}
        style={{...position(dir==="in"?"directionIn":"directionOut"),...buttonBase}}>
        <span aria-hidden="true" style={{display:"block",width:"45%",aspectRatio:1,borderRadius:"50%",background:props.direction===dir?"radial-gradient(circle,#fff3ae 0%,#ffc94b 55%,#bd7624 100%)":"transparent",boxShadow:props.direction===dir?"0 0 9px 3px #f8c14b":"none"}}/>
      </button>)}
      <input aria-label="轉換金額" inputMode="numeric" value={props.amount} onChange={e=>props.onAmountChange(e.target.value)} disabled={props.disabled}
        style={{...position("amountInput"),border:0,outlineOffset:-2,background:"transparent",color:"#fff0be",fontSize:"clamp(10px,2vw,25px)",fontWeight:700,padding:"0 1%",boxSizing:"border-box"}}/>
      <button type="button" aria-label="最大可轉換金額" disabled={props.disabled} onClick={props.onMax} style={{...position("maxButton"),...buttonBase}}>最大</button>
      <div role="group" aria-label="快速加幣" style={{...position("quickRow"),display:"grid",gridTemplateColumns:`repeat(${quickAmounts.length},1fr)`,gap:"1.1%"}}>
        {quickAmounts.map(value=><button key={value} type="button" aria-label={`增加 ${value} 金幣`} disabled={props.disabled} onClick={()=>props.onAdd(value)} style={{...quickButton,opacity:props.disabled?0.6:1}}>+{value}</button>)}
      </div>
      <button type="button" aria-label="確認轉換" disabled={props.submitDisabled} onClick={props.onSubmit} style={{...position("submitButton"),...buttonBase,opacity:props.submitDisabled?0.6:1}}>確認轉換</button>
      <button type="button" aria-label="關閉金幣轉換" onClick={props.onClose} style={{...position("closeButton"),...buttonBase}}>關閉</button>
    </div>
    {props.message&&<div role="status" style={{textAlign:"center",color:"#f5d99d"}}>{props.message}</div>}
  </section>;
}
