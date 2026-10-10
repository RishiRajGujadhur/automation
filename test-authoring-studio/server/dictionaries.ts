import { SaxesParser } from 'saxes';
import type { DictionaryEntry } from '../src/types.js';
export const normalizeXRef=(value:string)=>value.toLowerCase().replace(/[\s/()]/g,'');
export function locatorCode(type:string,value:string){
 const v=JSON.stringify(value);const t=type.toLowerCase();
 if(t==='testid')return `Page.GetByTestId(${v})`;
 if(t==='text')return `Page.GetByText(${v}, new() { Exact = true })`;
 if(t==='css')return `Page.Locator(${v})`;
 if(t==='xpath')return `Page.Locator(${JSON.stringify('xpath='+value)})`;
 const roles:Record<string,string>={textbox:'Textbox',combobox:'Combobox',button:'Button',link:'Link',checkbox:'Checkbox',radio:'Radio',option:'Option',tab:'Tab',menuitem:'Menuitem',heading:'Heading'};
 if(t.startsWith('ariarole.')&&roles[t.slice(9)])return `Page.GetByRole(AriaRole.${roles[t.slice(9)]}, new() { Name = ${v}, Exact = true })`;
 return null;
}
export function parseDictionary(source:string,file:string):DictionaryEntry[]{
 const parser=new SaxesParser({xmlns:false});const entries:DictionaryEntry[]=[];
 let page='',section='',field:DictionaryEntry|undefined,selector:{type:string;value:string;line:number}|undefined;
 parser.on('opentag',node=>{
  const attr=(key:string)=>String(node.attributes[key]??'');
  if(node.name==='Page')page=attr('name')||attr('Name');
  if(node.name==='Section')section=attr('XRefCode');
  if(node.name==='Field')field={id:`${file}:${parser.line}`,file,line:parser.line,page,section,field:attr('XRefCode'),fieldType:attr('Type'),selectors:[]};
  if(node.name==='Selector'&&field)selector={type:attr('Type'),value:'',line:parser.line};
 });
 const text=(value:string)=>{if(selector)selector.value+=value;};parser.on('text',text);parser.on('cdata',text);
 parser.on('closetag',node=>{
  if(node.name==='Selector'&&selector&&field){const value=selector.value.trim();const code=locatorCode(selector.type,value);field.selectors.push({...selector,value,code,supported:!!code,warnings:[...(/nth-child|nth-of-type| > .* > /.test(value)?['Brittle positional/CSS chain selector.']:[]),...(selector.type==='xpath'?['XPath requires a documented exception.']:[])]});selector=undefined;}
  if(node.name==='Field'&&field){entries.push(field);field=undefined;}
  if(node.name==='Section')section='';if(node.name==='Page')page='';
 });parser.write(source).close();return entries;
}
