import { Worker } from 'node:worker_threads';
import type { Binding } from '../src/types.js';
export class StepSearch {
 private worker = new Worker(new URL('./search-worker.mjs',import.meta.url));
 private pending = new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
 private sequence=0;
 readonly byId:Map<string,Binding>;
 readonly ready:Promise<any>;
 constructor(readonly bindings:Binding[]) {
  this.byId=new Map(bindings.map(b=>[b.id,b]));
  this.worker.on('message',({id,result,error})=>{const job=this.pending.get(id);this.pending.delete(id);if(error)job?.reject(new Error(error));else job?.resolve(result);});
  this.worker.on('error',error=>{for(const job of this.pending.values())job.reject(error);this.pending.clear();});
  this.ready=this.request({kind:'init',documents:bindings.map((b,id)=>({id,keyword:b.keyword,text:[b.pattern,b.className,b.method,b.file,...b.parameters.map(p=>p.name),...b.examples].join(' ')}))});
  this.ready.catch(()=>{});
 }
 private request(data:object):Promise<any>{return new Promise((resolve,reject)=>{const id=++this.sequence;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,...data});});}
 async search(query='',offset=0,limit=25,keyword='') {
  await this.ready;
  const result=await this.request({kind:'search',query,offset,limit,keyword});
  return {items:result.ids.map((id:number)=>this.bindings[id]),offset,limit,hasNext:result.hasNext,total:result.total,indexedTotal:this.bindings.length};
 }
 async close(){for(const job of this.pending.values())job.reject(new Error('Workspace changed. Retry the search.'));this.pending.clear();await this.worker.terminate();}
}
