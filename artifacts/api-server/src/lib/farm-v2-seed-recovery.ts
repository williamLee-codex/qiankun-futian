export type PendingSeedRow = {request_id:string;action:string;reference_id:string;wallet_amount:number;wallet_currency:string;wallet_direction:string};
export function decodePendingSeedPurchases(rows:PendingSeedRow[]) {
 return rows.map(row=>{
  const match=/^seed-purchase:([1-5]):([1-9][0-9]{0,9})$/.exec(row.action);
  if(!match || !/^[A-Za-z0-9._:-]{1,120}$/.test(row.request_id))throw Error('INVALID_FARM_SEED_RECOVERY');
  const packs=Number(match[2]);if(!Number.isSafeInteger(packs)||packs>2147483647||row.reference_id!==`${match[1]}:${packs}`||row.wallet_amount!==packs||row.wallet_currency!=='coin'||row.wallet_direction!=='debit')throw Error('INVALID_FARM_SEED_RECOVERY');
  return {requestId:row.request_id,landId:Number(match[1]),packs};
 });
}
