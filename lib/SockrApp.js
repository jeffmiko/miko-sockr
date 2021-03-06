const WebSocket = require('ws');
const crypto = require("crypto");
const http = require("http")
const SockrHooks  = require("./SockrHooks")
const SockrAuth  = require("./SockrAuth")
const SockrParser  = require("./SockrParser")
const SockrChannel = require("./SockrChannel")
const SockrUtils = require("./SockrUtils")

function noop() {}
function heartbeat() { this.isAlive = true }


class SockrApp extends SockrHooks {
  #methods = {}
  #services = {}
  #channels = {}
  #server = null
  #pingInterval = null 
  #channelInterval = null
  #httpServer = null

  constructor(options = {}) {
    super()
    // read-only id property
    Object.defineProperty(this, "id", {
      value: crypto.randomBytes(16).toString('hex') 
    });
    if (!options.auth) options.auth = SockrAuth.jwt()
    Object.defineProperty(this, "auth", {
      value: options.auth
    });    
    if (!options.parser) options.parser = SockrParser.json()
    Object.defineProperty(this, "parser", {
      value: options.parser
    });    
  }

  use(name, service, methods) {
    if (!methods) {
      methods = new Set();
      let currentObj = service
      do {
        if (["SockrHooks", "Object"].includes(currentObj.constructor.name)) break
        Object.getOwnPropertyNames(currentObj).map(name => {
          if (name != "constructor" && typeof currentObj[name] === "function" ) {
            methods.add(name)
          }
        })
      } while ((currentObj = Object.getPrototypeOf(currentObj)))
      if (methods.size == 0) throw new TypeError("No instance methods found.")
    } else if (!Array.isArray(methods)) {
      throw new TypeError("The methods parameter must be an array.")
    } else if (methods.length == 0) {
      throw new TypeError("No instance methods found.")
    } else {
      // check to make sure service has methods
      for(let m of methods) {
        if (typeof service[m] !== "function") {
          throw new TypeError(`The service does not contain a ${m} method.`)
        }
      }
    }
    this.#methods[name] = methods 
    this.#services[name] = service
    return this
  }

  service(name) {
    let svc =  this.#services[name]
    if (!svc) throw new TypeError(`The service ${name} could not be found.`)
    return svc
  }

