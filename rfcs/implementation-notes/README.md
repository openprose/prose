# Implementation Notes

These notes are an implementation diary. They are useful evidence, but many
early entries describe intermediate commands or runtime names that have since
been superseded.

Current implementation guidance lives in:

- `../README.md`
- `../014-company-example-backpressure/`
- `../015-public-oss-hardening/TODO.md`
- `../../docs/what-shipped.md`
- `../../docs/inference-examples.md`

When an older note mentions `materialize`, fixture providers, local-process
providers, direct OpenRouter/OpenAI-compatible providers, or flat provider
selection flags, read it as history. The current runtime vocabulary is:

- graph VM: `pi`
- node runner: per-node execution adapter
- model provider: OpenRouter or another inference provider inside the Pi
  runtime profile
- deterministic fixture: scripted Pi-shaped node runner selected by
  `--output`
