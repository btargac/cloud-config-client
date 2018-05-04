'use strict'

const Client = require('..')
const http = require('http')
const https = require('https')
const fs = require('fs')
const assert = require('assert')
const PORT = 15023
const HTTPS_PORT = PORT + 1
const ENDPOINT = 'http://localhost:' + PORT
const HTTPS_ENDPOINT = 'https://localhost:' + HTTPS_PORT
const AUTH = 'Basic dXNlcm5hbWU6cGFzc3dvcmQ='

const DATA = {
  name: 'application',
  profiles: ['default'],
  label: 'master',
  propertySources: [{
    name: 'file:///myapp.yml',
    source: {
      'key01': 'value01',
      'key03': null,
      'key04.key01': 42
    }
  }, {
    name: 'file:///application.yml',
    source: {
      'key01': 'banana',
      'key02': 2
    }
  }]
}

const COMPLEX_DATA_1 = {
  name: 'application',
  profiles: ['default'],
  label: 'master',
  propertySources: [{
    name: 'file:///myapp.yml',
    source: {
      'key01': 'value01',
      'key02': null,
      'key03.key01[0]': 1,
      'key03.key01[1].data': 2,
      'key03.key02': 3,
      'key04.key01': 42
    }
  }]
}
const COMPLEX_DATA_2 = {
  'name': 'complex',
  'profiles': [
    'default'
  ],
  'label': null,
  'version': 'f692c32698e97d995321f9efb0048271ef8e4b1c',
  'state': null,
  'propertySources': [
    {
      'name': 'file:/Users/viktor/Downloads/configuration/application.yml',
      'source': {
        'data.key01[0][0]': 1,
        'data.key01[0][1]': 3,
        'data.key01[1][0]': 4,
        'data.key01[1][1]': 5
      }
    }
  ]
}

let lastURL = null
let lastHeaders = null

const server = http.createServer((req, res) => {
  lastURL = req.url
  lastHeaders = req.headers
  if (lastURL.startsWith('/complex_data1')) res.end(JSON.stringify(COMPLEX_DATA_1))
  else if (lastURL.startsWith('/complex_data2')) res.end(JSON.stringify(COMPLEX_DATA_2))
  else res.end(JSON.stringify(DATA))
})

const httpsOptions = {
  key: fs.readFileSync('tests/key.pem'),
  cert: fs.readFileSync('tests/cert.pem')
}

const httpsServer = https.createServer(httpsOptions, (req, res) => {
  lastURL = req.url
  lastHeaders = req.headers
  res.end(JSON.stringify(DATA))
})

server.on('clientError', (err, socket) => {
  console.error(err)
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
})

function basicAssertions (config) {
  assert.strictEqual(lastURL, '/application/test%2Ctimeout')
  assert.strictEqual(config.get('key01'), 'value01')
  assert.strictEqual(config.get('key02'), 2)
  assert.strictEqual(config.get('key03'), null)
  assert.strictEqual(config.get('missing'), undefined)
  assert.strictEqual(config.get('key04.key01'), 42)
  assert.strictEqual(config.get('key04', 'key01'), 42)
}

function basicTest () {
  return Client.load({
    endpoint: ENDPOINT,
    profiles: ['test', 'timeout'],
    name: 'application'
  }).then(basicAssertions)
}

function basicStringProfileTest () {
  return Client.load({
    endpoint: ENDPOINT,
    profiles: 'test,timeout',
    name: 'application'
  }).then(basicAssertions)
}

function httpsSimpleTest () {
  return Client.load({
    endpoint: HTTPS_ENDPOINT,
    rejectUnauthorized: false,
    profiles: ['test', 'timeout'],
    name: 'application'
  }).then(basicAssertions)
}

function httpsWithAgent () {
  const agent = new https.Agent()
  const old = agent.createConnection.bind(agent)
  let used = false
  agent.createConnection = function (options, callback) {
    used = true
    return old(options, callback)
  }
  return Client.load({
    endpoint: HTTPS_ENDPOINT,
    rejectUnauthorized: false,
    profiles: ['test', 'timeout'],
    name: 'application',
    agent
  }).then(basicAssertions)
    .then(() => {
      assert(used, 'Agent must be used in the call')
      agent.destroy()
    })
}

