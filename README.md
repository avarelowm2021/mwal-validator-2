# MWAL Validator (Netlify)

## Déploiement (3 validateurs)

1. Crée 3 sites Netlify (VAL-A, VAL-B, VAL-C) à partir de ce dépôt.
2. Dans chaque site: **Site settings → Environment variables**
   - `VAL_ID=VAL-A` (ou VAL-B / VAL-C)

Endpoint:
- `/.netlify/functions/validate`

Le validateur refuse si la **moyenne globale** de minage est < **4000 ms**.

## Réponse
- `{ valid:true, walletId, lastHash, blocks, avgMs, validatorId, ts }`

## Notes sécurité
Cette version est volontairement **simple**: elle ne signe pas les attestations.
Si tu veux des attestations vérifiables hors-ligne, on ajoutera Ed25519 (étape suivante).
