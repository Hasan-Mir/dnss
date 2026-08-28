use std::net::{Ipv4Addr, TcpStream, UdpSocket};
use std::time::{Duration, Instant};

/// Build a minimal DNS A-record query packet (RD=1, single question).
fn build_query(id: u16, hostname: &str) -> Vec<u8> {
    let mut packet = Vec::with_capacity(64);
    packet.extend_from_slice(&id.to_be_bytes());
    packet.extend_from_slice(&[0x01, 0x00]); // flags: recursion desired
    packet.extend_from_slice(&[0x00, 0x01]); // QDCOUNT = 1
    packet.extend_from_slice(&[0x00, 0x00]); // ANCOUNT
    packet.extend_from_slice(&[0x00, 0x00]); // NSCOUNT
    packet.extend_from_slice(&[0x00, 0x00]); // ARCOUNT

    for label in hostname.split('.') {
        if label.is_empty() {
            continue;
        }
        packet.push(label.len() as u8);
        packet.extend_from_slice(label.as_bytes());
    }
    packet.extend_from_slice(&[0x00]); // root label
    packet.extend_from_slice(&[0x00, 0x01]); // QTYPE = A
    packet.extend_from_slice(&[0x00, 0x01]); // QCLASS = IN
    packet
}

/// Parse a DNS response and return the first A-record IPv4 address.
/// `expected_id` must match the response transaction ID to protect against
/// forged/spoofed UDP replies.
fn parse_a_record(response: &[u8], expected_id: u16) -> Option<Ipv4Addr> {
    if response.len() < 12 {
        return None;
    }

    // Transaction ID must match the query we sent.
    let response_id = u16::from_be_bytes([response[0], response[1]]);
    if response_id != expected_id {
        return None;
    }

    // QR flag (bit 15 of flags) must be set: this must be a response.
    let flags = u16::from_be_bytes([response[2], response[3]]);
    if flags & 0x8000 == 0 {
        return None;
    }

    // RCODE (low nibble of second flags byte) must be NOERROR.
    if flags & 0x000F != 0 {
        return None;
    }

    let question_end = {
        let mut offset = 12usize;
        loop {
            if offset >= response.len() {
                return None;
            }
            let length = response[offset];
            offset += 1;
            if length == 0 {
                break;
            }
            offset += length as usize;
        }
        offset + 4 // skip QTYPE and QCLASS
    };

    let answer_count = u16::from_be_bytes([response[6], response[7]]) as usize;
    if answer_count == 0 {
        return None;
    }
    let mut offset = question_end;

    for _ in 0..answer_count {
        // Skip the name (handles compression pointers).
        loop {
            if offset >= response.len() {
                return None;
            }
            let length = response[offset];
            offset += 1;
            if length == 0 {
                break;
            }
            if length & 0xC0 == 0xC0 {
                offset += 1; // pointer is 2 bytes, we consumed 1 above
                break;
            }
            offset += length as usize;
        }

        if offset + 10 > response.len() {
            return None;
        }
        let r#type = u16::from_be_bytes([response[offset], response[offset + 1]]);
        let rdlength = u16::from_be_bytes([response[offset + 8], response[offset + 9]]) as usize;
        offset += 10;

        if r#type == 1 && rdlength == 4 && offset + 4 <= response.len() {
            return Some(Ipv4Addr::new(
                response[offset],
                response[offset + 1],
                response[offset + 2],
                response[offset + 3],
            ));
        }
        offset += rdlength;
    }
    None
}

/// Validate an IPv4 address string.
pub fn parse_ipv4(value: &str) -> Option<std::net::Ipv4Addr> {
    value.trim().parse::<std::net::Ipv4Addr>().ok()
}

