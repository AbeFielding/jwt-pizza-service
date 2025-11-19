import { sleep, check } from 'k6'
import http from 'k6/http'
import jsonpath from 'https://jslib.k6.io/jsonpath/1.0.2/index.js'

export const options = {
  cloud: {
    distribution: { 'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 100 } },
    apm: [],
  },
  thresholds: {},
  scenarios: {
    Scenario_1: {
      executor: 'ramping-vus',
      gracefulStop: '30s',
      stages: [
        { target: 20, duration: '1m' },
        { target: 20, duration: '3m30s' },
        { target: 0, duration: '1m' },
      ],
      gracefulRampDown: '30s',
      exec: 'scenario_1',
    },
  },
}

export function scenario_1() {
  let response
  const vars = {}

  //
  // LOGIN
  //
  response = http.put(
    'https://pizza-service.afield98.click/api/auth',
    JSON.stringify({
      email: "d@jwt.com",
      password: "diner"
    }),
    {
      headers: { 'Content-Type': 'application/json' }
    }
  )

  check(response, { 'status equals 200': r => r.status === 200 })

  vars.authToken = jsonpath.query(response.json(), '$.token')[0]

  //
  // MENU
  //
  response = http.get(
    'https://pizza-service.afield98.click/api/order/menu',
    {
      headers: {
        Authorization: `Bearer ${vars.authToken}`
      }
    }
  )

  check(response, { 'status equals 200': r => r.status === 200 })

  //
  // ORDER
  //
  response = http.post(
    'https://pizza-service.afield98.click/api/order',
    JSON.stringify({
      items: [
        { menuId: 1, description: "Veggie", price: 0.0038 },
        { menuId: 1, description: "Veggie", price: 0.0038 },
        { menuId: 2, description: "Pepperoni", price: 0.0042 },
        { menuId: 2, description: "Pepperoni", price: 0.0042 },
        { menuId: 2, description: "Pepperoni", price: 0.0042 }
      ],
      storeId: "1",
      franchiseId: 1
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vars.authToken}`
      }
    }
  )

  check(response, { 'status equals 200': r => r.status === 200 })

  vars.pizzaJwt = jsonpath.query(response.json(), '$.jwt')[0]

  //
  // VERIFY
  //
  response = http.post(
    'https://pizza-factory.cs329.click/api/order/verify',
    JSON.stringify({
      jwt: vars.pizzaJwt
    }),
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )

  check(response, { 'status equals 200': r => r.status === 200 })

  sleep(1)
}