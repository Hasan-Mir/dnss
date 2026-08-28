/**
 * Validate an IPv4 address (4 dot-separated octets, each 0-255).
 */
export function validateIPv4(ip: string): boolean {
    const parts = ip.trim().split('.');
    if (parts.length !== 4) return false;
    return parts.every((part) => {
        // Canonical decimal only: leading zeros are rejected because POSIX
        // inet_aton parses them as octal ("010.0.0.1" -> "8.0.0.1") and
        // Rust's Ipv4Addr parser rejects them outright.
        if (!/^(0|[1-9]\d{0,2})$/.test(part)) return false;
        const num = Number(part);
        return num >= 0 && num <= 255;
    });
}

/**
 * Basic IPv6 validation (full, compressed and mixed forms).
 * Good enough for input validation of user-provided DNS servers.
 */
export function validateIPv6(ip: string): boolean {
    const value = ip.trim().toLowerCase();

    // Mixed IPv4-mapped form (e.g. ::ffff:192.168.0.1)
    const lastColon = value.lastIndexOf(':');
    const tail = value.slice(lastColon + 1);
    const head = value.slice(0, lastColon + 1);
    if (tail.includes('.')) {
        if (!validateIPv4(tail)) return false;
        return isIPv6Body(head + '0:0');
    }
    return isIPv6Body(value);
}

function isIPv6Body(value: string): boolean {
    if (value.length === 0 || value.length > 45) return false;
    const doubleColonCount = (value.match(/::/g) || []).length;
    if (doubleColonCount > 1) return false;

    const groups = value.split(':');
    // A single "::" is valid (all-zero address)
    if (doubleColonCount === 1) {
        const [left, right] = value.split('::');
        const leftGroups = left ? left.split(':') : [];
        const rightGroups = right ? right.split(':') : [];
        return (
            leftGroups.every((g) => isHexGroup(g)) &&
            rightGroups.every((g) => isHexGroup(g)) &&
            leftGroups.length + rightGroups.length <= 7
        );
    }
    if (groups.length !== 8) return false;
    return groups.every((g) => isHexGroup(g));
}

function isHexGroup(group: string): boolean {
    return /^[0-9a-f]{1,4}$/.test(group);
}
