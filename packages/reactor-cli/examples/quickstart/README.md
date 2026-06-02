# quickstart example

A gateway (`inbox`) + a responsibility (`digest`) — the smallest end-to-end shape
with a real edge. This is what `reactor init` scaffolds.

## Offline (no key needed)

```sh
reactor doctor                 # honest health report (sandbox none, IR absent)
reactor compile --check        # exits 1 (stale): the project is recognized, not yet compiled
```

## Live (needs OPENROUTER_API_KEY + @openai/agents + zod)

```sh
reactor compile                # run the compile sessions -> IR cache
reactor topology               # offline now: the compiled DAG (inbox -> digest)
reactor run                    # boot, drain, print dispositions + cost
reactor status                 # standing compile cost + run cost
```

`digest` subscribes to `inbox`'s `items` facet, so when the inbox set moves the
digest re-renders — and only then.
