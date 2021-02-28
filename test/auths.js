const SockrAuth = require("../lib/SockrAuth")

// JWT creator
// http://jwtbuilder.jamiekurtz.com/
console.log("Start auth tests")

const token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE2MTQ0MzU4MjcsImV4cCI6MjI3NzEyNDU0MSwiYXVkIjoid3d3LmV4YW1wbGUuY29tIiwic3ViIjoianJvY2tldEBleGFtcGxlLmNvbSIsIkdpdmVuTmFtZSI6IkpvaG5ueSIsIlN1cm5hbWUiOiJSb2NrZXQiLCJFbWFpbCI6Impyb2NrZXRAZXhhbXBsZS5jb20iLCJSb2xlIjpbIk1hbmFnZXIiLCJQcm9qZWN0IEFkbWluaXN0cmF0b3IiXX0.7jL9tG6Yq0gjOG-mFwCP7KuCtqfr8akqWZY7_ctY5Nw"
const auth = SockrAuth.jwt({
  property: "user",
  header: "authorization",
  query: "token",
  algorithm: "HS256",
  complete: true,
  secret: "qwertyuiopasdfghjklzxcvbnm123456",
})
const ws = {}
const req = {
  headers: { authorization: "Bearer "+token }, 
  url: "https://www.example.com?token="+token
}

auth(ws, req).then(() => console.log(ws.user))
