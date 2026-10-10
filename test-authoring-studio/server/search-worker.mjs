import { parentPort } from 'node:worker_threads';
import { Index } from 'flexsearch';
const indexes = new Map();
const order = new Map();
// Small, explicit action vocabulary. This is deterministic lexical expansion, not AI inference.
const aliases = { searches:'search', searching:'search', searched:'search', lookup:'search', find:'search', clicks:'click', clicked:'click', clicking:'click', tap:'click', fills:'fill', filled:'fill', filling:'fill', enters:'enter', entered:'enter', entering:'enter', types:'enter', typing:'enter', login:'signin', authenticated:'signin', opens:'open', opened:'open', opening:'open', navigates:'open', navigation:'open' };
function normalize(text) { return text.replace(/([a-z])([A-Z])/g,'$1 $2').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).map(t=>aliases[t]??t).join(' '); }
parentPort.on('message', ({id,kind,documents,query='',keyword='',offset=0,limit=25}) => {
 try {
  if(kind==='init') {
   for(const key of ['', 'Given','When','Then']) { indexes.set(key,new Index({tokenize:'forward',cache:100,resolution:9}));order.set(key,[]); }
   for(const doc of documents) for(const key of ['',doc.keyword]) { if(!indexes.has(key))continue;indexes.get(key).add(doc.id,normalize(doc.text));order.get(key).push(doc.id); }
   parentPort.postMessage({id,result:true});return;
  }
  const normalized=normalize(query).trim();
  const ids=normalized?indexes.get(keyword).search(normalized,{limit:limit+1,offset,suggest:true}):order.get(keyword).slice(offset,offset+limit+1);
  parentPort.postMessage({id,result:{ids:ids.slice(0,limit),hasNext:ids.length>limit,total:normalized?null:order.get(keyword).length}});
 } catch(error) { parentPort.postMessage({id,error:error.message}); }
});
