import { useEffect, useState } from 'react';
import type { StepPage } from './types';
export function useStepSearch(query:string,offset=0,limit=25,keyword='',revision=''){
 const [data,setData]=useState<StepPage>({items:[],offset:0,limit,hasNext:false,total:0,indexedTotal:0});const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');const timer=setTimeout(async()=>{try{const r=await fetch('/api/steps?'+new URLSearchParams({q:query,offset:String(offset),limit:String(limit),keyword}),{signal:controller.signal});const value=await r.json();if(!r.ok)throw new Error(value.error);if(!controller.signal.aborted)setData(value);}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setLoading(false);}},query?180:0);return()=>{clearTimeout(timer);controller.abort();};},[query,offset,limit,keyword,revision]);
 return {data,loading,error};
}
