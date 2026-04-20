---
name: config-parser
kind: service
---

### Requires

- config-path: path to configuration file

### Ensures

- config: parsed and validated configuration
- if config is invalid: default configuration with warning about which fields used defaults

### Errors

- no-config: configuration file not found and no defaults available
