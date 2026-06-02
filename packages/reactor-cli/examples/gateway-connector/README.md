# gateway-connector example

A help-desk **gateway** (`inbox`) fed by a built-in **`static` connector**, plus a
**responsibility** (`digest`) that subscribes to the accepted-ticket set.

This shows the connector's three pieces in action — `fetch` (the static list) →
`extract` (each ticket keyed by `id`) → `stage` (write the arrival into the
gateway's truth before the wake) — and the durable idempotency cursor that dedups
re-polls and survives restarts.

## Offline (no key needed)

```sh
reactor doctor                 # sandbox none, IR absent, state-dir writable
reactor compile --check        # exits 1 (stale): recognized, not yet compiled
```

## Live (needs OPENROUTER_API_KEY + @openai/agents + zod)

```sh
reactor compile                # compile the gateway + responsibility -> IR cache
reactor topology               # the compiled DAG (inbox -> digest)
reactor serve --http 8080      # boot the host; the static connector ingests the 3 tickets
# in another shell:
reactor receipts list          # see the gateway + digest receipts
reactor receipts cost          # cost rolled up by surprise_cause
```

Poll the gateway again and nothing re-ingests (the cursor deduped the 3 tickets);
add a 4th item to `reactor.yml` and only that new ticket is staged.
