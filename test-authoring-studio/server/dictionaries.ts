import { SaxesParser } from 'saxes';
import type { Action, DictionaryEntry } from '../src/types.js';
export const normalizeXRef=(value:string)=>value.toLowerCase().replace(/[\s/()]/g,'');
const roles:Record<string,string>={textbox:'Textbox',combobox:'Combobox',button:'Button',link:'Link',checkbox:'Checkbox',radio:'Radio',option:'Option',tab:'Tab',menuitem:'Menuitem',heading:'Heading'};
export const supportedRoles=Object.keys(roles);
export function locatorCode(type:string,value:string){
 const v=JSON.stringify(value);const t=type.toLowerCase();
 if(t==='testid')return `Page.GetByTestId(${v})`;
 if(t==='text')return `Page.GetByText(${v}, new() { Exact = true })`;
 if(t==='css')return `Page.Locator(${v})`;
 if(t==='xpath')return `Page.Locator(${JSON.stringify('xpath='+value)})`;
 if(t.startsWith('ariarole.')&&roles[t.slice(9)])return `Page.GetByRole(AriaRole.${roles[t.slice(9)]}, new() { Name = ${v}, Exact = true })`;
 return null;
}
/** Rule priority (lower is better): testid, role, text, css id, other css, xpath. */
export function selectorRank(type:string,value:string){
 const t=type.toLowerCase();
 if(t==='testid')return 1;if(t.startsWith('ariarole.'))return 2;if(t==='text')return 3;
 if(t==='css')return /^#[\w-]+$/.test(value.trim())?4:5;if(t==='xpath')return 6;return 9;
}
export function selectorWarnings(type:string,value:string){
 const w:string[]=[];
 if(/nth-child|nth-of-type/.test(value)||/(\s*>\s*[^>]+){2,}/.test(value))w.push('Brittle positional/CSS chain selector.');
 if(type.toLowerCase()==='xpath')w.push('XPath requires a documented exception.');
 if(/[a-f0-9]{8,}|\b(ember|react|mui|ng)-?\d+|_\d{3,}/i.test(value)&&!['testid','text'].includes(type.toLowerCase())&&!type.toLowerCase().startsWith('ariarole.'))w.push('Looks like a generated/session-specific id.');
 return w;
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
  if(node.name==='Selector'&&selector&&field){const value=selector.value.trim();const code=locatorCode(selector.type,value);field.selectors.push({...selector,value,code,supported:!!code,warnings:selectorWarnings(selector.type,value)});selector=undefined;}
  if(node.name==='Field'&&field){entries.push(field);field=undefined;}
  if(node.name==='Section')section='';if(node.name==='Page')page='';
 });parser.write(source).close();return entries;
}
export function findEntry(entries:DictionaryEntry[],page:string,section:string,field:string){
 const [p,s,f]=[page,section,field].map(normalizeXRef);
 return entries.find(e=>normalizeXRef(e.section)===s&&normalizeXRef(e.field)===f&&(!p||!e.page||normalizeXRef(e.page)===p));
}
export type FieldProposal={page:string;section:string;field:string;fieldType:string;selectors:{type:string;value:string}[]};
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fieldXml=(f:FieldProposal,indent:string)=>`${indent}<Field XRefCode="${esc(normalizeXRef(f.field))}" Type="${esc(f.fieldType)}">\n${f.selectors.map(s=>`${indent}  <Selector Type="${esc(s.type)}">${esc(s.value)}</Selector>`).join('\n')}\n${indent}</Field>`;
/** Close-tag offset for the element whose open tag starts at `start` (non-nested same-name elements). */
const closeOf=(source:string,name:string,start:number)=>{const i=source.indexOf(`</${name}>`,start);return i<0?-1:i;};
const indentAt=(source:string,offset:number)=>{const line=source.slice(source.lastIndexOf('\n',offset-1)+1,offset);return /^\s*$/.test(line)?line:'';};
/**
 * Merge proposals into dictionary XML as text so existing order, comments and formatting are untouched.
 * New selectors are appended after existing ones; nothing is reordered or removed.
 */
