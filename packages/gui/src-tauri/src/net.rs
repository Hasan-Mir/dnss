use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream, UdpSocket};
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

fn rcode_name(rcode: u16) -> &'static str {
    match rcode {
        1 => "FORMERR",
        2 => "SERVFAIL",
        3 => "NXDOMAIN",
        4 => "NOTIMP",
        5 => "REFUSED",
        _ => "ERROR",
    }
}

/// Skip a DNS wire-format name (regular labels or RFC 1035 compression pointer).
/// Rejects reserved label bit patterns (`0x40` / `0x80`) and truncated pointers.
fn skip_dns_name(response: &[u8], mut offset: usize) -> Result<usize, String> {
    loop {
        if offset >= response.len() {
            return Err("Malformed DNS name".to_string());
        }
        let length = response[offset];
        offset += 1;
        if length == 0 {
            return Ok(offset);
        }
        match length & 0xC0 {
            0xC0 => {
                if offset >= response.len() {
                    return Err("Truncated DNS compression pointer".to_string());
                }
                return Ok(offset + 1);
            }
            0x00 => {
                let next = offset + length as usize;
                if next > response.len() {
                    return Err("Truncated DNS label".to_string());
                }
                offset = next;
            }
            _ => {
                return Err("Invalid DNS label type".to_string());
            }
        }
    }
}

/// Parse a DNS response and return the first A-record IPv4 address.
/// `expected_id` must match the response transaction ID to protect against
/// forged/spoofed UDP replies.
fn parse_a_record(response: &[u8], expected_id: u16) -> Result<Ipv4Addr, String> {
    if response.len() < 12 {
        return Err("Malformed DNS response (truncated header)".to_string());
    }

    // Transaction ID must match the query we sent.
    let response_id = u16::from_be_bytes([response[0], response[1]]);
    if response_id != expected_id {
        return Err("Mismatched DNS transaction ID".to_string());
    }

    // QR flag (bit 15 of flags) must be set: this must be a response.
    let flags = u16::from_be_bytes([response[2], response[3]]);
    if flags & 0x8000 == 0 {
        return Err("DNS packet is not a response".to_string());
    }

    // RCODE (low nibble of second flags byte) must be NOERROR.
    let rcode = flags & 0x000F;
    if rcode != 0 {
        return Err(format!(
            "DNS error: {} (RCODE {})",
            rcode_name(rcode),
            rcode
        ));
    }

    let question_count = u16::from_be_bytes([response[4], response[5]]) as usize;
    let mut offset = 12usize;
    for _ in 0..question_count {
        offset = skip_dns_name(response, offset)?;
        if offset + 4 > response.len() {
            return Err("Truncated DNS question section".to_string());
        }
        offset += 4; // skip QTYPE and QCLASS
    }

    let answer_count = u16::from_be_bytes([response[6], response[7]]) as usize;
    if answer_count == 0 {
        return Err("No A record in DNS response".to_string());
    }

    for _ in 0..answer_count {
        offset = skip_dns_name(response, offset)?;

        if offset + 10 > response.len() {
            return Err("Truncated DNS answer record".to_string());
        }
        let r#type = u16::from_be_bytes([response[offset], response[offset + 1]]);
        let rdlength = u16::from_be_bytes([response[offset + 8], response[offset + 9]]) as usize;
        offset += 10;

        if offset + rdlength > response.len() {
            return Err("Truncated DNS answer RDATA".to_string());
        }
        if r#type == 1 && rdlength == 4 {
            return Ok(Ipv4Addr::new(
                response[offset],
                response[offset + 1],
                response[offset + 2],
                response[offset + 3],
            ));
        }
        offset += rdlength;
    }
    Err("No valid A record in DNS response".to_string())
}

/// Validate an IPv4 address string.
pub fn parse_ipv4(value: &str) -> Option<std::net::Ipv4Addr> {
    value.trim().parse::<std::net::Ipv4Addr>().ok()
}

/// Returns true for RFC 2544 benchmarking range 198.18.0.0/15, widely used
/// by sing-box / Clash / v2ray TUN FakeIP pools.
fn is_fakeip_range(address: Ipv4Addr) -> bool {
    let o = address.octets();
    o[0] == 198 && (18..=19).contains(&o[1])
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
        || is_fakeip_range(address) // 198.18.0.0/15
        || (o[0] == 192 && o[1] == 0 && o[2] == 2) // 192.0.2.0/24 (doc)
        || (o[0] == 198 && o[1] == 51 && o[2] == 100) // 198.51.100.0/24 (doc)
        || (o[0] == 203 && o[1] == 0 && o[2] == 113) // 203.0.113.0/24 (doc)
        || o[0] == 0 // 0.0.0.0/8 ("this network")
}

