import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {build}=require(require.resolve('esbuild',{paths:[require.resolve('wrangler')]}));
mkdirSync('.sites-runtime',{recursive:true});
for(const name of ['rich-text','dice']){
 const outfile=`.sites-runtime/${name}-check.mjs`;
 await build({entryPoints:[`tests/${name}.check.${name==='dice'?'ts':'tsx'}`],outfile,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',alias:{'@':process.cwd()}});
 const result=spawnSync(process.execPath,[outfile],{stdio:'inherit'});
 if(result.status)process.exit(result.status);
}
