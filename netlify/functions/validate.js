import { Buffer } from "buffer";

/**
 * MWAL Validator (Netlify Function)
 * - Statless: valide une chaîne v2 et renvoie un verdict + stats
 * - Règle vitesse: REFUS si moyenne globale < 4000ms (par défaut)
 *
 * Variables Netlify:
 *  - VAL_ID = VAL-A (ou VAL-B, VAL-C)
 *
 * Déployez 3 sites Netlify identiques (A/B/C) pour obtenir un quorum 2/3.
 */

const EXPECTED_MS = 4000;
const TOLERANCE_MS = 300;

function simpleHash(str){
  let h = 0;
  for(let i=0;i<str.length;i++){
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16);
}

function toBigIntStrict(x){
  if(typeof x === "bigint") return x;
  if(typeof x === "number" && Number.isInteger(x)) return BigInt(x);
  if(typeof x === "string" && /^-?\d+$/.test(x.trim())) return BigInt(x.trim());
  throw new Error("BigInt invalide");
}

function computeHashV2(b){
  const data = [
    b.index, b.timestamp, b.minerId, b.workUnits, b.difficulty,
    b.rewardAtoms, b.remainderOut, b.prevHash, b.nonce
  ].join("|");
  return simpleHash(data);
}

function computeRewardAtomsWithCarry(workUnits, difficulty, carry, rewardBaseAtoms, rewardDivisor){
  const wu = BigInt(workUnits);
  const diff = BigInt(difficulty);
  const numerator = wu * rewardBaseAtoms * diff + carry;
  const rewardAtoms = numerator / rewardDivisor;
  const remainderOut = numerator % rewardDivisor;
  return { rewardAtoms, remainderOut };
}

function analyzeSpeed(chain){
  const t0 = Date.parse(chain[0]?.timestamp);
  const tn = Date.parse(chain[chain.length-1]?.timestamp);
  const totalMs = (Number.isFinite(t0) && Number.isFinite(tn) && tn > t0) ? (tn - t0) : null;
  const impliedAvg = (totalMs && chain.length > 1) ? (totalMs / (chain.length - 1)) : null;
  if(impliedAvg !== null && impliedAvg < EXPECTED_MS){
    throw new Error(`AVG_TOO_FAST:${Math.round(impliedAvg)}`);
  }
  return { impliedAvg, totalMs };
}

function validateChainV2(meta){
  if(!meta || typeof meta !== "object") throw new Error("BAD_JSON");
  if(meta.protocolVersion !== 2) throw new Error("BAD_PROTOCOL");
  if(meta.unit !== "ATOMS") throw new Error("BAD_UNIT");
  if(!Array.isArray(meta.chain) || meta.chain.length < 1) throw new Error("BAD_CHAIN");

  const chain = meta.chain;

  const atomsPerMWAL = toBigIntStrict(meta.atomsPerMWAL ?? "100000000");
  const rewardBaseAtoms = toBigIntStrict(meta.rewardBaseAtoms ?? atomsPerMWAL.toString());
  const rewardDivisor = toBigIntStrict(meta.rewardDivisor ?? "144000");

  const g = chain[0];
  if(g.index !== 0) throw new Error("GENESIS_INDEX");
  if(g.prevHash !== "0") throw new Error("GENESIS_PREV");
  if(computeHashV2(g) !== g.hash) throw new Error("GENESIS_HASH");

  let carry = 0n;
  for(let i=1;i<chain.length;i++){
    const b = chain[i];
    const p = chain[i-1];

    if(b.index !== p.index + 1) throw new Error("BAD_INDEX");
    if(b.prevHash !== p.hash) throw new Error("BAD_PREVHASH");
    if(new Date(b.timestamp) <= new Date(p.timestamp)) throw new Error("BAD_TIME");

    const { rewardAtoms, remainderOut } = computeRewardAtomsWithCarry(
      b.workUnits, b.difficulty, carry, rewardBaseAtoms, rewardDivisor
    );

    if(toBigIntStrict(b.rewardAtoms) !== rewardAtoms) throw new Error("BAD_REWARD");
    if(toBigIntStrict(b.remainderOut) !== remainderOut) throw new Error("BAD_CARRY");
    if(computeHashV2(b) !== b.hash) throw new Error("BAD_HASH");

    carry = remainderOut;
  }

  const speed = analyzeSpeed(chain);

  const walletId = meta.walletId || meta.minerId || meta.ownerId || null;
  if(!walletId) throw new Error("NO_WALLET_ID");

  return {
    validatorId: process.env.VAL_ID || "VAL-?",
    protocol: 2,
    valid: true,
    walletId: String(walletId),
    lastHash: String(chain[chain.length-1].hash).toLowerCase(),
    blocks: chain.length,
    avgMs: speed.impliedAvg ? Math.round(speed.impliedAvg) : null,
    ts: new Date().toISOString()
  };
}

export async function handler(event){
  try{
    const meta = JSON.parse(event.body || "{}");
    const res = validateChainV2(meta);
    return { statusCode: 200, body: JSON.stringify(res) };
  }catch(e){
    return { statusCode: 400, body: JSON.stringify({ valid:false, validatorId: process.env.VAL_ID || "VAL-?", error: String(e.message || e) }) };
  }
}
