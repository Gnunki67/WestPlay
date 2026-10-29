//! Loopback-only cabin server. The cabin is loaded over local HTTP so the supplied
//! Local Radio stations can retain their HTTP streams without disabling browser security.
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicUsize, Ordering},
};
use std::time::Duration;

pub struct LocalServer {
    stopped: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    pub url: String,
}

impl LocalServer {
    pub fn start(root: &Path) -> std::io::Result<Self> {
        Self::start_at(root, 18331)
    }
    #[cfg(test)]
    pub fn start_for_test(root: &Path) -> std::io::Result<Self> {
        Self::start_at(root, 0)
    }
    fn start_at(root: &Path, port: u16) -> std::io::Result<Self> {
        // Stable origin keeps the player's radio favourites and cabin preferences between runs.
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))?;
        let url = format!("http://127.0.0.1:{}", listener.local_addr()?.port());
        listener.set_nonblocking(true)?;
        let root = root.canonicalize()?;
        let radio = Arc::new(crate::radio_relay::RadioRelay::new(&root)?);
        let stopped = Arc::new(AtomicBool::new(false));
        let stop = stopped.clone();
        let active = Arc::new(AtomicUsize::new(0));
        let thread = std::thread::Builder::new().name("westplay-local-server".into()).spawn(move || {
            while !stop.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        if active.load(Ordering::Acquire) >= 24 {
                            continue;
                        }
                        let root = root.clone();
                        let radio = radio.clone();
                        let active = active.clone();
                        active.fetch_add(1, Ordering::AcqRel);
                        let _ = std::thread::spawn(move || {
                            if let Err(error) = serve(stream, &root, &radio) {
                                log!("[local-server] request failed: {error}");
                                #[cfg(test)]
                                eprintln!("local server: {error}");
                            }
                            active.fetch_sub(1, Ordering::AcqRel);
                        });
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(15))
                    }
                    Err(_) => break,
                }
            }
        })?;
        Ok(Self { stopped, thread: Some(thread), url })
    }
}
impl Drop for LocalServer {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn resolve(root: &Path, request: &str) -> Option<PathBuf> {
    let raw = request.split('?').next()?;
    let mut bytes = Vec::new();
    let mut chars = raw.bytes();
    while let Some(byte) = chars.next() {
        bytes.push(if byte == b'%' {
            let pair = [chars.next()?, chars.next()?];
            u8::from_str_radix(std::str::from_utf8(&pair).ok()?, 16).ok()?
        } else {
            byte
        });
    }
    let decoded = String::from_utf8(bytes).ok()?;
    let relative = Path::new(decoded.trim_start_matches('/'));
    if relative.components().any(|part| !matches!(part, Component::Normal(_))) {
        return None;
    }
    let path = root.join(relative).canonicalize().ok()?;
    (path.starts_with(root) && path.is_file()).then_some(path)
}
fn serve(mut stream: TcpStream, root: &Path, radio: &crate::radio_relay::RadioRelay) -> std::io::Result<()> {
    // Windows inherits the listener's nonblocking mode on accepted sockets.
    stream.set_nonblocking(false)?;
    stream.set_read_timeout(Some(Duration::from_secs(3)))?;
    stream.set_write_timeout(Some(Duration::from_secs(10)))?;
    let mut request = Vec::new();
    let mut buffer = [0u8; 2048];
    while request.len() < 16384 {
        let read = stream.read(&mut buffer)?;
        if read == 0 {
            return Ok(());
        }
        request.extend_from_slice(&buffer[..read]);
        if request.windows(4).any(|part| part == b"\r\n\r\n") {
            break;
        }
    }
    let header = String::from_utf8_lossy(&request);
    let mut first = header.lines().next().unwrap_or("").split_whitespace();
    let method = first.next().unwrap_or("");
    let target = first.next().unwrap_or("");
    // Reject DNS rebinding and methods with side effects; serve only the packaged UI directory.
    let expected_host = format!("Host: 127.0.0.1:{}", stream.local_addr()?.port());
    let host_ok = header.lines().any(|line| line.eq_ignore_ascii_case(&expected_host));
    if !host_ok || !matches!(method, "GET" | "HEAD") {
        return stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    }
    if target.starts_with("/radio-stream?") {
        let range = header.lines().find_map(|line| {
            line.split_once(':').filter(|(name, _)| name.eq_ignore_ascii_case("range")).map(|(_, value)| value.trim())
        });
        return radio.serve(&mut stream, target, method, range);
    }
    let Some(path) = resolve(root, target) else {
        return stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    };
    let mime = match path.extension().and_then(|s| s.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "mp3" => "audio/mpeg",
        _ => "application/octet-stream",
    };
    let mut file = std::fs::File::open(path)?;
    write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
        file.metadata()?.len()
    )?;
    if method == "GET" {
        std::io::copy(&mut file, &mut stream)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn serves_packaged_assets_but_rejects_escape_paths() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src").canonicalize().unwrap();
        assert!(resolve(&root, "/local_server.rs?v=1").is_some());
        for path in ["/../Cargo.toml", "/%2e%2e/Cargo.toml", "/C:/Windows/win.ini", "/..%5cCargo.toml"] {
            assert!(resolve(&root, path).is_none(), "{path}");
        }
    }
}