function httpsRejectionTest () {
  return Client.load({
    endpoint: HTTPS_ENDPOINT,
    profiles: ['test', 'timeout'],
    name: 'application'
  }).then(() => {
    throw new Error('No exception')
  }, () => { }) // just ignore
}

function deprecatedTest () {
  return Client.load({
    endpoint: ENDPOINT,
    profiles: ['test', 'timeout'],
    application: 'application'
  }).then((config) => {
    assert.strictEqual(lastURL, '/application/test%2Ctimeout')
  })
}

function explicitAuth () {
  return Client.load({
    endpoint: ENDPOINT,
    application: 'application',
    auth: { user: 'username', pass: 'password' }
  }).then((config) => {
    assert.strictEqual(lastHeaders.authorization, AUTH)
    assert.strictEqual(lastURL, '/application/default')
    assert.strictEqual(config.get('key02'), 2)
  })
}

function implicitAuth () {
  return Client.load({
    endpoint: 'http://username:password@localhost:' + PORT,
    application: 'application'
  }).then((config) => {
    assert.strictEqual(lastHeaders.authorization, AUTH)
    assert.strictEqual(lastURL, '/application/default')
    assert.strictEqual(config.get('key02'), 2)
  })
}

function labelTest () {
  return Client.load({
    endpoint: ENDPOINT,
    application: 'application',
    label: 'develop'
  }).then((config) => {
    assert.strictEqual(lastURL, '/application/default/develop')
    assert.strictEqual(config.get('key02'), 2)
  })
}

function forEachTest () {
  return Client.load({
    endpoint: ENDPOINT,
    profiles: ['test', 'timeout'],
    name: 'application'
  }).then((config) => {
    let counter = 0
    config.forEach((key, value) => counter++)
    assert.strictEqual(counter, 4)
    counter = 0
    config.forEach((key, value) => counter++, true)
    assert.strictEqual(counter, 5)
  })
}

function contextPathTest () {
  return Client.load({
    endpoint: ENDPOINT + '/justapath',
    name: 'mightyapp'
  }).then((config) => {
    assert.strictEqual(lastURL, '/justapath/mightyapp/default')
  })
}

function propertiesTest () {
  return Client.load({
    endpoint: ENDPOINT,
    profiles: ['test', 'timeout'],
    name: 'application'
  }).then(config => {
    const properties = config.properties
    assert.deepEqual(properties,
      { key01: 'value01', key02: 2, key03: null, 'key04.key01': 42 })
  })
}

function rawTest () {
  return Client.load({
    endpoint: ENDPOINT,
    profiles: ['test', 'timeout'],
    name: 'application'
  }).then(config => {
    const raw = config.raw
    assert.deepEqual(raw, DATA)
  })
}

function toObjectTest1 () {
  return Client.load({
    endpoint: ENDPOINT,
    profiles: ['test'],
    name: 'complex_data1'
  }).then(config => {
    const obj = config.toObject()
    assert.deepStrictEqual(obj, {
      key01: 'value01',
      key02: null,
      key03: { key01: [1, { data: 2 }], key02: 3 },
      key04: { key01: 42 }
    })
  })
}

function toObjectTest2 () {
  return Client.load({
    endpoint: ENDPOINT,
    profiles: ['test'],
    name: 'complex_data2'
  }).then(config => {
    const obj = config.toObject()
    assert.deepStrictEqual(obj, {
      data: { key01: [[1, 3], [4, 5]] }
    })
  })
}

function processError (e) {
  console.error(e)
  process.exitCode = 1
}

function httpTests () {
  return new Promise((resolve) => server.listen(PORT, resolve))
    .then(basicTest)
    .then(basicStringProfileTest)
    .then(deprecatedTest)
    .then(explicitAuth)
    .then(implicitAuth)
    .then(labelTest)
    .then(forEachTest)
    .then(contextPathTest)
    .then(propertiesTest)
    .then(rawTest)
    .then(toObjectTest1)
    .then(toObjectTest2)
    .then(() => console.log('HTTP OK :D'))
    .catch(processError)
    .then(() => server.close())
}

function httpsTests () {
  return new Promise((resolve) => httpsServer.listen(HTTPS_PORT, resolve))
    .then(httpsSimpleTest)
    .then(httpsRejectionTest)
    .then(httpsWithAgent)
    .then(() => console.log('HTTPS OK :D'))
    .catch(processError)
    .then(() => httpsServer.close())
}

httpTests().then(httpsTests).catch(processError)
