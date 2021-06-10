const jwt = require("jsonwebtoken")
const qs = require("querystring");


class SockrAuth {

  static jwt(options) {
    if (!options) options = { }
    if (typeof options !== "object") throw new TypeError("The options must be an object.")
    options = Object.assign({
      property: "user",
      header: "authorization",
      query: "token",
      algorithm: "HS256",
      complete: true,
    }, options)

    let jwtoptions = { }
    if (options.algorithms) jwtoptions.algorithms=options.algorithms
    else if (options.algorithm) jwtoptions.algorithms=[options.algorithm]
    if (options.audience) jwtoptions.audience=options.audience
    if (options.issuer) jwtoptions.issuer=options.issuer
    if (options.complete) jwtoptions.complete=options.complete
    if (options.maxAge) jwtoptions.maxAge=options.maxAge
    if (options.ignoreExpiration) jwtoptions.complete=options.ignoreExpiration

    let reHeader = null
    if (/authorization/i.test(options.header)) {
      // authorization or proxy-authorization header
      reHeader = new RegExp("(?:basic|bearer)\s*(?<jwt>.*)", "i")
    }

    return async function(ws, req) {
      let token = null

      if (!token && options.header && req.headers && req.headers[options.header]) {
        token = req.headers[options.header].trim()
        if (reHeader) {
          let m = reHeader.exec(token)
          if (m && m.groups && m.groups.jwt) token = m.groups.jwt.trim()
        }
      } 
      if (!token && options.query && req.url) {
        let pos = req.url.indexOf("?")
        if (pos) {
          let params = qs.parse(req.url.substr(pos+1)) 
          if (params[options.query]) token = params[options.query]
        }
      }
      
      if (!token) throw new Error("Authorization token not found.")

      let decoded = {}
      if (options.secret) decoded = jwt.verify(token, options.secret, options)
      else decoded = jwt.decode(token, options)

      // check
      if (!decoded.header) throw new jwt.JsonWebTokenError("The token header is missing.")
      if (decoded.header.typ != "JWT") throw new jwt.JsonWebTokenError("The token header type must be JWT.")
      if (jwtoptions.audience && jwtoptions.audience !== decoded.payload.aud) 
        throw new jwt.JsonWebTokenError("The JWT audience does not match.")
      if (jwtoptions.issuer && jwtoptions.issuer !== decoded.payload.iss) 
        throw new jwt.JsonWebTokenError("The JWT issuer does not match.")
      if (!jwtoptions.algorithms.includes(decoded.header.alg)) 
        throw new jwt.JsonWebTokenError("The JWT algorithm does not match.")

      ws[options.property] = decoded.payload

    }
    

  }

  /*
  * Open access authentication. Suggest only use in development.
  */
  static anybody() {
    return async function(ws, req) {
    }
  }

}


module.exports = SockrAuth
module.exports.SockrAuth = SockrAuth
