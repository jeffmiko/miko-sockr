const WebSocket = require('ws');
const SockrApp = require("../lib/SockrApp")
const SockrService = require("../lib/SockrService")
const SockrRedisApp = require("../lib/SockrRedisApp")


//const app = new SockrApp()
const app = new SockrRedisApp()
app.listen(8080)
app.on("connection", ({client, request}) => {
  console.log("connected", client.id)
})
app.on("error", ({error, client, request}) => {
  console.log("server error", error)
})

const cars = new SockrService()
cars.find = function(params) { 
  return {
    forSale: 123
  }
}
let lastClient = {}
app.use("cars", cars)
app.hooks().before(async(context)=> console.log("app before"))
app.hooks().after(async(context)=> console.log("app after"))
app.service("cars").hooks().before(async(context)=> console.log("cars before"))
app.service("cars").hooks().after(async(context)=> console.log("cars after"))
app.service("cars").hooks("find").before(async (context) => console.log("cars find before"))
app.service("cars").hooks("find").after(async (context) => {
  console.log("cars find after")
  lastClient = context.client
  app.channel(channel).join(context.client)
})


//////////////////////////////////////////////////////////////////
// CLIENT connections
//////////////////////////////////////////////////////////////////
const token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE2MTQ0MzU4MjcsImV4cCI6MjI3NzEyNDU0MSwiYXVkIjoid3d3LmV4YW1wbGUuY29tIiwic3ViIjoianJvY2tldEBleGFtcGxlLmNvbSIsIkdpdmVuTmFtZSI6IkpvaG5ueSIsIlN1cm5hbWUiOiJSb2NrZXQiLCJFbWFpbCI6Impyb2NrZXRAZXhhbXBsZS5jb20iLCJSb2xlIjpbIk1hbmFnZXIiLCJQcm9qZWN0IEFkbWluaXN0cmF0b3IiXX0.7jL9tG6Yq0gjOG-mFwCP7KuCtqfr8akqWZY7_ctY5Nw"
const channel = "contexts/12"
const ws = new WebSocket('ws://localhost:8080?token='+token);
ws.on('message', function incoming(data) {
  let obj = JSON.parse(data)
  console.log("client recv",obj);
});

setTimeout(() => {
  let msg = {
    header: {
      service: "cars",
      method: "find",
    },
    params: {
      make: "ford",
      model: "ranger"
    }
  }
  ws.send(JSON.stringify(msg));
}, 2000)

setTimeout(() => {
  // TODO: Broadcast
  let context = {
    response: {
      header: {
        channel: channel,
        service: "contexts", 
        method: "left",
        //origin: lastClient.id,
      },
      data: {
        user: "John Smith"
      }
    }
  }  
  app.channel(channel).send(context.response)
}, 5000)

setTimeout(() => {
  ws.close()
  app.close()
}, 12000)
