#!/bin/bash

echo "Cleaning up sandbox network ..."

NETWORK_ID=$(docker network inspect sandbox-network -f '{{.Id}}' 2>/dev/null | cut -c1-12)
SANDBOX_BRIDGE="br-${NETWORK_ID}"

echo "Removing iptables rules ..."
iptables -D DOCKER-USER -i $SANDBOX_BRIDGE -j SANDBOX-FILTER 2>/dev/null || echo "  Rule not found in DOCKER-USER"

# Flush and delete the custom chain
iptables -F SANDBOX-FILTER 2>/dev/null || echo "  SANDBOX-FILTER chain not found"
iptables -X SANDBOX-FILTER 2>/dev/null || echo "  SANDBOX-FILTER chain already deleted"

# Remove Docker network
echo "Removing Docker network ..."
docker network rm sandbox-network 2>/dev/null || echo "  Network not found or in use"

echo "Cleanup complete"
