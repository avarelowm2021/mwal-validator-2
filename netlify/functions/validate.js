/**
 * MWAL Validator – Netlify Function
 * Refuse si la moyenne globale de minage < 4000 ms
 */

const EXPECTED_MS = 4000;

function simpleHash(str){
  let h = 0;
  for(let i = 0; i < str.length; i++){
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16);
}

function computeHashV2(b){
  return simpleHash([
    b.index,
    b.timestamp,
    b.minerId,
    b.workUnits,
    b.difficulty,
    b.rewardAtoms,
    b.remainderOut,
    b.prevHash,
    b.nonce
  ].join("|"));
}

function analyzeSpeed(chain){
  if(chain.length < 2) return null;
  const t0 = Date.parse(chain[0].timestamp);
  const tn = Date.parse(chain[chain.length - 1].timestamp);
  const avg = (tn - t0) / (chain.length - 1);
  if(avg < EXPECTED_MS){
    throw new Error("AVG_TOO_FAST");
  }
  return Math.round(avg);
}

function validateChainV2(meta){
  if(!meta || meta.protocolVersion !== 2) throw new Error("BAD_PROTOCOL");
  if(!Array.isArray(meta.chain) || meta.chain.length < 1) throw new Error("BAD_CHAIN");

  const chain = meta.chain;

  // Genesis
  if(chain[0].index !== 0) throw new Error("BAD_GENESIS");
  if(chain[0].prevHash !== "0") throw new Error("BAD_GENESIS_PREV");
  if(computeHashV2(chain[0]) !== chain[0].hash) throw new Error("BAD_GENESIS_HASH");

  for(let i = 1; i < chain.length; i++){
    const b = chain[i];
    const p = chain[i - 1];

    if(b.index !== p.index + 1) throw new Error("BAD_INDEX");
    if(b.prevHash !== p.hash) throw new Error("BAD_PREVHASH");
    if(computeHashV2(b) !== b.hash) throw new Error("BAD_HASH");
    if(Date.parse(b.timestamp) <= Date.parse(p.timestamp)) throw new Error("BAD_TIME");
  }

  const avgMs = analyzeSpeed(chain);

  return {
    walletId: meta.walletId || meta.minerId || "UNKNOWN",
    lastHash: chain[chain.length - 1].hash,
    blocks: chain.length,
    avgMs
  };
}

export async function handler(event){
  try{
    const meta = JSON.parse(event.body || "{}");
    const res = validateChainV2(meta);

    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        protocol: 2,
        validatorId: process.env.VAL_ID || "VAL-?",
        walletId: res.walletId,
        lastHash: res.lastHash,
        blocks: res.blocks,
        avgMs: res.avgMs,
        ts: new Date().toISOString()
      })
    };

  }catch(e){
    return {
      statusCode: 400,
      body: JSON.stringify({
        valid: false,
        validatorId: process.env.VAL_ID || "VAL-?",
        error: e.message
      })
    };
  }
}
