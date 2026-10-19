import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { normalizeDoctrine } from '../src/knowledge/normalize.js';
import { searchDatabase } from '../src/knowledge/database.js';
import { importBook } from '../src/knowledge/books.js';
import { hashBytes } from '../src/knowledge/import.js';
import type { ExtractedBook } from '../src/knowledge/book-types.js';
import type { CorpusPlan, SourceCapture } from '../src/knowledge/types.js';

const bytes=Buffer.from('%PDF-1.7 fixture de origem');
const source: SourceCapture={ id:'livro',kind:'doutrina',title:'Livro de teste',url:'file:///livro.pdf',retrievedAt:'2026-10-18T00:00:00Z',status:'ok',httpStatus:null,bodyHash:hashBytes(bytes),rawFile:'livro-book.body.json',error:null };
const text='Conceito doutrinário verificável de controle social, explicado pelo autor do capítulo. '.repeat(30);
const doc: ExtractedBook={ version:1,extractorSha256:'a'.repeat(64),inputSha256:hashBytes(bytes),inputBytes:bytes.length,format:'pdf',method:'fixture offline',metadata:{title:'Livro',chapters:[{number:1,title:'Capítulo'}]},units:[{format:'pdf',page:27,chapter:'Capítulo I',chapterNumber:1,author:'Autora A',text}],excluded:[] };

test('livros conservam autoria, página física ou seção EPUB e hash sem inventar paginação',()=>{
 const pdf=normalizeDoctrine(doc,source);
 assert.match(pdf[0]!.url,/#page=27$/); assert.equal(pdf[0]!.metadata.pdfPage,27);
 assert.equal(pdf[0]!.metadata.originalHash,hashBytes(bytes));
 assert.equal((pdf[0]!.metadata.bibliography as any).chapters,undefined);
 assert.equal(pdf[0]!.text.slice(-200),pdf[1]!.text.slice(0,200));
 const epub: ExtractedBook={...doc,format:'epub',units:[{format:'epub',chapter:'Clínica',chapterNumber:9,author:'Autor do capítulo',section:'Objeto',sectionId:'s2',path:'OEBPS/CHP009.html',text}]};
 const c=normalizeDoctrine(epub,{...source,url:'file:///livro.epub'})[0]!;
 assert.match(c.locator,/capitulo9!secao1/); assert.equal(c.metadata.author,'Autor do capítulo');
 assert.equal(c.metadata.pdfPage,undefined); assert.match(String(c.metadata.pagination),/sem página/);
 assert.throws(()=>normalizeDoctrine({...doc,inputSha256:'b'.repeat(64)},source),/outra fonte/);
 assert.throws(()=>normalizeDoctrine({...doc,format:'epub'},source));
});

test('filtro por tipo antecede ranking e limite; doutrina não desaparece atrás de normas',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const doctrine=normalizeDoctrine({...doc,units:[{...doc.units[0]!,text:'Controle social '+ 'contexto secundário '.repeat(200)}]},source)[0]!;
  const norms=Array.from({length:100},(_,i)=>({...doctrine,id:`norma${i}`,kind:'norma' as const,sourceId:'normas',locator:`art${i}`,title:'Controle social',text:'Controle social'}));
  db.exec("CREATE TABLE chunks(id TEXT,locator TEXT,data TEXT); CREATE VIRTUAL TABLE chunks_fts USING fts5(title,body);");
  const insert=db.prepare('INSERT INTO chunks(rowid,id,locator,data) VALUES(?,?,?,?)');
  const fts=db.prepare('INSERT INTO chunks_fts(rowid,title,body) VALUES(?,?,?)');
  for(const [index,c] of [...norms,doctrine].entries()){insert.run(index+1,c.id,c.locator,JSON.stringify(c));fts.run(index+1,c.title,c.text);}
  assert.equal(searchDatabase(db,'controle social',10).chunks.some(c=>c.kind==='doutrina'),false);
  assert.deepEqual(searchDatabase(db,'controle social',3,'doutrina').chunks.map(c=>c.id),[doctrine.id]);
  assert.equal(searchDatabase(db,'controle social',3,'precedente').chunks.length,0);
 }finally{db.close();}
});

test('importação local valida bytes, mantém original e extração e recusa sobrescrita',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'books-'));
 const id=`livros-test-${path.basename(dir).toLowerCase()}`;
 const stage=path.resolve('output/knowledge/staging',id);
 try{
  const file=`${dir}/livro.pdf`,extraction=`${dir}/texto.json`,planFile=`${dir}/plan.json`;
  await writeFile(file,bytes);await writeFile(extraction,JSON.stringify(doc));
  const plan: CorpusPlan={version:1,id,cutoff:'2026-10-16',selection:{experiment:'fixture',recordsHash:'fixture',inputHashes:{}},sources:[{id:'livro',kind:'doutrina',title:'Livro',url:pathToFileURL(file).href}],questions:[{id:'Q0001',topics:'Controle',sources:['livro'],articles:{},gaps:[]}]};
  await writeFile(planFile,JSON.stringify(plan,null,2)+'\n');
  await writeFile(file,Buffer.from('arquivo trocado'));
  await assert.rejects(importBook(planFile,'livro',file,extraction),/outro arquivo/);
  await writeFile(file,bytes);
  const result=await importBook(planFile,'livro',file,extraction);
  assert.equal(result.networkCalls,0);
  assert.deepEqual(await readFile(`${stage}/livro-book.body.json`),bytes);
  assert.deepEqual(await readFile(`${stage}/livro-text.body.json`),await readFile(extraction));
  await assert.rejects(importBook(planFile,'livro',file,extraction),/já importado/);
 }finally{await rm(dir,{recursive:true,force:true});await rm(stage,{recursive:true,force:true});}
});
