import {ESLint} from 'eslint';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const eslint=new ESLint();
const file='src/app/App.tsx';
const before=execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'});
// Normalize only shifted line numbers, retaining the full diagnostic and code excerpt.
const summarize=result=>result.messages.map(({ruleId,message,severity})=>({ruleId,message:message.replace(/:\d+:\d+/g,':LINE:COL').replace(/(^|\n)(\s*>?\s*)\d+(\s*\|)/g,'$1$2LINE$3'),severity})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const [base]=await eslint.lintText(before,{filePath:file});
const [current]=await eslint.lintText(readFileSync(file,'utf8'),{filePath:file});
assert.deepEqual(summarize(current),summarize(base),'New lint diagnostics introduced');
console.log(JSON.stringify({file,baselineErrors:base.errorCount,baselineWarnings:base.warningCount,currentErrors:current.errorCount,currentWarnings:current.warningCount,newDiagnostics:0,gate:'full file lint still fails; existing errors are not suppressed'},null,2));
