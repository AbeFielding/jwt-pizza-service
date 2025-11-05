#!/bin/bash
set -m
if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 https://pizza-service.afield98.click"
  exit 1
fi

host=$1

trap 'echo "Stopping traffic simulation..."; kill $(jobs -p) 2>/dev/null' EXIT

echo "🔥 Simulating traffic against $host ..."
echo "Press Ctrl+C to stop."

# Menu browsing
(
  while true; do
    curl -s "$host/api/order/menu" > /dev/null
    sleep $((2 + RANDOM % 4))
  done
) &

# Failed login attempts
(
  while true; do
    curl -s -X PUT "$host/api/auth" \
      -H 'Content-Type: application/json' \
      -d '{"email":"nobody@jwt.com","password":"wrong"}' > /dev/null
    sleep $((20 + RANDOM % 30))
  done
) &

# Normal order cycle
(
  while true; do
    response=$(curl -s -X PUT "$host/api/auth" \
      -H 'Content-Type: application/json' \
      -d '{"email":"d@jwt.com","password":"diner"}')

    token=$(echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$token" ] && [ "$token" != "null" ]; then
      menuId=$((1 + RANDOM % 5))
      curl -s -X POST "$host/api/order" \
        -H "Authorization: Bearer $token" \
        -H 'Content-Type: application/json' \
        -d "{\"franchiseId\":1,\"storeId\":1,\"items\":[{\"menuId\":$menuId,\"description\":\"Pizza $menuId\",\"price\":0.005}]}" \
        > /dev/null
      echo "✅ Diner placed order for Pizza $menuId"
      curl -s -X DELETE "$host/api/auth" -H "Authorization: Bearer $token" > /dev/null
    else
      echo "⚠️ Login failed (diner user may not exist)"
    fi
    sleep $((15 + RANDOM % 30))
  done
) &

# Large-order error scenario
(
  while true; do
    response=$(curl -s -X PUT "$host/api/auth" \
      -H 'Content-Type: application/json' \
      -d '{"email":"d@jwt.com","password":"diner"}')
    token=$(echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

    if [ -n "$token" ] && [ "$token" != "null" ]; then
      echo "💣 Stress test: large order submission"
      items=""
      for ((i=0; i<25; i++)); do
        items+="{\"menuId\":1,\"description\":\"Veggie\",\"price\":0.05},"
      done
      items="[${items::-1}]"
      curl -s -X POST "$host/api/order" \
        -H "Authorization: Bearer $token" \
        -H 'Content-Type: application/json' \
        -d "{\"franchiseId\":1,\"storeId\":1,\"items\":$items}" > /dev/null
      curl -s -X DELETE "$host/api/auth" -H "Authorization: Bearer $token" > /dev/null
    fi
    sleep 300
  done
) &

wait
