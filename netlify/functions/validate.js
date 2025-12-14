// ======================================================
// MWAL VALIDATOR v2 — Netlify Function
// Quorum-ready • Speed ≥ 4s • Anti-triche symbolique
// ======================================================

export async function handler(event) {
  try {
    // ---------- Méthode ----------
    if (event.httpMethod !== "POST") {
      return json({
        valid: false,
        validatorId: process.env.VAL_ID || "VAL-?",
        error: "BAD_PROTOCOL"
      });
    }

    // ---------- Parse ----------
    let data;
    try {
      data = JSON.parse(event.body || "{}");
    } catch {
      return refuse("INVALID_JSON");
    }

    // ---------- Vérifications de base ----------
    if (
      data.protocolVersion !== 2 ||
      data.unit !== "ATOMS" ||
      !data.walletId ||
      !Array.isArray(data.chain) ||
      data.chain.length < 2
    ) {
      return refuse("BAD_PROTOCOL");
    }

    const chain = data.chain;

    // ---------- Vérification des blocs ----------
    for (let i = 1; i < chain.length; i++) {
      const prev = chain[i - 1];
      const cur = chain[i];

      if (cur.prevHash !== prev.hash) {
        return refuse("BROKEN_CHAIN");
      }

      const expectedHash = hashBlock(cur);
      if (cur.hash !== expectedHash) {
        return refuse("BAD_HASH");
      }
    }

    // ---------- Vérification vitesse globale ----------
    const t0 = Date.parse(chain[0].timestamp);
    const tn = Date.parse(chain[chain.length - 1].timestamp);

    if (!isFinite(t0) || !isFinite(tn) || tn <= t0) {
      return refuse("BAD_TIME");
    }

    const avgMs = (tn - t0) / (chain.length - 1);

    if (avgMs < 4000) {
      return refuse("AVG_TOO_FAST", { avgMs });
    }

    // ---------- OK ----------
    const lastHash = chain[chain.length - 1].hash;

    return json({
      valid: true,
      validatorId: process.env.VAL_ID || "VAL-?",
      blocks: chain.length,
      avgMs: Math.round(avgMs),
      lastHash
    });

  } catch (e) {
    return json({
      valid: false,
      validatorId: process.env.VAL_ID || "VAL-?",
      error: "INTERNAL_ERROR",
      message: e.message
    });
  }
}

// ======================================================
// Helpers
// ======================================================

function refuse(code, extra = {}) {
  return json({
    valid: false,
    validatorId: process.env.VAL_ID || "VAL-?",
    error: code,
    ...extra
  });
}

function json(obj) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj)
  };
}

function hashBlock(b) {
  const str = [
    b.index,
    b.timestamp,
    b.minerId,
    b.workUnits,
    b.difficulty,
    b.rewardAtoms,
    b.remainderOut,
    b.prevHash,
    b.nonce
  ].join("|");

  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16);
}
