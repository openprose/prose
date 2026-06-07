# SURPRISE-COST benchmark — measured result

> **At lambda=1%, Reactor spends ~173.71x fewer fresh tokens than an equal-correctness cron (240 vs 41690 fresh); Reactor's per-tick spend scales ~linearly through the origin with the material-change rate (slope=30 fresh/material-tick, intercept~0, p=0.0001) while the cron's stays flat (slope=-0.5696, intercept~41.6946).**

- prereg hash: `b0490e56158bec486631f6310cab5b689cdca7e1fe5063697863d77235f20a58`
- model pin: `openrouter:openai/gpt-5.4-mini (live cell only; offline uses deterministic-cost-v1)`
- null "spend tracks wall-clock/event-count" rejected: **true**

## Fresh-token spend by contestant and lambda

| contestant | provenance | lambda | fresh | correct | equal-correctness | reportable |
|---|---|---|---|---|---|---|
| reactor | runtime-reactor | 0% | 30 | 100% | true | true |
| reactor | runtime-reactor | 1% | 240 | 100% | true | true |
| reactor | runtime-reactor | 10% | 3646 | 100% | true | true |
| reactor | runtime-reactor | 50% | 16842 | 100% | true | true |
| reactor | runtime-reactor | 100% | 33604 | 100% | true | true |
| oracle-cron | naive-control | 0% | 41690 | 100% | true | true |
| oracle-cron | naive-control | 1% | 41690 | 100% | true | true |
| oracle-cron | naive-control | 10% | 43208 | 100% | true | true |
| oracle-cron | naive-control | 50% | 45308 | 100% | true | true |
| oracle-cron | naive-control | 100% | 45563 | 100% | true | true |
| content-cache | naive-control | 0% | 37206 | 100% | true | true |
| content-cache | naive-control | 1% | 37353 | 100% | true | true |
| content-cache | naive-control | 10% | 39946 | 100% | true | true |
| content-cache | naive-control | 50% | 49961 | 100% | true | true |
| content-cache | naive-control | 100% | 61879 | 100% | true | true |
| no-memo-reactor | no-memo-simulation | 0% | 41691 | 100% | true | true |
| no-memo-reactor | no-memo-simulation | 1% | 41691 | 100% | true | true |
| no-memo-reactor | no-memo-simulation | 10% | 43209 | 100% | true | true |
| no-memo-reactor | no-memo-simulation | 50% | 45309 | 100% | true | true |
| no-memo-reactor | no-memo-simulation | 100% | 45563 | 100% | true | true |
| byte-diff | naive-control | 0% | 37206 | 100% | true | true |
| byte-diff | naive-control | 1% | 37353 | 100% | true | true |
| byte-diff | naive-control | 10% | 39946 | 100% | true | true |
| byte-diff | naive-control | 50% | 49961 | 100% | true | true |
| byte-diff | naive-control | 100% | 61879 | 100% | true | true |
| react-loop | naive-control | 0% | 41690 | 100% | true | true |
| react-loop | naive-control | 1% | 41690 | 100% | true | true |
| react-loop | naive-control | 10% | 43208 | 100% | true | true |
| react-loop | naive-control | 50% | 45308 | 100% | true | true |
| react-loop | naive-control | 100% | 45563 | 100% | true | true |

## Headline folds (Reactor vs equal-correctness cron)

| lambda | reactor fresh | cron fresh | fold | equal-correctness |
|---|---|---|---|---|
| 0% | 30 | 41690 | 1389.67x | true |
| 1% | 240 | 41690 | 173.71x | true |
| 10% | 3646 | 43208 | 11.85x | true |
| 50% | 16842 | 45308 | 2.69x | true |
| 100% | 33604 | 45563 | 1.36x | true |

## Regression (pooled per-tick fresh ~ preregistered materiality)

| contestant | slope (fresh/material-tick) | intercept (fresh/immaterial-tick) | p-value | rejects null |
|---|---|---|---|---|
| reactor | 30 | 0 | 0.0001 | true |
| oracle-cron | -0.5696 | 41.6946 | 0.063094 | false |
| content-cache | 21.3175 | 37.1825 | 0.0001 | true |
| no-memo-reactor | -0.5706 | 41.6956 | 0.062494 | false |
| byte-diff | 21.3175 | 37.1825 | 0.0001 | true |
| react-loop | -0.5696 | 41.6946 | 0.063094 | false |

## Hero figure (cumulative fresh over time)

At lambda=10% — *both held at equal correctness against ground truth*. Reactor flattens as the world goes quiet; the cron is a straight diagonal.

```
|                      CC
|                   CCC  
|                CCC     
|            CCCC        
|         CCC            
|      CCC               
|  CCCC              RRRR
|RRRRRRRRRRRRRRRRRRRR    
+------------------------  (R=reactor  C=cron;  y=cumulative fresh, x=time)
```

## Baseline coincidences (honesty note)

In this offline model some baselines collapse onto the same fresh-cost vector — they are NOT independent corroboration:

- **oracle-cron == react-loop**
- **content-cache == byte-diff**

`oracle-cron == react-loop` because both re-derive every node every tick (a wall-clock heartbeat IS a cron here). `byte-diff == content-cache` because the generated tape has no exact-duplicate or whitespace-only churn for the content-cache to catch that byte-diff misses; the silent-staleness regime (where content-cache goes BLIND, not merely wasteful) and a duplicate-on-second-wire churn variant separate them — both are follow-on work (the freshness sub-track + a churn-variant generator).

## Limitations (report section 9)

- **Deterministic-cost surrogate.** The offline ledger uses a preregistered byte-length token surrogate (`deterministic-cost-v1`), not a live model bill. The real N=1 live run (U10) is the dollar-grade ledger; it is **blocked in this build** pending `OPENROUTER_API_KEY` (see `src/live/run.cjs`).
- **Null signer (v1).** Receipts are tamper-evident, not tamper-proof; the cryptographic byte-hash signer is BACKLOG `C3`.
- **No-cheap-hash domain.** Where no cheap material hash exists, Reactor degrades to a forecast cadence — reported as an honest TIE, not a win.
- **Staggered-diamond topology (MK-1).** Deliberately excluded from the headline world; the FIFO drain glitch is a separate, named limitation, not gated on here.
