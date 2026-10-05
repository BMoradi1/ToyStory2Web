/** Run all browser flow checks in disposable Chromium sessions. Requires npm run dev. */
import {existsSync,mkdirSync,mkdtempSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let filter='',output:string|undefined,list=false;
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
 const arg=args[i];
 if(arg==='--list')list=true;
 else if((arg==='--filter'||arg==='--output')&&args[i+1]&&!args[i+1]!.startsWith('--')){
  if(arg==='--filter')filter=args[++i]!;else output=resolve(args[++i]!);
 }else{console.error('Usage: npm run audit:browser -- [--list] [--filter name] [--output /path/artifacts]');process.exit(2);}
}
const flows=readdirSync(join(root,'tools')).filter(name=>name.endsWith('-flow-check.js')&&name.includes(filter)).sort();
if(!flows.length){console.error(`No browser flows match ${JSON.stringify(filter)}.`);process.exit(2);}
if(list){console.log(flows.join('\n'));process.exit(0);}
const assets=join(root,'Toy Story 2');
if(!existsSync(join(assets,'toy2.exe'))){console.error('Install your game locally at "Toy Story 2/" in the repository before running the browser audit.');process.exit(2);}
const baseUrl=process.env.BASE_URL??'http://localhost:5173/';
try{const response=await fetch(baseUrl,{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error(`HTTP ${response.status}`);}
catch(error){console.error(`Viewer unavailable at ${baseUrl}. Start npm run dev or set BASE_URL. ${String(error)}`);process.exit(2);}
const directory=output??mkdtempSync(join(tmpdir(),'toystory-browser-audit-'));mkdirSync(directory,{recursive:true});
const started=Date.now(),results:{flow:string;passed:boolean;durationMs:number;exitCode:number|null;log:string;screenshot?:string;error?:string}[]=[];
function report(){const failed=results.filter(r=>!r.passed).length;const summary={total:flows.length,completed:results.length,notRun:flows.length-results.length,passed:results.length-failed,failed,durationMs:Date.now()-started};writeFileSync(join(directory,'report.json'),JSON.stringify({baseUrl,summary,results},null,2)+'\n');return summary;}
console.log(`Running ${flows.length} browser flows at ${baseUrl}. Artifacts: ${directory}`);report();
for(const flow of flows){
 const stem=flow.replace(/\.js$/,''),log=join(directory,stem+'.log'),screenshot=join(directory,stem+'.png'),begin=Date.now();
 // The harness has its own 300-second deadline and always closes Chromium.
 const run=spawnSync(process.execPath,['--import','tsx',join(root,'tools','browser-shot.ts'),assets,screenshot,'--eval-file',join(root,'tools',flow),'--user-gesture'],{cwd:root,encoding:'utf8',timeout:330000,maxBuffer:8*1024*1024,env:{...process.env,BASE_URL:baseUrl}});
 const passed=run.status===0&&!run.error&&!run.signal;
 const error=run.error?.message??(run.signal?`Terminated by ${run.signal}`:undefined);
 writeFileSync(log,[run.stdout,run.stderr,error].filter(Boolean).join('\n'));
 results.push({flow,passed,durationMs:Date.now()-begin,exitCode:run.status,log,...(passed&&existsSync(screenshot)?{screenshot}:{}),...(error?{error}:{})});report();
 console.log(`${passed?'PASS':'FAIL'} ${flow} (${((Date.now()-begin)/1000).toFixed(1)} s)`);
 if(!passed)console.error(`  Diagnostics: ${log}`);
 if(run.error&&['EPERM','EACCES','ENOENT'].includes((run.error as NodeJS.ErrnoException).code??'')){console.error('Cannot launch browser checks; remaining flows were not run.');break;}
}
const summary=report();console.log(`Browser audit: ${summary.passed}/${summary.total} passed; ${summary.failed} failed; ${summary.notRun} not run. Report: ${join(directory,'report.json')}`);
process.exitCode=summary.failed||summary.notRun?1:0;
