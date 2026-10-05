/** Run every installed-data simulation probe; new *-probe.ts files join automatically. */
import {existsSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let filter='',report:string|undefined,list=false;
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
 const arg=args[i];
 if(arg==='--list')list=true;
 else if((arg==='--filter'||arg==='--report')&&args[i+1]&&!args[i+1]!.startsWith('--')){
  if(arg==='--filter')filter=args[++i]!;else report=resolve(args[++i]!);
 }else{console.error('Usage: npm run audit:sim -- [--list] [--filter name] [--report /path/report.json]');process.exit(2);}
}
const probes=readdirSync(join(root,'tools')).filter(name=>name.endsWith('-probe.ts')&&name.includes(filter)).sort();
if(!probes.length){console.error(`No simulation probes match ${JSON.stringify(filter)}.`);process.exit(2);}
if(list){console.log(probes.join('\n'));process.exit(0);}
const assets=join(root,'Toy Story 2');
if(!existsSync(join(assets,'toy2.exe'))||!existsSync(join(assets,'data','rand.dat'))){
 console.error('The simulation audit requires your local game install at "Toy Story 2/" in the repository. Assets are read locally and are never uploaded.');process.exit(2);
}
const started=Date.now(),results:{probe:string;passed:boolean;durationMs:number;exitCode:number|null;failure?:string}[]=[];
console.log(`Running ${probes.length} simulation probes against the local install.`);
for(const probe of probes){
 const begin=Date.now(),run=spawnSync(process.execPath,['--import','tsx',join(root,'tools',probe),assets],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 const passed=run.status===0&&!run.error&&!run.signal;
 const failure=passed?undefined:[run.error?.message,run.signal?`Terminated by ${run.signal}`:undefined,run.stdout,run.stderr].filter(Boolean).join('\n');
 const result={probe,passed,durationMs:Date.now()-begin,exitCode:run.status,...(failure?{failure}:{})};results.push(result);
 console.log(`${passed?'PASS':'FAIL'} ${probe} (${result.durationMs} ms)`);
 if(failure)console.error(failure);
 if(run.error&&['EPERM','EACCES','ENOENT'].includes((run.error as NodeJS.ErrnoException).code??'')){
  console.error('Cannot launch probes in this environment; stopping without treating unrun probes as game failures.');break;
 }
}
const failed=results.filter(r=>!r.passed),summary={total:probes.length,completed:results.length,notRun:probes.length-results.length,passed:results.length-failed.length,failed:failed.length,durationMs:Date.now()-started};
if(report)writeFileSync(report,JSON.stringify({summary,results},null,2)+'\n');
console.log(`Simulation audit: ${summary.passed}/${summary.total} passed; ${summary.failed} failed; ${summary.notRun} not run (${(summary.durationMs/1000).toFixed(1)} s).`);
if(failed.length)console.error('Failed probes: '+failed.map(r=>r.probe).join(', '));
process.exitCode=failed.length?1:0;
