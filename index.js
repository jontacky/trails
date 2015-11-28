'use strict'

const _ = require('lodash')
const Trailpack = require('trailpack')
const PackWrapper = require('./lib/packwrapper')
const events = require('events')

module.exports = class TrailsApp extends events.EventEmitter {

  constructor (app) {
    super()

    this.pkg = app.pkg
    this.config = app.config
    this.api = app.api
    this.packs = { }
    this.bound = false

    // increase listeners default
    this.setMaxListeners(64)
  }

  loadTrailpacks (packs) {
    let wrappers = packs.map(Pack => {
      if (! Pack instanceof Trailpack) {
        throw new TypeError('pack does not extend Trailpack', pack)
      }
      return new PackWrapper(Pack, this)
    })

    this.packs = _.indexBy(wrappers, wrapper => {
      return wrapper.pack.name
    })

    return this.validateTrailpacks()
      .then(() => this.configureTrailpacks())
      .then(() => this.initializeTrailpacks())
  }

  validateTrailpacks () {
    return Promise.all(_.map(_.omit(this.packs, 'inspect'), pack => {
      return pack.validate(this.pkg, this.config, this.api)
    }))
    .then(() => {
      this.emit('trailpack:all:validated')
      this.log.verbose('Trailpacks: All Validated.')
    })
  }

  configureTrailpacks () {
    return Promise.all(_.map(_.omit(this.packs, 'inspect'), pack => {
      return pack.configure()
    }))
    .then(() => {
      this.emit('trailpack:all:configured')
      this.log.verbose('Trailpacks: All Configured.')
    })
  }

  initializeTrailpacks () {
    return Promise.all(_.map(_.omit(this.packs, 'inspect'), pack => {
      return pack.initialize()
    }))
    .then(() => {
      this.emit('trailpack:all:initialized')
      this.log.verbose('Trailpacks: All Initialized.')
    })
  }

  /**
   * Start the App. Load and execute all Trailpacks.
   */
  start () {
    this.bindEvents()
    this.emit('trails:start')

    return this.loadTrailpacks(this.config.trailpack.packs)
      .then(() => {
        this.emit('trails:ready')
      })
      .catch(err => {
        console.error(err.stack)
        throw err
      })
  }

  /**
   * Pack up and go home. Everybody has 5s to clean up.
   */
  stop (code) {
    this.emit('trails:stop')
    this.removeAllListeners()
    process.exit(code || 0)
  }

  /**
   * Resolve Promise once all events in the list have emitted
   */
  after (events) {
    if (!Array.isArray(events)) {
      events = [ events ]
    }

    let eventPromises = events.map(eventName => {
      return new Promise(resolve => {
        this.once(eventName, event => {
          resolve(event)
        })
      })
    })

    return Promise.all(eventPromises)
  }

  /**
   * expose winston logger on global app object
   */
  get log() {
    return this.config.log.logger
  }

  bindEvents () {
    if (this.bound) {
      this.log.warn('trails-app: Someone attempted to bindEvents() twice!')
      this.log.warn(console.trace())
      return
    }

    this.once('trails:error:fatal', err => {
      this.stop(err)
    })

    this.bound = true
  }

}