/// Measure DNS resolve latency through `server` and the TCP/HTTP probe latency
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

    // 1232 bytes avoids Winsock WSAEMSGSIZE on larger EDNS/CNAME chains.
    let mut response = [0u8; 1232];
    let received = socket.recv(&mut response).map_err(|e| match e.kind() {
        std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock => {
            "DNS query timed out".to_string()
        }
        _ => format!("DNS query failed: {}", e),
    })?;
    let resolve_ms = started.elapsed().as_millis() as u64;

    let address = parse_a_record(&response[..received], query_id)?;

    // Never connect to loopback / link-local / unspecified / private / FakeIP
    // addresses. Provide an explicit message for 198.18.0.0/15 FakeIP pools
    // so users running sing-box / Clash TUN mode immediately see why the
    // benchmark was intercepted.
    if is_fakeip_range(address) {
        return Err(format!(
            "VPN FakeIP detected ({}); pause VPN/TUN mode to measure real DNS latency",
            address
        ));
    }
    if is_disallowed_target(address) {
        return Err(format!(
            "Resolver returned a suspicious address ({}); refusing to connect",
            address
        ));
    }
    let address_str = address.to_string();

    // Measure TCP connect latency (plus HTTP status verification for port 80).
    let target_addr = SocketAddr::from((address, port));
    let connect_start = Instant::now();
    let connect_ms = match TcpStream::connect_timeout(&target_addr, Duration::from_secs(5)) {
        Ok(mut stream) => {
            if port == 80 {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(4)));
                let _ = stream.set_write_timeout(Some(Duration::from_secs(4)));
                let req = format!(
                    "HEAD / HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
                    hostname
                );
                if stream.write_all(req.as_bytes()).is_err() {
                    return Ok((resolve_ms, None, address_str));
                }
                let mut buf = [0u8; 64];
                match stream.read(&mut buf) {
                    Ok(0) | Err(_) => return Ok((resolve_ms, None, address_str)),
                    Ok(n) => {
                        let status_line_end = buf[..n]
                            .iter()
                            .position(|&b| b == b'\n')
                            .unwrap_or(n);
                        let status_line = String::from_utf8_lossy(&buf[..status_line_end]);
                        let status = status_line
                            .split_whitespace()
                            .nth(1)
                            .and_then(|code| code.parse::<u16>().ok());
                        if status == Some(403) {
                            return Err(format!("Blocked (HTTP 403) via {}", address_str));
                        }
                        if let Some(code) = status {
                            if code >= 500 {
                                return Err(format!(
                                    "Target returned HTTP {} via {}",
                                    code, address_str
                                ));
                            }
                        }
                    }
                }
            }
            Some(connect_start.elapsed().as_millis() as u64)
        }
        Err(_) => None,
    };

    Ok((resolve_ms, connect_ms, address_str))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_standard_a_record_and_handles_qdcount_zero() {
        // Minimal response: ID=0x1234, QR=1, RCODE=0, QDCOUNT=0, ANCOUNT=1, A=104.16.132.229
        let resp = [
            0x12, 0x34, 0x81, 0x80, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
            0x01, b'a', 0x00, // name "a."
            0x00, 0x01, // TYPE A
            0x00, 0x01, // CLASS IN
            0x00, 0x00, 0x00, 0x3c, // TTL
            0x00, 0x04, // RDLENGTH
            104, 16, 132, 229,
        ];
        assert_eq!(
            parse_a_record(&resp, 0x1234),
            Ok(Ipv4Addr::new(104, 16, 132, 229))
        );
    }

    #[test]
    fn rejects_invalid_rcode_and_reserved_label_bits() {
        let nxdomain = [
            0x12, 0x34, 0x81, 0x83, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        assert!(parse_a_record(&nxdomain, 0x1234).unwrap_err().contains("NXDOMAIN"));

        let bad_label = [
            0x12, 0x34, 0x81, 0x80, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
            0x40, 0x00, 0x00, 0x01, 0x00, 0x01,
        ];
        assert!(parse_a_record(&bad_label, 0x1234).is_err());
    }

    #[test]
    fn detects_fakeip_and_disallowed_ranges() {
        assert!(is_fakeip_range(Ipv4Addr::new(198, 18, 0, 1)));
        assert!(is_fakeip_range(Ipv4Addr::new(198, 19, 255, 254)));
        assert!(!is_fakeip_range(Ipv4Addr::new(198, 17, 255, 255)));
        assert!(!is_fakeip_range(Ipv4Addr::new(198, 20, 0, 1)));

        assert!(is_disallowed_target(Ipv4Addr::new(127, 0, 0, 1)));
        assert!(is_disallowed_target(Ipv4Addr::new(100, 64, 0, 1)));
        assert!(is_disallowed_target(Ipv4Addr::new(169, 254, 169, 254)));
        assert!(is_disallowed_target(Ipv4Addr::new(198, 18, 0, 1)));
        assert!(!is_disallowed_target(Ipv4Addr::new(104, 16, 132, 229)));
    }
}
