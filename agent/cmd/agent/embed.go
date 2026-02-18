package main

import _ "embed"

// embeddedConfig holds the YAML configuration embedded at build time.
// The embed_config.yaml file is a staging file that build scripts overwrite
// with the target machine's configuration before compiling.
//
//go:embed embed_config.yaml
var embeddedConfig []byte
