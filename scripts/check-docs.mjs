import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,dirname,extname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const errors=[];
async function walk(dir){const rows=await readdir(resolve(root,dir),{withFileTypes:true});return(await Promise.all(rows.map(row=>row.isDirectory()?walk(dir+'/'+row.name):[dir+'/'+row.name]))).flat();}
const docs=['README.md','CONTRIBUTING.md','CHANGELOG.md',...(await walk('docs')).filter(f=>extname(f)==='.md'),'.github/PULL_REQUEST_TEMPLATE.md'];
let checked=0;
async function checkTarget(from,target){
 if(/^(https?:|mailto:|data:)/i.test(target)||target.startsWith('#'))return;
 if(/^(?:[a-z]:[\\/]|file:|\\\\)/i.test(target)){errors.push(`${from}: local-machine link ${target}`);return;}
 const clean=decodeURIComponent(target.replace(/^<|>$/g,'').split(/[?#]/)[0]);if(!clean)return;
 const absolute=resolve(dirname(resolve(root,from)),clean);
 if(relative(root,absolute).startsWith('..')){errors.push(`${from}: link leaves repository: ${target}`);return;}
 try{await stat(absolute);checked++;}catch{errors.push(`${from}: missing link target ${target}`);}
}
for(const file of docs){
 const source=await readFile(resolve(root,file),'utf8');
 const fences=source.match(/^```/gm)||[];if(fences.length%2)errors.push(`${file}: unclosed code fence`);
 const prose=source.replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm,'');
 if(!file.startsWith('.github/')&&(prose.match(/^# /gm)||[]).length!==1)errors.push(`${file}: expected one top-level heading`);
 for(const match of prose.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g))await checkTarget(file,match[1]);
 for(const match of prose.matchAll(/(?:src|href)="([^"]+)"/g))await checkTarget(file,match[1]);
}
const entry='dist/index.html',html=await readFile(resolve(root,entry),'utf8');
for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g))await checkTarget(entry,match[1]);
const release=(await readFile(resolve(root,'dist/pixel-v2.js'),'utf8')).match(/v\d{4}\.\d{2}\.\d{2}\.\d+/)?.[0];
if(!release||!(await readFile(resolve(root,'README.md'),'utf8')).includes(release))errors.push('README version does not match the current studio status label');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Checked ${docs.length} Markdown files, ${checked} local references and release ${release}.`);
