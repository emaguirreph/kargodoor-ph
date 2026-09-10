import assert from "node:assert/strict";
import test from "node:test";
import { customerQuotationPng } from "../../lib/admin/quotation-png";

const saved={quotation_number:"KD-Q-2026-001",quotation_date:"2026-09-10",freight_type:"Sea Freight",final_amount:125000,customer_snapshot:JSON.stringify({name:"Ada Customer",company:"Example Trading",mobile:"09171234567",email:"ada@example.com",address:"Manila"}),cargo_snapshot:JSON.stringify({description:"Household wares",quantity:2,unitType:"boxes",cbm:.024,weight:12,origin:"Guangzhou",originWarehouse:"China Warehouse"}),pricing_snapshot:JSON.stringify({densityCharge:999999}),backend_cost:999999,nihao_cost:999999,gross_margin:999999,override_reason:"Internal reason",notes:"Admin notes"};
test("customer quotation image is a 1200px PNG generated from saved data",async()=>{const png=await customerQuotationPng(saved);assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10]);const view=new DataView(png.buffer,png.byteOffset,png.byteLength);assert.equal(view.getUint32(16),1200);assert.ok(view.getUint32(20)>=1500);});
test("customer quotation image renderer has no internal pricing inputs",()=>{const renderer=customerQuotationPng.toString();for(const forbidden of ["pricing_snapshot","backend_cost","nihao_cost","gross_margin","override_reason","notes","densityCharge"])assert.doesNotMatch(renderer,new RegExp(forbidden));});
