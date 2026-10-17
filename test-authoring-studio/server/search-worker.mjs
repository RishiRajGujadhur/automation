import { parentPort } from 'node:worker_threads';
import { Index } from 'flexsearch';
// collection -> facet -> { index, order }
const collections = new Map();
// Small, explicit action vocabulary. This is deterministic lexical expansion, not AI inference.
const aliases = { searches:'search', searching:'search', searched:'search', lookup:'search', find:'search', clicks:'click', clicked:'click', clicking:'click', tap:'click', fills:'fill', filled:'fill', filling:'fill', enters:'enter', entered:'enter', entering:'enter', types:'enter', typing:'enter', login:'signin', authenticated:'signin', opens:'open', opened:'open', opening:'open', navigates:'open', navigation:'open' };
function normalize(text) { return text.replace(/([a-z])([A-Z])/g,'$1 $2').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).map(t=>aliases[t]??t).join(' '); }
const COUNT_CAP = 100000;
parentPort.on('message', ({id,kind,collection='steps',documents,query='',facet='',offset=0,limit=25}) => {
 try {
  if(kind==='init') {
   const facets=new Map();
   const bucket=key=>{if(!facets.has(key))facets.set(key,{index:new Index({tokenize:'forward',cache:100,resolution:9}),order:[]});return facets.get(key);};
   bucket('');
   for(const doc of documents) for(const key of new Set(['',...[doc.facet??''].flat()])) { const b=bucket(key);b.index.add(doc.id,normalize(doc.text));b.order.push(doc.id); }
   collections.set(collection,facets);
   parentPort.postMessage({id,result:true});return;
  }
  const b=collections.get(collection)?.get(facet);
  if(!b){parentPort.postMessage({id,result:{ids:[],hasNext:false,total:0}});return;}
  const normalized=normalize(query).trim();
  if(!normalized){parentPort.postMessage({id,result:{ids:b.order.slice(offset,offset+limit),hasNext:offset+limit<b.order.length,total:b.order.length}});return;}
  // Exact totals: resolve the full (capped) match list once; FlexSearch caches the query.
  const all=b.index.search(normalized,{limit:COUNT_CAP,suggest:true});
  parentPort.postMessage({id,result:{ids:all.slice(offset,offset+limit),hasNext:offset+limit<all.length,total:all.length}});
 } catch(error) { parentPort.postMessage({id,error:error.message}); }
});