/// Addresses that must never be TCP-probed. The std `is_private()` does
/// not cover CGNAT (100.64.0.0/10), benchmarking (198.18.0.0/15),
/// documentation ranges, multicast, broadcast or 0.0.0.0/8 — without these
/// checks a renderer-controlled resolver could turn the benchmark into a
/// reachability probe into carrier-internal space.
fn is_disallowed_target(address: Ipv4Addr) -> bool {
    let o = address.octets();
    address.is_loopback()
        || address.is_link_local()
        || address.is_private()
        || address.is_multicast()
        || address.is_broadcast()
        || address.is_unspecified()
        || (o[0] == 100 && (o[1] & 0xC0) == 0x40) // 100.64.0.0/10 (CGNAT)
        || (o[0] == 198 && (18..=19).contains(&o[1])) // 198.18.0.0/15
        || (o[0] == 192 && o[1] == 0 && o[2] == 2) // 192.0.2.0/24 (doc)
        || (o[0] == 198 && o[1] == 51 && o[2] == 100) // 198.51.100.0/24 (doc)
        || (o[0] == 203 && o[1] == 0 && o[2] == 113) // 203.0.113.0/24 (doc)
        || o[0] == 0 // 0.0.0.0/8 ("this network")
}

/// Measure DNS resolve latency through `server` and the TCP connect latency
/// to the resolved address. Returns (resolve_ms, connect_ms, resolved_ip).
pub fn benchmark_dns(
    server: &str,
    hostname: &str,
    port: u16,
) -> Result<(u64, Option<u64>, String), String> {
    let server_ip = parse_ipv4(server).ok_or_else(|| format!("Invalid DNS server: {}", server))?;

    // Mix time with the pid and stir: a pure wall-clock derived ID is
    // trivially predictable for an on-path spoofer. The connected UDP socket
    // (kernel-level source filtering) remains the primary anti-spoofing
    // measure; this just widens the ID space.
    let query_id: u16 = {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0);
        let mut mixed = nanos ^ ((std::process::id() as u64) << 32);
        mixed ^= mixed >> 16;
        mixed = mixed.wrapping_mul(0x45d9f3b);
        mixed ^= mixed >> 16;
        let id = mixed as u16;
        if id == 0 { 1 } else { id }
    };

    let packet = build_query(query_id, hostname);
    let socket = UdpSocket::bind("0.0.0.0:0")
        .map_err(|e| format!("Failed to bind UDP socket: {}", e))?;
    socket
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;

    // Connect the socket to the resolver endpoint so the kernel drops
    // datagrams from any other source; recv_from would otherwise accept
    // spoofed replies sent from arbitrary peers.
    socket
        .connect((server_ip, 53))
        .map_err(|e| format!("Failed to connect to DNS server: {}", e))?;

    let started = Instant::now();
    socket
        .send(&packet)
        .map_err(|e| format!("Failed to send DNS query: {}", e))?;

    let mut response = [0u8; 512];
    let received = socket
        .recv(&mut response)
        .map_err(|_| "DNS query timed out".to_string())?;
    let resolve_ms = started.elapsed().as_millis() as u64;

    let address = parse_a_record(&response[..received], query_id)
        .ok_or_else(|| "No valid A record in DNS response".to_string())?;

    // Never connect to loopback / link-local / unspecified / private
    // addresses. The renderer controls the "resolver" argument, so allowing
    // private ranges would turn the benchmark into a LAN reachability/port
    // probe. Public resolvers never answer the hardcoded probe hostname
    // with a private address, so nothing legitimate is lost.
    if is_disallowed_target(address) {
        return Err(format!(
            "Resolver returned a suspicious address ({}); refusing to connect",
            address
        ));
    }
    let address = address.to_string();

    // Measure TCP connect latency to the resolved IP (connect without TLS).
    let connect_start = Instant::now();
    let connect_ms = TcpStream::connect_timeout(
        &format!("{}:{}", address, port)
            .parse()
            .map_err(|e| format!("Invalid address: {}", e))?,
        Duration::from_secs(5),
    )
    .ok()
    .map(|_| connect_start.elapsed().as_millis() as u64);

    Ok((resolve_ms, connect_ms, address))
}
