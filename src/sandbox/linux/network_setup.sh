#!/bin/bash

# Create isolated Docker network for sandbox containers
docker network create \
  --driver bridge \
  --subnet 172.30.0.0/16 \
  --opt "com.docker.network.bridge.enable_ip_masquerade=true" \
  sandbox-network 2>/dev/null || echo "Network already exists"

SANDBOX_BRIDGE=$(docker network inspect sandbox-network -f '{{.Options."com.docker.network.bridge.name"}}' 2>/dev/null)

# If bridge name not set, Docker auto-generates it (usually br-<network-id>)
if [ -z "$SANDBOX_BRIDGE" ]; then
  NETWORK_ID=$(docker network inspect sandbox-network -f '{{.Id}}' | cut -c1-12)
  SANDBOX_BRIDGE="br-${NETWORK_ID}"
fi

echo "Sandbox network bridge: $SANDBOX_BRIDGE"

# Create custom chain for sandbox network rules
iptables -N SANDBOX-FILTER 2>/dev/null || iptables -F SANDBOX-FILTER

# Route sandbox network traffic through our custom chain
# This only affects traffic from sandbox-network, not other Docker networks
iptables -D DOCKER-USER -i $SANDBOX_BRIDGE -j SANDBOX-FILTER 2>/dev/null
iptables -I DOCKER-USER -i $SANDBOX_BRIDGE -j SANDBOX-FILTER

# Clear existing rules in our custom chain
iptables -F SANDBOX-FILTER

# Allow established / related connections first (for return traffic)
iptables -A SANDBOX-FILTER -m state --state ESTABLISHED,RELATED -j RETURN

# Allow DNS (required for name resolution)
iptables -A SANDBOX-FILTER -p udp --dport 53 -j RETURN
iptables -A SANDBOX-FILTER -p tcp --dport 53 -j RETURN

# Allow specific endpoints (example: GitHub API)
# Get IP addresses for allowed domains
echo "Resolving allowed endpoints ..."

GITHUB_API_IPS=$(dig +short api.github.com | grep -E '^[0-9.]+')

for ip in $GITHUB_API_IPS; do
  echo "  Allowing: $ip (api.github.com)"
  iptables -A SANDBOX-FILTER -d $ip -p tcp --dport 443 -j RETURN
  iptables -A SANDBOX-FILTER -d $ip -p tcp --dport 80 -j RETURN
done

# Default deny all other outbound traffic from sandbox network
iptables -A SANDBOX-FILTER -j DROP

echo "Sandbox network setup complete"
echo "Bridge interface: $SANDBOX_BRIDGE"
echo "Custom chain: SANDBOX-FILTER"
echo "Other Docker networks are unaffected"
echo "To view rules: iptables -L SANDBOX-FILTER -n -v"
echo "To remove: iptables -D DOCKER-USER -i $SANDBOX_BRIDGE -j SANDBOX-FILTER && iptables -F SANDBOX-FILTER && iptables -X SANDBOX-FILTER"
