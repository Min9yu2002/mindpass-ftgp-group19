# MindPass On-Chain TODO

This is the remaining work list after the repository-only integration preparation pass.

## 1. Needs backend / relayer work

- Deploy `MindPassEscrow` to Sepolia.
- Decide the authoritative platform `vault` account model.
- Implement a secure relayer or service path for `fundSubsidyPortion`.
- Decide whether patient booking creation is direct wallet-signed or partially relayed.
- Add replay-safe contract event ingestion.
- Add timeout / no-show automation outside the browser.

## 2. Needs live Supabase access

- Review and manually apply [supabase/migrations/20260318121500_mindpass_onchain_prep.sql](/Users/yu/Documents/Postgrad/FTwDS/FTGP-GP/mindpass-ftgp-group19/supabase/migrations/20260318121500_mindpass_onchain_prep.sql).
- Add RLS / service-role rules for sync workers.
- Decide whether withdrawal hashes stay denormalized on `sessions` or move to a separate ledger table.
- Backfill `settlement_source = 'database'` safely in the target environment.

## 3. Needs indexing / event sync

- Map contract events to session rows using `onchain_session_id`.
- Persist `last_synced_block`, `last_synced_log_index`, and `last_synced_tx_hash`.
- Implement reorg handling and replay-safe upserts.
- Track partial funding events before `SessionFunded`.
- Reconcile on-chain terminal outcomes back into existing dashboard/provider/chat UX.

## 4. Needs frontend rollout work

- Replace DB-first booking writes with contract writes only after indexer + relayer exist.
- Add wallet transaction state UX for request creation, accept, funding, check-in, completion, and withdraw.
- Keep product copy honest until contract-backed settlement is truly active.
- Add chain error handling for user rejection, revert reasons, pending txs, and chain mismatch.

## 5. Hard problems not solved by this prep package

- Live contract address management per environment.
- Vault key management and operational controls.
- Indexer resilience, retries, and event gap recovery.
- Cross-system reconciliation between Supabase, relayer, and chain state.