  #pingHandler() {
    try {
      this.#server.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();     
        ws.isAlive = false;
        ws.ping(noop);
      });
    } catch {}
  }

  #channelHandler() {
    try {
      for(let key of Object.keys(this.#channels)) {
        if (!this.#channels[key].hasClients()) {
          delete this.#channels[key]
        }
      }
    } catch {}
  }

  #onClose() {
    if (this.#pingInterval) {
      clearInterval(this.#pingInterval)
      this.#pingInterval = null
    }
    if (this.#channelInterval) {
      clearInterval(this.#channelInterval)
      this.#channelInterval = null
    }
  }

  async #onConnect(websocket, request) {
    // assign unique id to socket
    websocket.id = crypto.randomBytes(16).toString('hex')
    try {
      // authenticate if needed
      if (this.auth) await this.auth(websocket, request)
    } catch (error) {
      websocket.close(1008, "Unauthorized")
      request.socket.destroy()
      this.emit("unauthorized", websocket, request, error )
      return    
    }

    try {
      // url property read-only and not available on server side
      // so override it
      Object.defineProperty(websocket, "url", {
        get: function () { return request.url }
      });      
      websocket.ip = request.socket.remoteAddress
      if (request.headers['x-forwarded-for']) {
        websocket.ip = request.headers['x-forwarded-for'].split(/\s*,\s*/)[0];
      }        
    } catch (e) { console.log(e) }

    // add heart beat
    websocket.isAlive = true;
    websocket.on('pong', heartbeat);

    // fire connection event
    this.emit("connection", websocket, request )

    if (websocket.readyState === WebSocket.CONNECTING || 
        websocket.readyState === WebSocket.OPEN) {

      // process messages
      websocket.on('message', async function(data) {
        try {
          let context = await this.parser(data)
          context.client = websocket
          context.startTime = Date.now()
          await this.dispatch(context)            
        } catch (error) {
          this.emit("error", websocket, request, error )           
        }
      }.bind(this))

      // handle client close/disconnect
      websocket.on('close', function() { 
        try {
          // leave all channels on disconnect
          for(let ch of this.channelScan(websocket)) {
            try {
              ch.leave(ws)
            } catch {  }
          }
          this.emit("close", websocket, request )
        } catch (error) { 
          this.emit("error", websocket, request, error )
        }
      }.bind(this))
    }
  }

  #onUpgrade(request, socket, head) {
    this.#server.handleUpgrade(request, socket, head, function(websocket) {
      this.#server.emit('connection', websocket, request);
    }.bind(this));
  }

  attach(httpServer) {
    if (this.#server) throw new Error("Already attached to an http server.")
    this.#server = new WebSocket.Server({ noServer: true });
    this.#server.on('connection', this.#onConnect.bind(this))
    this.#server.on('close', this.#onClose.bind(this))
    this.#pingInterval = setInterval(this.#pingHandler, 30000)
    this.#channelInterval = setInterval(this.#channelHandler, 90000)
    httpServer.on('upgrade', this.#onUpgrade.bind(this))
  }

  listen(port) {
    if (this.#server || this.#httpServer) throw new Error("Already attached to an http server.")
    this.#httpServer = http.createServer();
    this.attach(this.#httpServer)
    this.#httpServer.listen(port);
  }

  close() {
    if (this.#server) {
      this.#server.close()
      this.#server = null
    }
    if (this.#httpServer) {
      this.#httpServer.close()
      this.#httpServer = null
    }
  }

  async dispatch(context) {
    let errorfn = this.#errorHandler.bind(this)
    errorfn = this.hooks().error() || errorfn
    if (!context) context = { error: new Error("A null or undefined context was dispatched.") }
    if (!context.app) context.app = this
    if (!context.error) {
      try {
        
        if (!context.client) throw new TypeError("No client found.")
        if (!context.request) throw new TypeError("No request found.")
        if (!context.request.header) throw new TypeError("No header found on request.")
        if (!context.request.header.service) throw new TypeError("No service found on message header.")
        if (!context.request.header.method) throw new TypeError("No method found on message header.")

        if (!context.request.header.id) context.request.header.id = crypto.randomBytes(16).toString('hex')
        context.response.header = context.request.header
        
        let header = context.request.header 
        // check for service
        let service = this.#services[header.service]
        if (!service) throw new TypeError(`Service ${header.service} not found`)
        errorfn = service.hooks().error() || errorfn

        // check for method
        let method = this.#methods[header.service].has(header.method)
        if (!method) throw new TypeError(`Method ${header.method} not found in service ${header.service}`)
        errorfn = service.hooks(header.method).error() || errorfn

        // before hooks = app, service, method
        for(let fn of this.hooks().before()) {
          await fn(context)
          if (context.stop) return context
        }
        for(let fn of this.hooks(header.method).before()) {
          await fn(context)
          if (context.stop) return context
        }        
        for(let fn of service.hooks().before()) {
          await fn(context)
          if (context.stop) return context
        }
        for(let fn of service.hooks(header.method).before()) {
          await fn(context)
          if (context.stop) return context
        }
        
        // service call
        if (context.response.data === undefined)
          context.response.data = await service[header.method](context.request.params)
        if (context.stop) return context

        // after hooks - method, service, app
        for(let fn of service.hooks(header.method).after()) {
          await fn(context)
          if (context.stop) return context
        }
        for(let fn of service.hooks().after()) {
          await fn(context)
          if (context.stop) return context
        }
        for(let fn of this.hooks(header.method).after()) {
          await fn(context)
          if (context.stop) return context
        }        
        for(let fn of this.hooks().after()) {
          await fn(context)
          if (context.stop) return context
        }

        // send response to client if exists
        if (context.response && context.response.data) {
          let json = JSON.stringify(context.response)
          context.client.send(json)
        }

      } catch (error) {
        try {
          context.error = error
          await errorfn(context)
        } catch { }
      }
    } else {
      try {
        await errorfn(context)
      } catch { }
    }
    return context
  }

  #errorHandler(context) {
    // TODO: pass in request?
    this.emit("error", context.client, null, context.error, context) 
    if (!context.stop) {
      let msg = { header: context.request.header }
      if (context.error) {
        msg.error = {
          name: context.error.name || "UnknownError",
          message: context.error.statusText || context.error.message || "Unknown server error",
          code: context.error.status || context.error.statusCode || context.error.code || 500
        }
      } else {
        msg.error = {
          name: "UnknownError",
          message: "Unknown server error",
          code: 500
        }
      }
      try {
        let json = JSON.stringify(msg)
        context.client.send(json)          
      } catch {
      }
    }
  }

  broadcast(context, all=false) {
    context = SockrUtils.checkBroadcast(context, all)
    let list = []
    let data = JSON.stringify(context.response)
    if (context.response.header.channel) {
      list = this.channel(context.response.header.channel).getClients()
    } else {
      list = this.#server.clients.values()
    }

    for(let client of list) {
      if (context.response.header.origin && client.id == context.response.header.origin) continue;
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    }
    return this
  }

  all(context) {
    return this.broadcast(context, true)
  }

  channel(name) {
    if (!this.#channels[name]) {
      let ch = new SockrChannel(
        name, 
        this.broadcast.bind(this)
      )
      // surface events to app listeners
      ch.on("joined", (websocket, name) => this.emit("joined", websocket, name) )
      ch.on("left", (websocket, name) => this.emit("left", websocket, name) )
      this.#channels[name] = ch
    }
    return this.#channels[name]
  }  

  channelScan(client) {
    let result = []
    for(let ch of Object.values(this.#channels)) {
      if (ch.hasJoined(client)) result.push(ch)
    }
    return result
  }


}


module.exports = SockrApp
module.exports.SockrApp = SockrApp
module.exports.SockrAuth = SockrAuth
