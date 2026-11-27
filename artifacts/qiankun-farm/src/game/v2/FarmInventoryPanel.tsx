import { useEffect, useLayoutEffect, useRef, useState } from "react";
import calibration from "../../../public/images/farm/inventory/grid-calibration.json";
import "./farmInventoryPanel.css";

type Kind = "warehouse" | "treasure-bag";
import type { InventorySlot } from "./warehousePanelInventory";

const base = import.meta.env.BASE_URL + "images/farm/inventory/";
const controls = {
  "warehouse-desktop": [[140,120,333,76],[501,120,336,76],[864,120,334,76],[1225,120,334,76],[1555,18,90,80],[625,731,71,65],[974,731,72,65]],
  "warehouse-mobile": [[50,164,224,94],[286,164,221,94],[517,164,224,94],[751,164,222,94],[897,18,99,100],[257,1204,91,88],[678,1204,87,88]],
  "treasure-bag-desktop": [[187,149,285,74],[486,149,279,74],[779,149,279,74],[1071,149,284,74],[1414,34,84,84],[588,785,70,68],[878,785,70,68]],
  "treasure-bag-mobile": [[72,190,214,92],[297,190,213,92],[519,190,212,92],[741,190,212,92],[853,31,104,92],[319,1207,81,80],[625,1207,81,80]],
};

const adSlots = {
  "warehouse-desktop": [[98,803,720,99],[854,803,720,99]],
  "warehouse-mobile": [[53,1315,918,166]],
  "treasure-bag-desktop": [[75,874,683,102],[777,874,683,102]],
  "treasure-bag-mobile": [[81,1308,862,160]],
};
export function preloadInventoryArt() {
  for (const name of Object.keys(controls)) new Image().src = base + name + ".png";
}

export function FarmInventoryPanel({ kind, items, unavailable, onClose }: {
  kind: Kind;
  items: readonly InventorySlot[];
  unavailable: boolean;
  onClose: () => void;
}) {
  const [mobile, setMobile] = useState(() => matchMedia("(max-width: 767px)").matches);
  const [category, setCategory] = useState("全部");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<InventorySlot | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    const query = matchMedia("(max-width: 767px)");
    const change = () => { setMobile(query.matches); setPage(0); setDetail(null); };
    query.addEventListener("change", change);
    return () => { query.removeEventListener("change", change); clearTimeout(hold.current); };
  }, []);
  const key = `${kind}-${mobile ? "mobile" : "desktop"}` as keyof typeof controls;
  const {size: [w,h], x, y} = calibration.layouts[key];
  const box = ([left,top,width,height]: number[]) => ({
    left: `${left / w * 100}%`, top: `${top / h * 100}%`,
    width: `${width / w * 100}%`, height: `${height / h * 100}%`,
  });
  const columns = x.length - 1;
  const capacity = columns * (y.length - 1);
  const selected = items.filter(item => item.quantity > 0 && (category === "全部" || category === item.category));
  const last = Math.max(0, Math.ceil(selected.length / capacity) - 1);
  const current = Math.min(page, last);
  const tabs = kind === "warehouse" ? ["全部","種子","作物","材料"] : ["全部","靈物","道具","寶箱"];
  return <dialog ref={dialog} className="farm-art-inventory" aria-label={kind === "warehouse" ? "乾坤倉庫" : "乾坤寶囊"} onPointerDown={event => { if (!(event.target as HTMLElement).closest(".farm-inventory-item")) setDetail(null); }} onCancel={event => {event.preventDefault(); if (detail) setDetail(null); else onClose();}}
    style={{width: `min(calc(100vw - 12px), calc((100dvh - 12px) * ${w / h}), ${w}px)`, aspectRatio: `${w} / ${h}`}}>
    <img className="farm-inventory-art" src={base + key + ".png"} alt="" draggable={false} />
    {tabs.map((name,i) => <button key={name} type="button" className="farm-inventory-hotspot" aria-label={name} aria-pressed={category === name} style={box(controls[key][i])}
      onClick={() => {setCategory(name); setPage(0); setDetail(null);}} />)}
    <button type="button" autoFocus aria-label="關閉" className="farm-inventory-hotspot" style={box(controls[key][4])} onClick={onClose} />
    {[-1,1].map((direction,i) => <button key={direction} type="button" aria-label={i ? "下一頁" : "上一頁"} className="farm-inventory-hotspot" style={box(controls[key][5+i])}
      disabled={i ? current === last : current === 0} onClick={() => {setPage(current + direction); setDetail(null);}} />)}
    {selected.slice(current * capacity, (current + 1) * capacity).map((item,i) => {
      const row = Math.floor(i / columns), col = i % columns;
      return <button key={item.id} type="button" className="farm-inventory-hotspot farm-inventory-item" aria-label={`${item.name}，持有 ${item.quantity}`}
        style={box([x[col],y[row],x[col+1]-x[col],y[row+1]-y[row]])}
        onMouseEnter={() => {if (!mobile) setDetail(item);}} onMouseLeave={() => {if (!mobile) setDetail(null);}}
        onFocus={() => {if (!mobile) setDetail(item);}} onBlur={() => setDetail(null)}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={() => {if (mobile) { clearTimeout(hold.current); setDetail(null); hold.current = setTimeout(() => setDetail(item), 450); }}} onPointerLeave={() => clearTimeout(hold.current)}
        onPointerUp={() => clearTimeout(hold.current)} onPointerCancel={() => clearTimeout(hold.current)}
        onClick={() => {if (!mobile) setDetail(item);}}>
        {item.icon ? <img src={item.icon} alt="" draggable={false} /> : <span aria-hidden="true">{item.symbol}</span>}
        <strong>{item.quantity}</strong>
      </button>;
    })}
    {adSlots[key].map((rect, index) => <div key={index} aria-hidden="true"
      data-farm-ad-placement={"farm-v2-" + key + "-" + (index + 1)}
      className="farm-inventory-ad-slot" style={box(rect)} />)}
    {unavailable && <span className="farm-inventory-status" role="status">部分庫存暫無法確認</span>}
    {detail && <div className="farm-inventory-detail" role="tooltip" onClick={() => setDetail(null)}>
      <strong>{detail.name} ×{detail.quantity}</strong><br />{detail.description}
    </div>}
  </dialog>;
}