export function mergeDictionary(source:string,proposals:FieldProposal[]){
 let xml=source.trim()?source:`<?xml version="1.0" encoding="utf-8"?>\n<Page name="${esc(proposals[0]?.page??'Page')}">\n</Page>\n`;
 const changes:string[]=[];
 for(const p of proposals){
  const entries=parseDictionary(xml,'merge');const existing=findEntry(entries,'',p.section,p.field);
  if(existing){
   const fresh=p.selectors.filter(s=>!existing.selectors.some(e=>e.type.toLowerCase()===s.type.toLowerCase()&&e.value===s.value));
   if(!fresh.length){changes.push(`${p.section}/${p.field}: already present`);continue;}
   const fieldRe=new RegExp(`<Field\\b[^>]*XRefCode="([^"]*)"`,'g');let m:RegExpExecArray|null,at=-1;
   let sectionStart=sectionOffset(xml,p.section);
   fieldRe.lastIndex=sectionStart<0?0:sectionStart;
   while((m=fieldRe.exec(xml))){if(normalizeXRef(m[1])===normalizeXRef(p.field)){at=m.index;break;}}
   if(at<0)throw new Error(`Field ${p.field} could not be located for a text merge; edit it manually.`);
   const close=closeOf(xml,'Field',at);const indent=indentAt(xml,close)+'  ';
   xml=xml.slice(0,close).replace(/\s*$/,'\n')+fresh.map(s=>`${indent}<Selector Type="${esc(s.type)}">${esc(s.value)}</Selector>`).join('\n')+'\n'+indentAt(xml,close)+xml.slice(close);
   changes.push(`${p.section}/${p.field}: appended ${fresh.length} selector(s)`);continue;
  }
  const sectionStart=sectionOffset(xml,p.section);
  if(sectionStart>=0){
   const close=closeOf(xml,'Section',sectionStart);const indent=indentAt(xml,close);
   xml=xml.slice(0,close).replace(/\s*$/,'\n')+fieldXml(p,indent+'  ')+'\n'+indent+xml.slice(close);
   changes.push(`${p.section}/${p.field}: new field`);continue;
  }
  const close=xml.lastIndexOf('</Page>');if(close<0)throw new Error('Dictionary has no <Page> root; add the entry manually.');
  const indent=indentAt(xml,close)+'  ';
  xml=xml.slice(0,close).replace(/\s*$/,'\n')+`${indent}<Section XRefCode="${esc(normalizeXRef(p.section))}">\n${fieldXml(p,indent+'  ')}\n${indent}</Section>\n`+indentAt(xml,close)+xml.slice(close);
  changes.push(`${p.section}/${p.field}: new section and field`);
 }
 parseDictionary(xml,'validate');
 return {xml,changes};
}
function sectionOffset(xml:string,section:string){
 const re=/<Section\b[^>]*XRefCode="([^"]*)"/g;let m:RegExpExecArray|null;
 while((m=re.exec(xml)))if(normalizeXRef(m[1])===normalizeXRef(section))return m.index;return -1;
}
const fieldTypes:Record<string,string>={textbox:'TextBox',combobox:'ComboBox',button:'Button',link:'Link',checkbox:'CheckBox',radio:'RadioButton'};
/** PascalCase field name from recorded accessible name, e.g. "Email address" -> "EmailAddress". */
export const fieldName=(s:string)=>s.replace(/[^A-Za-z0-9]+/g,' ').trim().split(' ').filter(Boolean).slice(0,6).map(w=>w[0].toUpperCase()+w.slice(1)).join('')||'Field';
/** Candidate selectors in rule order: testid → role+name → text. Never invents CSS/XPath. */
export function proposeField(action:Action,page:string,section:string):FieldProposal|undefined{
 const t=action.target;if(!t||action.action==='goto')return;
 const selectors:{type:string;value:string}[]=[];
 if(t.testId)selectors.push({type:'testid',value:t.testId});
 const role=t.role?.toLowerCase();
 if(role&&t.name&&roles[role])selectors.push({type:`ariarole.${role}`,value:t.name});
 if(t.name&&['link','button'].includes(role??'')&&t.name.length<=60)selectors.push({type:'text',value:t.name});
 if(!selectors.length)return;
 return {page,section,field:fieldName(t.name||t.testId||'Field'),fieldType:fieldTypes[role??'']??(action.action==='fill'?'TextBox':'Button'),selectors};
}
