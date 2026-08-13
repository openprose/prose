#[cfg(not(target_arch = "wasm32"))]
fn main() -> anyhow::Result<()> {
    // All public command-surface decisions live in cli::run.
    let code = openprose_lint::cli::run(std::env::args().skip(1))?;
    std::process::exit(code);
}

// On wasm32 only the library (cdylib) is built for embedders; the native
// CLI binary is intentionally a no-op so `cargo build --target wasm32-...` succeeds.
#[cfg(target_arch = "wasm32")]
fn main() {}
