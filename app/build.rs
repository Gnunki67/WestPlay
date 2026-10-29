fn main() {
    // A release without Tauri's custom protocol still navigates to build.devUrl,
    // even though Rust's debug assertions are off. Never allow that binary to ship.
    if std::env::var("PROFILE").as_deref() == Ok("release")
        && std::env::var_os("CARGO_FEATURE_CUSTOM_PROTOCOL").is_none()
    {
        panic!("Packaged builds require --features westplay-app/custom-protocol (or use tools/build-local.ps1)");
    }
    // The app bundles the built UI (`ui/dist`, tauri.conf.json's resources), which `tauri build` makes first
    // (`npm run build:release`) and which isn't in the repository. Without it, `cargo check` or `cargo test`
    // on a fresh clone would fail here: an empty folder stands in until the UI is built.
    let dist = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../ui/dist");
    if !dist.exists() {
        std::fs::create_dir_all(&dist).expect("creating ui/dist");
    }
    tauri_build::build()
}
