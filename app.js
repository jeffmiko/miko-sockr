const { SockrHooks } = require("./hooks")
const { SockrChannel } = require("./channels")
const jwt = require("jsonwebtoken");
const qs = require("querystring");
const crypto = require("crypto");

function noop() {}
function heartbeat() { this.isAlive = true; }

// events: connection, close, error, joining, joined, leaving, left

class SockrApp extends SockrHooks {
  #methods = {}
  #services = {}
  #channels = {}
  #id = null 
  #pub = null 
  #sub = null

  constructor(options = {}) {
    super()
    this.#id = crypto.randomBytes(16).toString('hex')
    if (options.redis) {
      const redis = require("redis");
      this.#pub = redis.createClient(options.redis)
      this.#sub = redis.createClient(options.redis)
      this.#sub.psubscribe("sockr#channels#*", function(err){
        //if (err) self.emit('error', err);
      });
      this.#sub.on('pmessage', this.#onChannelMessage.bind(this));
    }     
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


  // looks for JWT in query or header and verifies its good
  jwt(options) {
    let {header, query} = options
    if (!header && !query) {
      header = "Bearer"
      query = "token"
    }
    if (header) header = header.trim()+" "
    const socketProperty = options.socketProperty || "user"
    options.complete = true

    return async function(ws, req) {
      let token = null

      if (header && req.headers && req.headers.authentication && req.headers.authentication.startsWith(header)) {
        token = req.headers.authentication.substr(header.length)
      } else if (query) {
        let pos = req.url.indexOf("?")
        if (pos) {
          let params = qs.parse(req.url.substr(pos+1)) 
          if (params[query]) token = params[query]
        }
      }
      if (token) {
        if (options.decoder) {
          ws[socketProperty] = await options.decoder(token)
        } else {
          let decoded = jwt.verify(token, options.secret, options)
          ws[socketProperty] = decoded.payload
        }
      } else {
        throw new Error("Authorization token not found.")
      }      
    }
  }

  // parse JSON from client then dispatch
  json() {
    let app = this
    return function(text) {
      let context = {
        request: {},
        response: {},
        client: this,  // function called by WebSocket so this is WebSocket
        app: app,
      }
      try {
        let msg = JSON.parse(text)
        if (!msg) throw new TypeError("No message found.")
        if (msg.header) context.request.header = msg.header
        if (msg.params) context.request.params = msg.params
      } catch (error) {
        context.response.error = error
      }

      app.dispatch(context)
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
          context.response.error = error
          let json = JSON.stringify(context.response)
          context.client.send(json)
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
    this.emit("error", context) 
    if (!context.stop) {
      let msg = { header: context.header }
      if (context.error) {
        msg.error = {
          message: error.statusText || error.message || "Unknown server error",
          code: error.status || error.statusCode || 500
        }
      } else {
        msg.error = {
          message: "Unknown server error",
          code: 500
        }
      }
      try {
        let json = JSON.stringify(msg)
        context.client.send(json)          
      } catch { }
    }
  }




  /////////////////////////////////////////////////////////////////////////
  // SOCKET SPECIFIC
  /////////////////////////////////////////////////////////////////////////

  channelScan(client) {
    let result = []
    for(let ch of Object.values(this.#channels)) {
      if (ch.hasJoined(client)) result.push(ch)
    }
    return result
  }

  channel(name) {
    if (!this.#channels[name]) {
      let ch = new SockrChannel({
        name, 
        app: this, 
        id: this.#id, 
        broadcast: this.#broadcast
      })
      // surface events to app listeners
      ch.on("joining", (client, name) => this.emit("joining", client, name) )
      ch.on("joined", (client, name) => this.emit("joined", client, name) )
      ch.on("leaving", (client, name) => this.emit("leaving", client, name) )
      ch.on("left", (client, name) => this.emit("left", client, name) )
      this.#channels[name] = ch
    }
    return this.#channels[name]
  }

  #broadcast(context) {
    // if redis pub/sub enabled then process 
    if (context && context.channel && context.data && this.#pub) {
      try {
        let json = JSON.stringify(context)
        this.#pub.publish("sockr#channels#"+context.channel, json)
      } catch { }
    }
  }

  #onChannelMessage(pattern, channel, text) {
    try {
      channel = channel.substr(pattern.length-1)
      if (this.#channels[channel]) {
        let context = JSON.parse(text)
        if (context.channel && context.data) {
          this.#channels[channel].send(context.data, this)
        }
      }
    } catch { }
  }  

  server(wss, auth, handler) {
    const app = this
    if (!handler) handler = this.json()

    wss.on('connection', async (ws, req) => {

      // assign unique id to socket
      ws.id = crypto.randomBytes(16).toString('hex')

      try {
        if (auth) await auth(ws, req)
      } catch (error) {
        console.error(error)
        ws.close(1008, "Unauthorized")
        req.socket.destroy()
        return    
      }
      
      // add heart beat
      ws.isAlive = true;
      ws.on('pong', heartbeat);

      app.emit("connection", ws, req)

      // message handler
      ws.on('message', handler )
    
      // leave all channels
      ws.on('close', () => { 
        try {
          // leave all channels on disconnect
          for(let ch of app.channelScan(ws)) {
            try {
              ch.leave(ws)
            } catch {  }
          }
          app.emit("close", ws, req)          
        } catch { }
      });
    
    });

    // every 30 seconds ping clients to check connectivity
    const pingInterval = setInterval(() => {
      try {
        wss.clients.forEach(function each(ws) {
          if (ws.isAlive === false) return ws.terminate();     
          ws.isAlive = false;
          ws.ping(noop);
        });
      } catch {}
    }, 30000);
     
    // check channels every so often
    const channelInterval = setInterval(() => {
      try {
        for(let key of Object.keys(this.#channels)) {
          if (!this.#channels[key].hasClients()) {
            delete this.#channels[key]
          }
        }
      } catch {}
    }, 90000)

    wss.on('close', function close() {
      clearInterval(pingInterval);
      clearInterval(channelInterval);
    });

  }
 

}


module.exports.SockrApp = SockrApp
