// Desired product assertions. Baseline failures are classified by run_review_matrix.mjs.
const {test}=require('node:test'),assert=require('node:assert/strict'),{cases}=require('./lib/cases');
for(const c of cases)test(c.id,async t=>{const r=await c.run();t.diagnostic(JSON.stringify({id:c.id,witness:r.witness,signature:r.signature}));assert.ok(r.ok,r.signature);});
