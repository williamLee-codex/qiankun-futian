import type { CSSProperties, ReactNode } from "react";
const regions = {
  centralBalance: [340, 324, 302, 53], farmBalance: [1098, 324, 302, 53],
  directionIn: [376, 499, 62, 63], directionOut: [926, 499, 63, 63],
  amountInput: [383, 631, 806, 67], maxButton: [1222, 629, 180, 73],
  submitButton: [526, 785, 486, 117], closeButton: [1418, 49, 109, 98],
} as const;
type Region = keyof typeof regions;
function position(name: Region): CSSProperties {
  const [x,y,w,h] = regions[name];
  return {position:"absolute",left:`${x/1536*100}%`,top:`${y/1024*100}%`,width:`${w/1536*100}%`,height:`${h/1024*100}%`,display:"flex",alignItems:"center",justifyContent:"center"};
}
export function FarmCoinWalletArtLayout(props:{
  centralBalance:ReactNode;farmBalance:ReactNode;direction:"in"|"out";
  onDirectionChange:(direction:"in"|"out")=>void;amount:string;
  onAmountChange:(value:string)=>void;onMax:()=>void;onSubmit:()=>void;
  onClose:()=>void;disabled:boolean;submitDisabled:boolean;message?:ReactNode;
}){
  const buttonBase:CSSProperties={border:0,background:"transparent",color:"transparent",cursor:"pointer",padding:0};
  const balanceStyle:CSSProperties={color:"#ffe5a0",fontWeight:800,fontSize:"clamp(9px,2vw,25px)",textAlign:"center",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums",textShadow:"0 2px 4px #24101a"};
  return <section aria-label="金幣轉換" style={{width:"100%",maxWidth:1536}}>
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
      <button type="button" aria-label="確認轉換" disabled={props.submitDisabled} onClick={props.onSubmit} style={{...position("submitButton"),...buttonBase,opacity:props.submitDisabled?0.6:1}}>確認轉換</button>
      <button type="button" aria-label="關閉金幣轉換" onClick={props.onClose} style={{...position("closeButton"),...buttonBase}}>關閉</button>
    </div>
    {props.message&&<div role="status" style={{textAlign:"center",color:"#f5d99d"}}>{props.message}</div>}
  </section>;
}
