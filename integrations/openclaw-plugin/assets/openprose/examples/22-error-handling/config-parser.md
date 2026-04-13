---
name: config-parser
kind: service
---

requires:
- config-path: path to configuration file

ensures:
- config: parsed and validated configuration
- if config is invalid: default configuration with warning about which fields used defaults

errors:
- no-config: configuration file not found and no defaults available
