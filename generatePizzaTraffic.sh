#!/bin/bash

# Ensure host is passed as parameter
if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 http://localhost:3000"
  exit 1
fi

host=$1

# Kill background processes on exit
trap 'echo "Stopping traffic simulation..."; kill $(jobs -p)' EXIT

echo "Simulating traffic against $host"

# Menu requests every 3 seconds
while true; do
  curl -s $host/api/order/menu > /dev/null
  sleep 3
done &

# Invalid login every 25 seconds
while true; do
  curl -s -X PUT $host/api/auth -d '{"email":"unknown@jwt.com", "password":"bad"}' \
    -H 'Content-Type: application/json' > /dev/null
  sleep 25
done &

# Login → Buy pizza → Logout cycle
while true; do
  response=$(curl -s -X PUT $host/api/auth -d '{"email":"d@jwt.com", "password":"diner"}' \
    -H 'Content-Type: application/json')
  token=$(echo $response | jq -r '.token')
  curl -s -X POST $host/api/order \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $token" \
    -d '{"franchiseId": 1, "storeId": 1, "items": [{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}' \
    > /dev/null
  sleep 20
  curl -s -X DELETE $host/api/auth -H "Authorization: Bearer $token" > /dev/null
  sleep 30
done &

# Trigger pizza creation failure (too many pizzas)
while true; do
  response=$(curl -s -X PUT $host/api/auth -d '{"email":"d@jwt.com", "password":"diner"}' \
    -H 'Content-Type: application/json')
  token=$(echo $response | jq -r '.token')
  echo "Login hungry diner..."

  items='{ "menuId": 1, "description": "Veggie", "price": 0.05 }'
  for (( i=0; i<21; i++ )); do
    items+=', { "menuId": 1, "description": "Veggie", "price": 0.05 }'
  done

  curl -s -X POST $host/api/order \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $token" \
    -d "{\"franchiseId\": 1, \"storeId\": 1, \"items\":[$items]}" \
    > /dev/null

  echo "Bought too many pizzas..."
  sleep 5
  curl -s -X DELETE $host/api/auth -H "Authorization: Bearer $token" > /dev/null
  echo "Logging out hungry diner..."
  sleep 295
done &

wait
