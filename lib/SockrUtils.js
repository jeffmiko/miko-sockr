
class SockrUtils {

  static checkBroadcast(context, all=false) {
    if (!context) throw new Error("The context is missing.")
    if (!context.response) throw new Error("The context must have a response property.")
    if (!context.response.data) throw new Error("The context response must have a data property.")
    
    // make sure a response header exists
    if (!context.response.header) {
      // use request header if exists or empty object
      if (context.request && context.request.header)
        context.response.header = context.request.header
      else
        context.response.header = {}
    }

    if (all) delete context.response.header.origin
    else if (!context.response.header.origin) {
      if (context.client && context.client.id)
        context.response.header.origin = context.client.id
      else if (context.request && context.request.header && context.request.header.origin)
        context.response.header.origin = context.request.header.origin
    }

    if (!context.response.header.channel && context.request && context.request.header && context.request.header.channel) {
      context.response.header.channel = context.request.header.channel
    }

    return context

  }

  
  static async redisGetJSON(redis, key) {
    return new Promise((resolve,reject) => {
      redis.get(key, function(err, res) {
        try {
          if (err) reject(err)
          else resolve(JSON.parse(res))
        } catch (error) {
          reject(error)
        }
      })
    })
  }

  static async redisSetJSON(redis, key, value, ttl) {
    return new Promise((resolve,reject) => {
      try {
        let text = JSON.stringify(value)
        if (ttl) {
          redis.setex(key, ttl, text, function(err, res) {
            if (err) reject(err)
            else resolve(res)
          })
        } else {
          redis.set(key, text, function(err, res) {
            if (err) reject(err)
            else resolve(res)
          })
        }
      } catch (error) {
        reject(error)
      }
    })
  }


}

module.exports = SockrUtils
module.exports.SockrUtils = SockrUtils
