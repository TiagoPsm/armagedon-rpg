const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp"
};

let server = null;
let baseUrl = "";

async function getMesaBaseUrl() {
  if (process.env.MESA_TEST_URL) return process.env.MESA_TEST_URL.replace(/\/+$/, "");
  if (baseUrl) return baseUrl;

  server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
    const target = path.resolve(repoRoot, pathname.replace(/^\/+/, ""));

    if (!target.startsWith(repoRoot) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": contentTypes[path.extname(target).toLowerCase()] || "application/octet-stream"
    });
    fs.createReadStream(target).pipe(response);
  });

  await new Promise(resolve => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  return baseUrl;
}

async function closeMesaTestServer() {
  if (!server) return;
  await new Promise(resolve => server.close(resolve));
  server = null;
  baseUrl = "";
}

module.exports = {
  closeMesaTestServer,
  getMesaBaseUrl
};
