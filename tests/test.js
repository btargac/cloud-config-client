"use strict";

const Client = require("..");
const http = require("http");
const https = require("https");
const fs = require("fs");
const assert = require("assert");
const PORT = 15023;
const HTTPS_PORT = PORT + 1;
const ENDPOINT = "http://localhost:" + PORT;
const HTTPS_ENDPOINT = "https://localhost:" + HTTPS_PORT;
const AUTH = "Basic dXNlcm5hbWU6cGFzc3dvcmQ=";

const DATA = {
    name: "application",
    profiles: [ "default" ],
    label: "master",
    propertySources: [{
        name: "file:///myapp.yml",
        source:  {
            "key01": "value01",
            "key03": null,
            "key04.key01": 42
        }
    }, {
        name: "file:///application.yml",
        source:  {
            "key01": "banana",
            "key02": 2
        }
    }]
};

let lastURL = null;
let lastHeaders = null;

const server = http.createServer((req, res) => {
    lastURL = req.url;
    lastHeaders = req.headers;
    res.end(JSON.stringify(DATA));
});

const httpsOptions = {
  key: fs.readFileSync('tests/key.pem'),
  cert: fs.readFileSync('tests/cert.pem')
}

const httpsServer = https.createServer(httpsOptions, (req, res) => {
    lastURL = req.url;
    lastHeaders = req.headers;
    res.end(JSON.stringify(DATA));
});

server.on("clientError", (err, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

function basicAssertions(config) {
    assert.strictEqual(lastURL, "/application/test%2Ctimeout");
    assert.strictEqual(config.get("key01"), "value01");
    assert.strictEqual(config.get("key02"), 2);
    assert.strictEqual(config.get("key03"), null);
    assert.strictEqual(config.get("missing"), undefined);
    assert.strictEqual(config.get("key04.key01"), 42);
    assert.strictEqual(config.get("key04", "key01"), 42);
}

function basicTest() {
    return Client.load({
        endpoint: ENDPOINT,
        profiles: ["test", "timeout"],
        name: "application"
    }).then(basicAssertions);
}

function httpsSimpleTest() {
    return Client.load({
        endpoint: HTTPS_ENDPOINT,
        profiles: ["test", "timeout"],
        name: "application"
    }).then(basicAssertions);
}

function deprecatedTest() {
    return Client.load({
        endpoint: ENDPOINT,
        profiles: ["test", "timeout"],
        application: "application"
    }).then((config) => {
        assert.strictEqual(lastURL, "/application/test%2Ctimeout");
    });
}

function explicitAuth() {
    return Client.load({
        endpoint: ENDPOINT,
        application: "application",
        auth: { user: "username", pass: "password" }
    }).then((config) => {
        assert.strictEqual(lastHeaders.authorization, AUTH);
        assert.strictEqual(lastURL, "/application/default");
        assert.strictEqual(config.get("key02"), 2);
    });
}

function implicitAuth() {
    return Client.load({
        endpoint: "http://username:password@localhost:" + PORT,
        application: "application"
    }).then((config) => {
        assert.strictEqual(lastHeaders.authorization, AUTH);
        assert.strictEqual(lastURL, "/application/default");
        assert.strictEqual(config.get("key02"), 2);
    });
}

function labelTest() {
    return Client.load({
        endpoint: ENDPOINT,
        application: "application",
        label: "develop"
    }).then((config) => {
        assert.strictEqual(lastURL, "/application/default/develop");
        assert.strictEqual(config.get("key02"), 2);
    });
}

function forEachTest() {
    return Client.load({
        endpoint: ENDPOINT,
        profiles: ["test", "timeout"],
        name: "application"
    }).then((config) => {
        let counter = 0;
        config.forEach((key, value) => counter++);
        assert.strictEqual(counter, 4);
        counter = 0;
        config.forEach((key, value) => counter++, true);
        assert.strictEqual(counter, 5);
    });
}


function contextPathTest() {
    return Client.load({
        endpoint: ENDPOINT + "/justapath",
        name: "mightyapp"
    }).then((config) => {
        assert.strictEqual(lastURL, "/justapath/mightyapp/default");
    });
}


function proccessError(e) {
    console.error(e);
    process.exitCode = 1;
}

server.listen(PORT, () => {
    Promise.resolve()
    .then(basicTest)
    .then(deprecatedTest)
    .then(explicitAuth)
    .then(implicitAuth)
    .then(labelTest)
    .then(forEachTest)
    .then(contextPathTest)
    .then(() => console.log("HTTP OK :D"))
    .catch(proccessError)
    .then(() => server.close());
});

httpsServer.listen(HTTPS_PORT, () => {
    Promise.resolve()
    .then(httpsSimpleTest)
    .then(() => console.log("HTTPS OK :D"))
    .catch(proccessError)
    .then(() => httpsServer.close());
});