const WebSocket = require('ws');
const SockrApp = require("../lib/SockrApp")
const SockrService = require("../lib/SockrService")
const SockrRedisApp = require("../lib/SockrRedisApp")
const http = require("http")
const { SockrBeforeHooks, SockrAfterHooks } = require("../lib/SockrHookUtils")

const app = new SockrApp()
//const app = new SockrRedisApp()

app.redirect(/\/status.*/i, async (websocket, request) => {
  console.log("redirect", request.url, websocket.id)
  let data = JSON.stringify(app.getStatus(), null, 2)
  websocket.send(data)
  websocket.close()
  request.socket.destroy()  
})
 
setTimeout(() => {
  const wstest = new WebSocket('ws://localhost:8080/status');
  wstest.on('open', function open() {
  });
  wstest.on('message', function incoming(data) {
    console.log("status recv:",data);
  });  
}, 5000)


// can attach to an http/https server
const httpServer = http.createServer();
app.attach(httpServer)
httpServer.listen(8080);
// can also just call listen
//app.listen(8080);

app.on("connection", (websocket, request) => {
  console.log("connected", websocket.id)
})
app.on("close", (websocket, request) => {
  console.log("closed", websocket.id)
})
app.on("error", (websocket, request, error, context) => {
  console.log("server error", error)
})


const cars = new SockrService()
cars.find = function(params) { 
  console.log("find params", params)
  return {
    forSale: 123
  }
}
let lastClient = {}
app.use("cars", cars)
app.hooks().before(SockrBeforeHooks.addStartTime())
app.hooks().before(async(context)=> console.log("app before any service method"))
app.hooks().after(async(context)=> console.log("app after all service methods"))
app.hooks().after(SockrAfterHooks.addStopTime())
app.hooks().after(SockrAfterHooks.addElapsedTime())
app.service("cars").hooks().before(async(context)=> console.log("cars before all method"))
app.service("cars").hooks().before(SockrBeforeHooks.stripParams(["updatedat","createdat"]))
app.service("cars").hooks().after(async(context)=> console.log("cars after all methods"))
app.service("cars").hooks("find").before(async (context) => console.log("cars before find method"))
app.service("cars").hooks("find").after(async (context) => {
  console.log("cars after find method")
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
  console.log("client recv:",obj);
});

setTimeout(() => {
  let msg = {
    header: {
      service: "cars",
      method: "find",
    },
    params: {
      make: "ford",
      model: "ranger",
      createdat: new Date()
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

setTimeout(() => ws.close(), 12000)
setTimeout(() => {
  app.close()
  if (typeof httpServer !== undefined) httpServer.close()
}, 12500)
