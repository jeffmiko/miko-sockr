const SockrApp  = require("./SockrApp")
const SockrUtils = require("./SockrUtils")
const redis = require("redis");

class SockrRedisApp extends SockrApp {
  
  #pub = null 
  #sub = null
  #options = {}

  constructor(options = {}) {
    super(options)
    // clone options rather then use options.redis
    this.#options = Object.assign({ }, options.redis)
    if (!this.#options.host) this.#options.host = "localhost"
    if (!this.#options.port) this.#options.port = 6379
    if (!this.#options.ttl) this.#options.ttl = 10800
    if (!this.#options.prefix) this.#options.prefix = "sockr#channels#"

    if (!this.#options.retry_strategy){
      if (options.redis.retry_strategy) { 
        this.#options.retry_strategy = options.redis.retry_strategy
      } else { 
        this.#options.retry_strategy = (opts) => {
          // try to reconnect forever
          // delay 500ms per cummulative attempts up to 5secs
          return Math.min(opts.attempt * 500, 5000);
        }
      }  
    }

    this.#pub = redis.createClient(this.#options)
    this.#sub = redis.createClient(this.#options)
    this.#sub.psubscribe(`${this.#options.prefix}*`, function(error){
      if (error) {
        error.redis = this.#options
        this.emit("error", error )           
      }
    }.bind(this));
    this.#sub.on('pmessage', this.#onChannelMessage.bind(this));


  }

  // Broadcast simply sends to Redis
  broadcast(context, all=false) {
    context = SockrUtils.checkBroadcast(context, all)
    let data = JSON.stringify(context.response)
    if (context.response.header.channel) {
      this.#pub.publish(`${this.#options.prefix}${context.response.header.channel}`, data)
    } else {
      this.#pub.publish(`${this.#options.prefix}`, data)
    }
    return this
  }


  #onChannelMessage(pattern, channel, data) {
    let response = JSON.parse(data)
    let ch = channel.substr(this.#options.prefix.length)
    // Call parent class broadcast to send to clients
    SockrApp.prototype.broadcast.call(this, {response})
  }


  close() {
    SockrApp.prototype.close.call(this)
    if (this.#pub) this.#pub.quit()
    if (this.#sub) this.#sub.quit()
  }

}


module.exports = SockrRedisApp
module.exports.SockrRedisApp = SockrRedisApp