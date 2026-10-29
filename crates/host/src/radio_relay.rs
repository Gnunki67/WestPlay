//! Same-origin radio streams for Web Audio. Only database stations and URLs named by
//! their HLS playlists may be requested; this is not an arbitrary URL proxy.
use reqwest::{Url, blocking::Client};
use std::collections::{HashSet, VecDeque};
use std::io::{self, Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

pub struct RadioRelay {
    client: Client,
    stations: HashSet<String>,
    children: Mutex<(HashSet<String>, VecDeque<String>)>,
}
impl RadioRelay {
    pub fn new(root: &Path) -> io::Result<Self> {
        let data: serde_json::Value = std::fs::read(root.join("local-radio/europe.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        let stations = data["stations"]
            .as_object()
            .into_iter()
            .flat_map(|countries| countries.values())
            .filter_map(|rows| rows.as_array())
            .flatten()
            .filter_map(|row| row["url"].as_str())
            .filter(|url| http_url(url).is_some())
            .map(str::to_owned)
            .collect();
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            // The blocking client's timeout applies separately to reads, not to the life of a station.
            .timeout(Duration::from_secs(20))
            .user_agent("WestPlay Radio FM")
            .build()
            .map_err(io::Error::other)?;
        Ok(Self { client, stations, children: Mutex::new((HashSet::new(), VecDeque::new())) })
    }
    fn allowed(&self, url: &str) -> bool {
        self.stations.contains(url) || self.children.lock().unwrap_or_else(|e| e.into_inner()).0.contains(url)
    }
    fn register(&self, base: &Url, reference: &str) -> Option<String> {
        let url = base.join(reference).ok()?;
        http_url(url.as_str())?;
        let url = url.to_string();
        if !self.stations.contains(&url) {
            let mut children = self.children.lock().unwrap_or_else(|e| e.into_inner());
            if children.0.insert(url.clone()) {
                children.1.push_back(url.clone());
            }
            while children.1.len() > 8192 {
                if let Some(old) = children.1.pop_front() {
                    children.0.remove(&old);
                }
            }
        }
        Some(format!("/radio-stream?url={}", encode(&url)))
    }
    fn playlist(&self, base: &Url, source: &str) -> String {
        source
            .lines()
            .map(|line| {
                if !line.trim().is_empty() && !line.starts_with('#') {
                    return self.register(base, line.trim()).unwrap_or_default();
                }
                // Encryption keys, alternate audio, init segments and iframe variants.
                let mut rest = line;
                let mut output = String::new();
                while let Some(start) = rest.find("URI=\"") {
                    let value = &rest[start + 5..];
                    let Some(end) = value.find('"') else { break };
                    output.push_str(&rest[..start + 5]);
                    output.push_str(&self.register(base, &value[..end]).unwrap_or_default());
                    output.push('"');
                    rest = &value[end + 1..];
                }
                output.push_str(rest);
                output
            })
            .collect::<Vec<_>>()
            .join("\n")
            + "\n"
    }
    pub fn serve(&self, stream: &mut TcpStream, target: &str, method: &str, range: Option<&str>) -> io::Result<()> {
        let url = Url::parse(&format!("http://127.0.0.1:18331{target}"))
            .ok()
            .and_then(|url| url.query_pairs().find(|(key, _)| key == "url").map(|(_, value)| value.into_owned()));
        let Some(url) = url.filter(|url| self.allowed(url)) else {
            return stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        };
        let mut request = if method == "HEAD" { self.client.head(&url) } else { self.client.get(&url) };
        if let Some(range) = range.filter(|range| range.starts_with("bytes=") && range.len() < 100) {
            request = request.header(reqwest::header::RANGE, range);
        }
        let mut response = match request.send().and_then(|response| response.error_for_status()) {
            Ok(response) => response,
            Err(_) => {
                return stream.write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            }
        };
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_owned();
        let is_playlist =
            content_type.to_ascii_lowercase().contains("mpegurl") || response.url().path().ends_with(".m3u8");
        if is_playlist && method != "HEAD" {
            let base = response.url().clone();
            let mut bytes = Vec::new();
            response.take(1_048_577).read_to_end(&mut bytes)?;
            if bytes.len() > 1_048_576 {
                return Err(io::Error::other("radio playlist too large"));
            }
            let source = std::str::from_utf8(&bytes).map_err(io::Error::other)?;
            if !source.trim_start().starts_with("#EXTM3U") {
                return Err(io::Error::other("invalid HLS playlist"));
            }
            let playlist = self.playlist(&base, source);
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/vnd.apple.mpegurl\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{playlist}",
                playlist.len()
            )?;
        } else {
            write!(
                stream,
                "HTTP/1.1 {}\r\nContent-Type: {content_type}\r\nCache-Control: no-store\r\nConnection: close\r\n",
                response.status()
            )?;
            for header in
                [reqwest::header::CONTENT_LENGTH, reqwest::header::CONTENT_RANGE, reqwest::header::ACCEPT_RANGES]
            {
                if let Some(value) = response.headers().get(&header).and_then(|value| value.to_str().ok()) {
                    write!(stream, "{header}: {value}\r\n")?;
                }
            }
            stream.write_all(b"\r\n")?;
            if method != "HEAD" {
                io::copy(&mut response, stream)?;
            }
        }
        Ok(())
    }
}
fn http_url(value: &str) -> Option<Url> {
    Url::parse(value).ok().filter(|url| matches!(url.scheme(), "http" | "https") && url.host_str().is_some())
}
fn encode(url: &str) -> String {
    url.bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || b"-_.~".contains(&byte) {
                char::from(byte).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn relays_audio_without_requiring_upstream_cors_and_refuses_unknown_stations() {
        use std::net::TcpListener;
        let upstream = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/station", upstream.local_addr().unwrap());
        let worker = std::thread::spawn(move || {
            let (mut stream, _) = upstream.accept().unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
            let mut request = Vec::new();
            let mut byte = [0];
            while stream.read(&mut byte).unwrap() > 0 {
                request.push(byte[0]);
                if request.ends_with(b"\r\n\r\n") { break; }
            }
            stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: audio/mpeg\r\nContent-Length: 4\r\nConnection: close\r\n\r\nFM12").unwrap();
        });
        let root = std::env::temp_dir().join(format!("westplay-radio-relay-{}", std::process::id()));
        std::fs::create_dir_all(root.join("local-radio")).unwrap();
        std::fs::write(root.join("local-radio/europe.json"), serde_json::json!({"stations":{"test":[{"url":url}]}}).to_string()).unwrap();
        let relay = RadioRelay::new(&root).unwrap();
        let request = |target: &str| {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let mut client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
            client.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
            let (mut server, _) = listener.accept().unwrap();
            relay.serve(&mut server, target, "GET", None).unwrap();
            drop(server);
            let mut bytes = Vec::new();
            client.read_to_end(&mut bytes).unwrap();
            bytes
        };
        let denied = request("/radio-stream?url=http%3A%2F%2Fother.test%2Fprivate");
        assert!(denied.starts_with(b"HTTP/1.1 403"));
        let response = request(&format!("/radio-stream?url={}", encode(&url)));
        assert!(response.starts_with(b"HTTP/1.1 200"));
        assert!(response.ends_with(b"FM12"));
        worker.join().unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn rewrites_hls_segments_keys_and_variants_but_rejects_unlisted_urls() {
        let relay = RadioRelay::new(Path::new("no-database")).unwrap();
        assert!(!relay.allowed("https://other.test/private"));
        let base = Url::parse("https://radio.test/live/index.m3u8").unwrap();
        let result = relay.playlist(&base, "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\n#EXT-X-MAP:URI=\"init.mp4\"\nsegment.ts\nhttps://cdn.test/next.m3u8\n");
        for url in [
            "https://radio.test/live/key.bin",
            "https://radio.test/live/init.mp4",
            "https://radio.test/live/segment.ts",
            "https://cdn.test/next.m3u8",
        ] {
            assert!(relay.allowed(url));
            assert!(result.contains(&encode(url)));
        }
        assert!(relay.register(&base, "file:///Windows/win.ini").is_none());
        assert!(!relay.allowed("https://other.test/private"));
    }
}
